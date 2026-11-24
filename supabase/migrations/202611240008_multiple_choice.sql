-- Reserve WHO for portrait rounds. Move unillustrated clues into WHAT and
-- match distractors to the same catalog family (directors, authors, etc.).
create temporary table whirl_choice_backfill on commit drop as
with legacy as materialized (
 select q.id,q.topic_id,q.kind,q.status,q.presentation,q.solution,t.slug,t.title,t.subject,
  regexp_replace(t.slug,'^((bulk|catalog)-[^-]+)-.*$','\1') as family,
  q.solution->>'label' as answer,
  array(select public.whirl_normalize(value)
        from jsonb_array_elements_text(case when jsonb_typeof(q.solution->'aliases')='array'
             then q.solution->'aliases' else '[]'::jsonb end)) as accepted,
  abs(hashtext(t.slug)::bigint) as choice_offset
 from public.questions q join public.topics t on t.id=q.topic_id
 where q.status<>'deleted' and q.kind in ('who','what') and q.solution ? 'aliases'
), labels as materialized (
 select family,public.whirl_normalize(answer) normalized,min(answer) label
 from legacy where slug ~ '^(bulk|catalog)-' and status='published'
 and coalesce(trim(answer),'')<>''
 group by family,public.whirl_normalize(answer)
), families as materialized (
 select family,array_agg(label order by md5(normalized),normalized) choices,
  array_agg(normalized order by md5(normalized),normalized) normalized
 from labels group by family
), authored(slug,wrong) as (
 values
 ('extra-baguette','Brioche|Focaccia|Pumpernickel'),
 ('extra-blue-whale','Fin whale|Humpback whale|Sperm whale'),
 ('extra-capybara','Beaver|Porcupine|Mara'),
 ('extra-ceres','Pluto|Eris|Haumea'),
 ('extra-chess-knight','Bishop|Rook|Queen'),
 ('extra-chess-stalemate','Checkmate|Castling|Zugzwang'),
 ('extra-duck-billed-platypus','Echidna|Wombat|Bandicoot'),
 ('extra-echidna','Platypus|Porcupine|Hedgehog'),
 ('extra-emu','Cassowary|Greater rhea|Kiwi'),
 ('extra-giant-anteater','Giant armadillo|Capybara|Three-toed sloth'),
 ('extra-go-board','9|13|21'),
 ('extra-go-liberties','Eyes|Territory|Captures'),
 ('extra-great-wave','Utagawa Hiroshige|Kitagawa Utamaro|Utagawa Kuniyoshi'),
 ('extra-jupiter-red-spot','Saturn|Neptune|Uranus'),
 ('extra-kimjang','Natto|Miso|Tempeh'),
 ('extra-komodo-dragon','Green iguana|Gila monster|Nile monitor'),
 ('extra-mercury-orbit','Venus|Earth|Mars'),
 ('extra-mona-lisa-artist','Raphael|Michelangelo|Sandro Botticelli'),
 ('extra-mona-lisa-panel','Oak|Walnut|Pine'),
 ('extra-narwhal','Beluga whale|Bowhead whale|Orca'),
 ('extra-octopus-camouflage','Mimicry|Bioluminescence|Warning coloration'),
 ('extra-okapi','Bongo|Nyala|Forest buffalo'),
 ('extra-olympus-mons','Venus|Mercury|Earth'),
 ('extra-persistence-of-memory','René Magritte|Joan Miró|Max Ernst'),
 ('extra-pizzaiuolo','Focaccia|Risotto|Gnocchi'),
 ('extra-red-panda','Eucalyptus|Acacia|Willow'),
 ('extra-starry-night','Paul Gauguin|Claude Monet|Paul Cézanne'),
 ('extra-uranus-tilt','Saturn|Neptune|Jupiter'),
 ('extra-washoku','Kaiseki|Shōjin ryōri|Obanzai')
)
select q.*,
 coalesce(string_to_array(a.wrong,'|'),array(
  select f.choices[choice.position]
  from generate_series(0,least(cardinality(f.choices),cardinality(q.accepted)+4)-1) step(n)
  cross join lateral (select ((q.choice_offset+step.n)%nullif(cardinality(f.choices),0))::int+1 position) choice
  where f.normalized[choice.position]<>all(q.accepted)
   and f.normalized[choice.position]<>public.whirl_normalize(q.answer)
  order by step.n limit 3
 )) as distractors
