create function public.whirl_distance(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path='' as $$
 select 12742.0176 * asin(sqrt(least(1.0, power(sin(radians(lat2-lat1)/2),2)
 + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))))
$$;
create function public.whirl_region(lat double precision, lng double precision, vertices jsonb)
returns double precision language plpgsql immutable set search_path='' as $$
declare i int; x double precision; y double precision; px double precision; py double precision;
 inside boolean:=false; dist double precision:='Infinity'; k double precision; dx double precision; dy double precision;
 stretch double precision := greatest(0.000001,cos(radians(lat)));
begin
 for i in 0..jsonb_array_length(vertices)-1 loop
  x=(vertices->i->>0)::double precision; y=(vertices->i->>1)::double precision;
  px=(vertices->((i+1)%jsonb_array_length(vertices))->>0)::double precision;
  py=(vertices->((i+1)%jsonb_array_length(vertices))->>1)::double precision;
  if (y>lat)<>(py>lat) then
   if lng < (px-x)*(lat-y)/(py-y)+x then inside=not inside; end if;
  end if;
  dx=(px-x)*stretch; dy=py-y;
  k=least(1,greatest(0,((lng-x)*stretch*dx+(lat-y)*dy)/nullif(dx*dx+dy*dy,0)));
  dist=least(dist,public.whirl_distance(lat,lng,y+k*(py-y),x+k*(px-x)));
 end loop;
 return case when inside then 0 else dist end;
end; $$;
create function public.whirl_normalize(value text) returns text language sql immutable set search_path='' as $$
 select trim(regexp_replace(regexp_replace(lower(trim(value)),'^["“]+|[.!?"”]+$','','g'),'[[:space:]]+',' ','g'))
$$;
create function public.whirl_score(kind text, sol jsonb, a jsonb, reveal_count int) returns jsonb language plpgsql immutable set search_path='' as $$
declare points int:=0; difference double precision; lat double precision; lng double precision;
 expected jsonb:=sol->'correct'; item jsonb; i int; j int; good int:=0; bad int:=0; total int; value text;