from legacy q left join authored a on a.slug=q.slug left join families f on f.family=q.family;

-- If a user-authored topic already has a WHAT variant, keep both records.
insert into public.topics(slug,title,subject)
select 'choice-'||c.id,c.title,c.subject from whirl_choice_backfill c
where c.kind='who' and cardinality(c.distractors)=3 and exists(
 select 1 from public.questions other where other.topic_id=c.topic_id and other.kind='what' and other.status<>'deleted'
);

update public.questions q set
 kind='what',
 topic_id=coalesce(t.id,c.topic_id),
 presentation=(c.presentation - 'mechanic') || case when c.presentation ? 'images'
   then '{}'::jsonb else '{"mechanic":"choice"}'::jsonb end || jsonb_build_object('options',(
   select jsonb_agg(jsonb_build_object('id','opt-'||n,'label',label) order by n)
   from unnest(array_prepend(c.answer,c.distractors)) with ordinality as card(label,n)
 )),
 solution=(c.solution - 'aliases') || '{"correct":"opt-1"}'::jsonb
from whirl_choice_backfill c left join public.topics t on t.slug='choice-'||c.id
where q.id=c.id and cardinality(c.distractors)=3 and coalesce(trim(c.answer),'')<>'';

-- Custom clues without enough related choices stay editable in the review queue.
update public.questions q set status='review',verified_at=null,verified_by=null
from whirl_choice_backfill c where q.id=c.id and q.status='published' and q.solution ? 'aliases';

-- Refresh open, unanswered rounds only. Keep old submissions and scores intact.
with pending as materialized (
 select r.id,q.kind,public.whirl_materialize(q.kind,q.presentation,q.solution) as cards
 from public.rounds r join public.sessions s on s.id=r.session_id
 join public.questions q on q.id=r.question_id join whirl_choice_backfill c on c.id=q.id
 where s.finished_at is null and r.snapshot->'solution' ? 'aliases'
 and q.presentation ? 'options' and not q.solution ? 'aliases'
 and not exists(select 1 from public.submissions b where b.round_id=r.id)
)
update public.rounds r set snapshot=(r.snapshot || pending.cards || jsonb_build_object('kind',pending.kind))
from pending where r.id=pending.id;

alter function public.whirl_validate(text,jsonb,jsonb,text,text,text) rename to whirl_validate_country;
create function public.whirl_validate(kind text,p jsonb,s jsonb,explanation text,url text,title text)
returns text[] language plpgsql immutable set search_path='' as $$
declare errors text[];
begin
 if kind in ('who','what') and (p->>'mechanic'='text' or s ? 'aliases') then
  return array['Choose four portraits for WHO or four answer cards for WHAT.'];
 end if;
 if p->>'mechanic' is distinct from 'choice' then
  return public.whirl_validate_country(kind,p,s,explanation,url,title);
 end if;
 errors=public.whirl_validate_country('choice',p,s,explanation,url,title);
 if kind is distinct from 'what' or p ? 'images' then
  errors=array_append(errors,'Multiple choice without images is available for WHAT.');
 end if;
 if jsonb_typeof(p->'options') is distinct from 'array' then
  return array_append(errors,'Add four answer cards.');
 end if;
 if jsonb_array_length(p->'options')<>4
 or (select count(distinct nullif(trim(o->>'id'),'')) from jsonb_array_elements(p->'options') o)<>4
 or (select count(distinct nullif(public.whirl_normalize(o->>'label'),'')) from jsonb_array_elements(p->'options') o)<>4
 or not exists(select 1 from jsonb_array_elements(p->'options') o where o->'id'=s->'correct') then
  errors=array_append(errors,'Add four distinct answer cards and choose the correct card.');
 end if;
 return errors;
end; $$;
revoke all on function public.whirl_validate(text,jsonb,jsonb,text,text,text) from public,anon,authenticated;