begin
 if kind='where' then
  if jsonb_typeof(a->'lat') is distinct from 'number' or jsonb_typeof(a->'lng') is distinct from 'number' then raise exception 'Place a valid map pin'; end if;
  lat=(a->>'lat')::double precision; lng=(a->>'lng')::double precision;
  if abs(lat)>90 or abs(lng)>180 then raise exception 'Coordinates are outside the map'; end if;
  difference=case when sol ? 'polygon' then public.whirl_region(lat,lng,sol->'polygon')
    else public.whirl_distance(lat,lng,(sol->>'lat')::double precision,(sol->>'lng')::double precision) end;
  points=round(1000 * exp(-difference/(sol->>'scale')::double precision));
 elsif kind='when' then
  if jsonb_typeof(a) is distinct from 'number' or abs((a#>>'{}')::numeric)>100000 then raise exception 'Enter a valid date'; end if;
  value=a#>>'{}';
  difference=greatest(0,(sol->>'min')::double precision-value::double precision,value::double precision-(sol->>'max')::double precision);
  points=round(1000 * exp(-difference/(sol->>'scale')::double precision));
 elsif kind in ('who','what') then
  if jsonb_typeof(a) is distinct from 'string' or length(a#>>'{}')>250 then raise exception 'Select or enter an answer'; end if;
  if (sol ? 'aliases' and exists(select 1 from jsonb_array_elements_text(sol->'aliases') as alias where public.whirl_normalize(alias)=public.whirl_normalize(a#>>'{}')))
   or (not sol ? 'aliases' and expected=a) then points=1000-reveal_count*200; end if;
 elsif kind='why' and sol->>'mechanic'='matching' then
  if jsonb_typeof(a) is distinct from 'object' or exists(select 1 from jsonb_each(a) e where jsonb_typeof(e.value)<>'string') then raise exception 'Match the items'; end if;
  select count(*),count(*) filter(where a->e.key=e.value) into total,good from jsonb_each(expected) e;
  select count(*) into bad from jsonb_each(a) e where expected->e.key is distinct from e.value;
  points=round(1000.0*(good-bad)/total);
 else
  if jsonb_typeof(a) is distinct from 'array' or jsonb_array_length(a)>12 then raise exception 'Select or arrange the cards'; end if;
  if exists(select 1 from jsonb_array_elements(a) e group by e.value having count(*)>1) or
     exists(select 1 from jsonb_array_elements(a) e where jsonb_typeof(e.value)<>'string') then raise exception 'Use each card once'; end if;
  total=jsonb_array_length(expected);
  if kind='how' then
   for i in 0..total-2 loop
    for j in i+1..total-1 loop
     if (select min(n) from jsonb_array_elements(a) with ordinality e(v,n) where v=expected->i)
      < (select min(n) from jsonb_array_elements(a) with ordinality e(v,n) where v=expected->j) then good=good+1; end if;
    end loop;
   end loop;
   points=round(2000.0*good/(total*(total-1)));
  elsif sol->>'mechanic'='chain' then
   for i in 0..jsonb_array_length(a)-2 loop
    if exists(select 1 from generate_series(0,total-2) n where expected->n=a->i and expected->(n+1)=a->(i+1)) then good=good+1; else bad=bad+1; end if;
   end loop;
   points=round(1000.0*(good-bad)/(total-1));
  else
   for item in select e.value from jsonb_array_elements(a) e loop
    if expected @> jsonb_build_array(item) then good=good+1; else bad=bad+1; end if;
   end loop;
   points=round(1000.0*(good-bad)/total);
  end if;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('score',greatest(0,least(1000,points)),'difference',difference,'solution',sol));
end; $$;
create function public.whirl_award(base int, display jsonb, solution jsonb, reveal_count int)
returns int language sql immutable set search_path='' as $$
 select least(
  round(coalesce((display->>'maxScore')::int,1000)*(1-reveal_count*.2))::int,
  round(base * coalesce((display->>'maxScore')::int,1000) * coalesce((solution->>'multiplier')::numeric,1)/1000)::int
 )
$$;
create function public.whirl_validate(kind text, p jsonb, s jsonb, explanation text, url text, title text) returns text[]
language plpgsql immutable set search_path='' as $$
declare errors text[]:='{}'; n int; ids jsonb; e jsonb;
begin
 if length(trim(coalesce(explanation,'')))<10 then errors=array_append(errors,'Add an explanation.'); end if;
 if coalesce(url,'') !~ '^https://[^ /]+' or length(trim(coalesce(title,'')))<3 then errors=array_append(errors,'Add a source title and HTTPS link.'); end if;
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(s) is distinct from 'object' then return array_append(errors,'Presentation and solution must be objects.'); end if;
 if p ? 'seconds' and (jsonb_typeof(p->'seconds')<>'number' or (p->>'seconds') !~ '^([1-9][0-9]|[1-5][0-9][0-9]|600)$') then errors=array_append(errors,'Time limit must be 10–600 seconds.'); end if;
 if p ? 'maxScore' and (jsonb_typeof(p->'maxScore')<>'number' or (p->>'maxScore') !~ '^[1-9][0-9]{0,2}$|^1000$') then errors=array_append(errors,'Maximum score must be a whole number from 1 to 1,000.'); end if;
 if s ? 'multiplier' and (jsonb_typeof(s->'multiplier')<>'number' or (s->>'multiplier')::numeric not between 0.1 and 3) then errors=array_append(errors,'Difficulty multiplier must be between 0.1 and 3.'); end if;
 if kind in ('who','what','how','why') then
  if (kind in ('how','why') and coalesce(p->>'mechanic','')<>'matching') or kind='who' or (kind='what' and not s ? 'aliases') then
   if jsonb_typeof(p->'options') is distinct from 'array' then return array_append(errors,'Add answer cards.'); end if;
   select count(distinct v->>'id'),jsonb_agg(v->'id') into n,ids from jsonb_array_elements(p->'options') v;
   if n<>jsonb_array_length(p->'options') or n not between 2 and 12 or exists(select 1 from jsonb_array_elements(p->'options') v where coalesce(v->>'id','')='' or (kind<>'who' and coalesce(v->>'label','')='')) then errors=array_append(errors,'Cards need distinct IDs and display labels.'); end if;
  end if;
  if kind='who' then
   if n<>4 or not coalesce(ids @> jsonb_build_array(s->'correct'),false)
    or (select count(distinct v->>'image') from jsonb_array_elements(p->'options') v)<>4
    or exists(select 1 from jsonb_array_elements(p->'options') v where v->>'image' !~ '^(/media/|https://)')
    or (select count(distinct asset->>'subject') from jsonb_array_elements(s->'credits') asset)<>4
    or (select count(distinct asset->>'medium') from jsonb_array_elements(s->'credits') asset)<>1
    or exists(select 1 from jsonb_array_elements(p->'options') o where not exists(select 1 from jsonb_array_elements(s->'credits') c where c->>'id'=o->>'id'))
    then errors=array_append(errors,'Provide four distinct same-medium verified portraits.'); end if;
  elsif kind='what' then
   if (not s ? 'aliases' and (n<>4 or not coalesce(ids @> jsonb_build_array(s->'correct'),false))) or
      (s ? 'aliases' and (jsonb_typeof(s->'aliases')<>'array' or jsonb_array_length(s->'aliases')=0))
      then errors=array_append(errors,'Provide four choices with a correct ID or accepted typed aliases.'); end if;
   if jsonb_typeof(p->'images') is distinct from 'array' or jsonb_array_length(p->'images')<>4 or
      exists(select 1 from jsonb_array_elements_text(p->'images') img where img !~ '^(/media/|https://)')
      then errors=array_append(errors,'Provide four image reveal stages.'); end if;
  elsif kind='why' and p->>'mechanic'='matching' then
   if s->>'mechanic' is distinct from 'matching' or jsonb_typeof(s->'correct') is distinct from 'object' or jsonb_typeof(p->'pairs') is distinct from 'array' or jsonb_typeof(p->'matches') is distinct from 'array' then errors=array_append(errors,'Add observations, explanations and a mapping.');
   else
    if jsonb_array_length(p->'pairs')<2 or (select count(*) from jsonb_each(s->'correct'))<>jsonb_array_length(p->'pairs') or exists(select 1 from jsonb_array_elements(p->'pairs') v where not exists(select 1 from jsonb_array_elements(p->'matches') m where m->'id'=s->'correct'->(v->>'id'))) then errors=array_append(errors,'Match each observation to a valid explanation.'); end if;
   end if;
  else
   if kind='why' and (coalesce(p->>'mechanic','') not in ('evidence','chain') or p->>'mechanic' is distinct from s->>'mechanic') then errors=array_append(errors,'Choose a consistent causal mechanic.'); end if;
   if jsonb_typeof(s->'correct') is distinct from 'array' or jsonb_array_length(s->'correct')<(case when kind='how' then 3 else 2 end) or not coalesce(ids @> (s->'correct'),false)
    or (select count(distinct v) from jsonb_array_elements(s->'correct') v)<>jsonb_array_length(s->'correct')
    or (kind='how' and (n not between 3 and 6 or n<>jsonb_array_length(s->'correct')))
    then errors=array_append(errors,'Verify the order or the causal relationships.'); end if;
  end if;
 elsif kind='where' then
  if jsonb_typeof(s->'lat') is distinct from 'number' or abs((s->>'lat')::numeric)>90
   or jsonb_typeof(s->'lng') is distinct from 'number' or abs((s->>'lng')::numeric)>180
   or jsonb_typeof(s->'scale') is distinct from 'number' or (s->>'scale')::numeric<=0 then errors=array_append(errors,'Add valid coordinates and a positive kilometer scale.'); end if;
  if s ? 'polygon' then
   if jsonb_typeof(s->'polygon')<>'array' or jsonb_array_length(s->'polygon')<3 then errors=array_append(errors,'Provide a polygon with at least three vertices.');
   else
    for e in select value from jsonb_array_elements(s->'polygon') loop
     if jsonb_typeof(e)<>'array' or jsonb_array_length(e)<>2 or jsonb_typeof(e->0)<>'number' or jsonb_typeof(e->1)<>'number' or abs((e->>0)::numeric)>180 or abs((e->>1)::numeric)>90 then errors=array_append(errors,'Polygon vertices must be longitude and latitude pairs.'); exit; end if;
    end loop;
   end if;
  end if;
 elsif kind='when' then
  if jsonb_typeof(s->'min') is distinct from 'number' or jsonb_typeof(s->'max') is distinct from 'number'
   or jsonb_typeof(s->'scale') is distinct from 'number' or (s->>'scale')::numeric<=0 or (s->>'min')::numeric>(s->>'max')::numeric
   or coalesce(s->>'precision','') not in ('year','day','decade','century','range') then errors=array_append(errors,'Provide a valid date range, precision and positive tolerance.'); end if;
  if jsonb_typeof(p->'min') is distinct from 'number' or jsonb_typeof(p->'max') is distinct from 'number'
   or (p->>'min')::numeric>=(p->>'max')::numeric or (p->>'min')::numeric < -100000 or (p->>'max')::numeric > 100000
   or (p->>'min')::numeric>(s->>'min')::numeric or (p->>'max')::numeric<(s->>'max')::numeric
   then errors=array_append(errors,'The public timeline must include the accepted range.'); end if;
 end if;
 if kind in ('who','what') then
  if jsonb_typeof(s->'credits') is distinct from 'array' or jsonb_array_length(s->'credits')<(case when kind='who' then 4 else 1 end) or
   exists(select 1 from jsonb_array_elements(s->'credits') c where coalesce(c->>'license','')='' or coalesce(c->>'artist','')='' or coalesce(c->>'url','') !~ '^https://')
  then errors=array_append(errors,'Media requires source URLs, attribution and license.'); end if;
 end if;
 if coalesce(s->>'label','')='' then errors=array_append(errors,'Add the answer reveal label.'); end if;
 return errors;
exception when data_exception then return array_append(errors,'Use valid fields and values for this mechanic.');
end; $$;
create function public.whirl_materialize(kind text, presentation jsonb, solution jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare ids jsonb; observations jsonb; explanations jsonb;
begin
 if jsonb_typeof(presentation->'options')='array' then
  -- Replace editorial card IDs before they cross the public API.
  select jsonb_object_agg(o->>'id',gen_random_uuid()::text) into ids from jsonb_array_elements(presentation->'options') o;
  presentation=jsonb_set(presentation,'{options}',(
   select jsonb_agg(jsonb_set(o,'{id}',ids->(o->>'id')) order by random()) from jsonb_array_elements(presentation->'options') o
  ));
  if jsonb_typeof(solution->'correct')='string' then
   solution=jsonb_set(solution,'{correct}',ids->(solution->>'correct'));
  elsif jsonb_typeof(solution->'correct')='array' then
   solution=jsonb_set(solution,'{correct}',(
    select jsonb_agg(ids->v order by n) from jsonb_array_elements_text(solution->'correct') with ordinality e(v,n)
   ));
  end if;
  if kind='who' then
   solution=jsonb_set(solution,'{credits}',(
    select jsonb_agg(jsonb_set(c,'{id}',ids->(c->>'id'))) from jsonb_array_elements(solution->'credits') c
   ));
  end if;
 elsif kind='why' and presentation->>'mechanic'='matching' then
  select jsonb_object_agg(o->>'id',gen_random_uuid()::text) into observations from jsonb_array_elements(presentation->'pairs') o;
  select jsonb_object_agg(o->>'id',gen_random_uuid()::text) into explanations from jsonb_array_elements(presentation->'matches') o;
  presentation=jsonb_set(jsonb_set(presentation,'{pairs}',(
   select jsonb_agg(jsonb_set(o,'{id}',observations->(o->>'id')) order by random()) from jsonb_array_elements(presentation->'pairs') o
  )),'{matches}',(
   select jsonb_agg(jsonb_set(o,'{id}',explanations->(o->>'id')) order by random()) from jsonb_array_elements(presentation->'matches') o
  ));
  solution=jsonb_set(solution,'{correct}',(
   select jsonb_object_agg(observations->>e.key,explanations->e.value) from jsonb_each_text(solution->'correct') e
  ));
 end if;
 return jsonb_build_object('presentation',presentation,'solution',solution);
end; $$;
create function public.whirl_round(r public.rounds) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'position',r.position,'kind',r.snapshot->'kind','prompt',r.snapshot->'prompt','difficulty',r.snapshot->'difficulty',
 'topic',r.snapshot->'subject','deadline',r.deadline,'reveals',r.reveals,'display',
 ((r.snapshot->'presentation') - 'images') || case when r.snapshot->>'kind'='what'
 then jsonb_build_object('image',r.snapshot->'presentation'->'images'->r.reveals) else '{}'::jsonb end)
$$;
create function public.whirl_pool(s public.sessions) returns table(qid uuid, kind text, used bigint, recent timestamptz, missed boolean)
language sql stable set search_path='' as $$
 select q.id,q.kind,(select count(*) from public.rounds r where r.session_id=s.id and r.question_id=q.id),
 history.last_seen,coalesce(history.last_score<700,false)
 from public.questions q left join lateral (
  select b.created_at last_seen,b.score last_score from public.submissions b join public.rounds r on r.id=b.round_id
   join public.sessions ps on ps.id=r.session_id where ps.user_id=s.user_id and r.question_id=q.id order by b.created_at desc limit 1
 ) history on true
 where q.status='published' and q.verified_at is not null
 and (s.mode<>'course' or exists(select 1 from public.course_questions cq where cq.course_id=s.course_id and cq.question_id=q.id))
 and (s.mode<>'assessment' or exists(select 1 from public.assessment_questions aq where aq.assessment_id=s.assessment_id and aq.question_id=q.id))
$$;
create function public.whirl_candidates(s public.sessions) returns table(qid uuid, kind text, recent timestamptz, missed boolean)
language sql stable set search_path='' as $$
 with pool as (select * from public.whirl_pool(s)),
 minimum_uses as (select * from pool where used=(select min(used) from pool)),
 previous as (select question_id from public.rounds where session_id=s.id order by position desc limit 1),
 candidates as (
  select * from minimum_uses where qid is distinct from (select question_id from previous)
   or (select count(*) from minimum_uses)=1
 )
 select qid,kind,recent,missed from candidates
 where s.mode in ('practice','assessment') or recent is null or recent<=now()-interval '1 day'
 or not exists(select 1 from candidates where recent is null or recent<=now()-interval '1 day')
$$;
create function public.whirl_session(s public.sessions) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(s) || jsonb_build_object(
 'eligible',coalesce((select jsonb_agg(distinct v.kind) from public.whirl_candidates(s) v),'[]'::jsonb),
 'total',coalesce((select sum(b.score) from public.rounds r join public.submissions b on b.round_id=r.id where r.session_id=s.id),0),
 'rounds',coalesce((select jsonb_agg(public.whirl_round(r) || jsonb_build_object('feedback',b.feedback) order by r.position)
  from public.rounds r left join public.submissions b on b.round_id=r.id where r.session_id=s.id),'[]'::jsonb))
$$;
create function public.whirl_play(action text, p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.sessions; r public.rounds; q public.questions; b public.submissions;
 mode text:=p->>'mode'; cid uuid; aid uuid; selected uuid; category text; available int; current_position int; shown jsonb; result jsonb; seconds int;
begin
 if actor is null then raise exception 'Sign in to play'; end if;
 if action='start' then
  if mode not in ('quick','classic','marathon','practice','course','assessment') or mode is null then raise exception 'Choose a valid game mode'; end if;
  if mode in ('course','assessment') then
   cid=(p->>'course')::uuid;
   if not exists(select 1 from public.enrollments e join public.courses c on c.id=e.course_id where e.course_id=cid and e.user_id=actor and c.published) then raise exception 'Enroll in the course first'; end if;
  end if;
  if mode='assessment' then
   aid=(p->>'assessment')::uuid;
   if not exists(select 1 from public.assessments a where a.id=aid and a.course_id=cid and a.published) then raise exception 'Assessment unavailable'; end if;
  end if;
  s.user_id=actor; s.mode=mode; s.course_id=cid; s.assessment_id=aid;
  select count(*) into available from public.whirl_pool(s);
  if available=0 then raise exception 'There are no published questions for this mode'; end if;
  if mode='assessment' and available<>(select count(*) from public.assessment_questions a where a.assessment_id=aid) then raise exception 'The assessment contains unavailable questions'; end if;
  insert into public.sessions(user_id,mode,target,course_id,assessment_id)
   values(actor,mode,case mode when 'quick' then 5 when 'classic' then 10 when 'marathon' then 20 when 'course' then least(10,available) when 'assessment' then available else null end,cid,aid) returning * into s;
  return public.whirl_session(s);
 end if;
 select * into s from public.sessions where id=(p->>'id')::uuid and user_id=actor for update;
 if not found then raise exception 'Session unavailable'; end if;
 if action='session' then return public.whirl_session(s); end if;
 if action='finish' and s.mode='practice' then
  if exists(select 1 from public.rounds rr left join public.submissions ss on ss.round_id=rr.id where rr.session_id=s.id and ss.round_id is null) then raise exception 'Submit the current round first'; end if;
  update public.sessions set finished_at=coalesce(finished_at,clock_timestamp()) where id=s.id returning * into s;
  return public.whirl_session(s);
 end if;
 if action='spin' then
  if s.finished_at is not null then raise exception 'This session is finished'; end if;
  select * into r from public.rounds where session_id=s.id order by position desc limit 1;
  if found and not exists(select 1 from public.submissions where round_id=r.id) then return public.whirl_round(r); end if;
  current_position=coalesce(r.position,0)+1;
  if s.mode='assessment' then
   select aq.question_id into selected from public.assessment_questions aq join public.whirl_pool(s) pool on pool.qid=aq.question_id where aq.assessment_id=s.assessment_id and pool.used=0 order by aq.position limit 1;
  else
   select e.kind into category from (select distinct v.kind from public.whirl_candidates(s) v) e order by random() limit 1;
   select pool.qid into selected from public.whirl_candidates(s) pool where pool.kind=category
    order by (s.mode='practice' and pool.missed) desc,case when pool.recent > now()-interval '1 day' then pool.recent end asc nulls first,random() limit 1;
  end if;
  if selected is null then raise exception 'No eligible question is available'; end if;
  select * into q from public.questions where id=selected;
  shown=public.whirl_materialize(q.kind,q.presentation,q.solution);
  q.presentation=shown->'presentation';
  q.solution=shown->'solution';
  shown=q.presentation;
  seconds=case when s.mode='practice' then null else (shown->>'seconds')::integer end;
  insert into public.rounds(session_id,question_id,position,snapshot,deadline)
  select s.id,q.id,current_position,to_jsonb(q)||jsonb_build_object('presentation',shown,'subject',t.subject),
   case when seconds is not null then clock_timestamp()+make_interval(secs=>seconds+4) end
   from public.topics t where t.id=q.topic_id returning * into r;
  return public.whirl_round(r);
 end if;
 select * into r from public.rounds where id=(p->>'round')::uuid and session_id=s.id for update;
 if not found then raise exception 'Round unavailable'; end if;
 select * into b from public.submissions where round_id=r.id;
 if action='submit' and found then return b.feedback; end if;
 if found or s.finished_at is not null then raise exception 'Round is closed'; end if;
 if action='reveal' and r.snapshot->>'kind'='what' then
  if r.deadline is not null and r.deadline<clock_timestamp() then raise exception 'Time expired'; end if;
  -- The requested stage is monotonic and idempotent across network retries.
  update public.rounds set reveals=least(reveals+1,greatest(reveals,least(3,coalesce((p->>'stage')::int,reveals+1)))) where id=r.id returning * into r;
  return public.whirl_round(r);
 end if;
 if action='submit' then
  if r.deadline is not null and r.deadline<clock_timestamp() then
   result=jsonb_build_object('score',0,'expired',true,'solution',r.snapshot->'solution');
  else
   result=public.whirl_score(r.snapshot->>'kind',r.snapshot->'solution',p->'answer',r.reveals);
   result=jsonb_set(result,'{score}',to_jsonb(public.whirl_award((result->>'score')::int,r.snapshot->'presentation',r.snapshot->'solution',r.reveals)));
  end if;
  result=result || jsonb_build_object('explanation',r.snapshot->'explanation','sourceUrl',r.snapshot->'source_url','sourceTitle',r.snapshot->'source_title','answer',p->'answer','questionId',r.question_id);
  insert into public.submissions(round_id,answer,score,feedback) values(r.id,coalesce(p->'answer','null'),(result->>'score')::integer,result);
  if r.position=s.target then update public.sessions set finished_at=clock_timestamp() where id=s.id; end if;
  return result;
 end if;
 raise exception 'Unknown game action';
end; $$;
revoke execute on function public.whirl_distance(double precision,double precision,double precision,double precision),public.whirl_region(double precision,double precision,jsonb),public.whirl_normalize(text),public.whirl_score(text,jsonb,jsonb,int),public.whirl_validate(text,jsonb,jsonb,text,text,text),public.whirl_round(public.rounds),public.whirl_pool(public.sessions),public.whirl_candidates(public.sessions),public.whirl_session(public.sessions),public.whirl_play(text,jsonb) from public,anon,authenticated;
grant execute on function public.whirl_play(text,jsonb) to authenticated;
revoke execute on function public.whirl_award(int,jsonb,jsonb,int) from public,anon,authenticated;
revoke execute on function public.whirl_materialize(text,jsonb,jsonb) from public,anon,authenticated;