create or replace function public.whirl_play(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if action='start' and p->>'mode' in ('course','assessment') then raise exception 'Choose a public quiz mode'; end if;
 if action='reveal' and exists(
  select 1 from public.rounds r join public.sessions s on s.id=r.session_id
  where r.id=(p->>'round')::uuid and s.id=(p->>'id')::uuid and s.user_id=auth.uid()
    and r.snapshot->'presentation'->>'mechanic' in ('text','choice')
 ) then raise exception 'This question has no image reveal'; end if;
 return public.whirl_play_internal(action,p);
end; $$;

-- Add two sets of selectable portraits from NASA's Image and Video Library.
with people(slug,group_id,subject,image,nasa_id,prompt,explanation,source_url) as (
 values
 ('mercury-john-glenn','mercury','John Glenn','a758956b86.jpg','S62-05540',
  'Which astronaut became the first American to orbit Earth aboard Friendship 7?',
  'John Glenn orbited Earth three times during the Friendship 7 mission in 1962.',
  'https://www.nasa.gov/wp-content/uploads/2023/04/sp-4004-1963.pdf'),
 ('mercury-scott-carpenter','mercury','Scott Carpenter','955c4592f8.jpg','S62-05538',
  'Which astronaut orbited Earth aboard the Mercury capsule Aurora 7?',
  'Scott Carpenter piloted Aurora 7 on May 24, 1962.',
  'https://www.nasa.gov/wp-content/uploads/2023/03/sp-4402.pdf'),
 ('mercury-alan-shepard','mercury','Alan Shepard','302f3da17c.jpg','S71-52263',
  'Which astronaut became the first American in space aboard Freedom 7?',
  'Alan Shepard made the suborbital Freedom 7 flight on May 5, 1961.',
  'https://www.nasa.gov/wp-content/uploads/2023/04/sp-4004-1963.pdf'),
 ('mercury-gordon-cooper','mercury','Gordon Cooper','8492c96fc0.jpg','s64-31847',
  'Which astronaut piloted Faith 7 on the final crewed Mercury flight?',
  'Gordon Cooper completed 22 orbits in Faith 7 during the final crewed Mercury mission.',
  'https://www.nasa.gov/wp-content/uploads/2023/04/sp-4004-1963.pdf'),
 ('shuttle-sally-ride','shuttle','Sally Ride','5a9b7a2729.jpg','S84-37256',
  'Which astronaut became the first American woman in space on STS-7?',
  'Sally Ride flew aboard Challenger in June 1983 on the STS-7 mission.',
  'https://www.nasa.gov/history/sally-ride-first-american-woman-in-space/'),
 ('shuttle-mae-jemison','shuttle','Mae Jemison','8510da6b60.jpg','S92-40463',
  'Which astronaut and physician flew as a mission specialist aboard Endeavour on STS-47?',
  'Mae Jemison flew on STS-47 in September 1992 and became the first Black woman in space.',
  'https://www.nasa.gov/people/mae-jemison-m-d/'),
 ('shuttle-kathryn-sullivan','shuttle','Kathryn Sullivan','2ba33ef724.jpg','S84-44219',
  'Which astronaut became the first American woman to perform a spacewalk?',
  'Kathryn Sullivan performed the spacewalk on the STS-41G mission in October 1984.',
  'https://www.nasa.gov/former-astronaut-kathryn-d-sullivan/'),
 ('shuttle-eileen-collins','shuttle','Eileen Collins','2b22a5f5cc.jpg','S99-00858',
  'Which astronaut became the first woman to command a Space Shuttle mission?',
  'Eileen Collins commanded STS-93 in 1999, the mission that deployed the Chandra X-ray Observatory.',
  'https://www.nasa.gov/former-astronaut-eileen-collins/')
), card_sets as (
 select group_id,
  jsonb_agg(jsonb_build_object('id',slug,'image','/media/'||image) order by slug) options,
  jsonb_agg(jsonb_build_object('id',slug,'image','/media/'||image,'subject',subject,'artist','NASA',
   'license','Public domain (NASA)','medium','photograph','url','https://images.nasa.gov/details/'||nasa_id) order by slug) credits
 from people group by group_id
), inserted_topics as (
 insert into public.topics(slug,title,subject)
 select slug,subject,'Space & Astronomy' from people
 on conflict(slug) do nothing returning id,slug
)
insert into public.questions(topic_id,kind,prompt,presentation,solution,explanation,source_title,source_url,status,verified_at)
select t.id,'who',p.prompt,jsonb_build_object('options',c.options),
 jsonb_build_object('label',p.subject,'correct',p.slug,'credits',c.credits),p.explanation,
 'NASA: '||p.subject,p.source_url,'published','2026-11-24T00:00:00Z'::timestamptz
from people p join card_sets c using(group_id) join inserted_topics t on t.slug=p.slug
on conflict do nothing;
