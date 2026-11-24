-- Text clues share the existing WHO and WHAT scoring and keep answers private.
alter function public.whirl_validate(text,jsonb,jsonb,text,text,text)
 rename to whirl_validate_visual;

create function public.whirl_validate(kind text,p jsonb,s jsonb,explanation text,url text,title text)
returns text[] language plpgsql immutable set search_path='' as $$
declare errors text[]:='{}';
begin
 if p->>'mechanic' is distinct from 'text' then
  return public.whirl_validate_visual(kind,p,s,explanation,url,title);
 end if;
 if kind not in ('who','what') or jsonb_typeof(p) is distinct from 'object'
    or jsonb_typeof(s) is distinct from 'object' then return array['Text clues are available for WHO and WHAT.']; end if;
 if length(trim(coalesce(explanation,'')))<10 then errors=array_append(errors,'Add an explanation.'); end if;
 if coalesce(url,'') !~ '^https://[^ /]+' or length(trim(coalesce(title,'')))<3 then errors=array_append(errors,'Add a source title and HTTPS link.'); end if;
 if coalesce(s->>'label','')='' then errors=array_append(errors,'Add the answer reveal label.'); end if;
 if p ?| array['options','images'] then errors=array_append(errors,'Remove image stages and choices from a text clue.'); end if;
 if jsonb_typeof(s->'aliases') is distinct from 'array' then errors=array_append(errors,'Add accepted text answers.');
 elsif jsonb_array_length(s->'aliases') not between 1 and 20 or exists(
  select 1 from jsonb_array_elements(s->'aliases') a(value)
  where jsonb_typeof(a.value)<>'string' or length(trim(a.value#>>'{}')) not between 1 and 200
 ) then errors=array_append(errors,'Add 1–20 valid text answers.'); end if;
 if p ? 'seconds' and coalesce(p->>'seconds','') !~ '^([1-9][0-9]|[1-5][0-9][0-9]|600)$' then errors=array_append(errors,'Time limit must be 10–600 seconds.'); end if;
 if p ? 'maxScore' and coalesce(p->>'maxScore','') !~ '^([1-9][0-9]{0,2}|1000)$' then errors=array_append(errors,'Maximum score must be a whole number from 1 to 1,000.'); end if;
 if s ? 'multiplier' and (jsonb_typeof(s->'multiplier')<>'number' or (s->>'multiplier')::numeric not between 0.1 and 3) then errors=array_append(errors,'Difficulty multiplier must be between 0.1 and 3.'); end if;
 return errors;
exception when data_exception then return array_append(errors,'Use valid fields and values for this mechanic.');
end; $$;
revoke all on function public.whirl_validate(text,jsonb,jsonb,text,text,text) from public,anon,authenticated;

create function public.whirl_catalog(p jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.title,q.id),'[]'::jsonb)
 from (
  select q.id,q.kind,q.difficulty,t.title,t.subject,q.prompt
  from public.questions q join public.topics t on t.id=q.topic_id
  where q.status='published' and (coalesce(p->>'kind','')='' or q.kind=p->>'kind')
   and (coalesce(p->>'subject','')='' or t.subject=p->>'subject')
   and (coalesce(p->>'search','')='' or concat_ws(' ',t.title,t.subject,q.prompt) ilike '%'||left(p->>'search',100)||'%')
  order by t.title,q.id limit 24 offset greatest(0,least(1000000,coalesce((p->>'offset')::int,0)))
 ) q
$$;
revoke all on function public.whirl_catalog(jsonb) from public,anon,authenticated;

-- Scan a player's history once per selection, rather than for every catalog row.
create or replace function public.whirl_pool(s public.sessions)
returns table(qid uuid, kind text, used bigint, recent timestamptz, missed boolean)
language sql stable set search_path='' as $$
 with used_in_session as (
  select r.question_id,count(*) as uses
  from public.rounds r where r.session_id=s.id group by r.question_id
 ),
 latest_answer as (
  select distinct on (r.question_id) r.question_id,b.created_at,b.score
  from public.sessions ps join public.rounds r on r.session_id=ps.id
  join public.submissions b on b.round_id=r.id
  where ps.user_id=s.user_id
  order by r.question_id,b.created_at desc,b.round_id
 )
 select q.id,q.kind,coalesce(u.uses,0),a.created_at,coalesce(a.score<700,false)
 from public.questions q
 left join used_in_session u on u.question_id=q.id
 left join latest_answer a on a.question_id=q.id
 where q.status='published' and q.verified_at is not null
 and (s.mode<>'course' or exists(select 1 from public.course_questions cq where cq.course_id=s.course_id and cq.question_id=q.id))
 and (s.mode<>'assessment' or exists(select 1 from public.assessment_questions aq where aq.assessment_id=s.assessment_id and aq.question_id=q.id))
$$;

alter function public.whirl_workspace(text,jsonb) rename to whirl_workspace_guarded;
revoke all on function public.whirl_workspace_guarded(text,jsonb) from public,anon,authenticated;
create function public.whirl_workspace(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if action='browse' then return public.whirl_catalog(p); end if;
 if action='bank_subjects' then
  return coalesce((select jsonb_agg(s.subject order by s.subject) from (
   select distinct t.subject from public.questions q join public.topics t on t.id=q.topic_id where q.status='published'
  ) s),'[]'::jsonb);
 end if;
 if action='admin_stats' then
  return public.whirl_workspace_guarded(action,p) || jsonb_build_object('missingMedia',(
   select count(*) from public.questions
   where status<>'deleted' and presentation->>'mechanic' is distinct from 'text'
    and ((kind='who' and not presentation ? 'options') or (kind='what' and not presentation ? 'images'))
  ));
 end if;
 return public.whirl_workspace_guarded(action,p);
end; $$;
revoke all on function public.whirl_workspace(text,jsonb) from public,anon,authenticated;
grant execute on function public.whirl_workspace(text,jsonb) to anon,authenticated;

create or replace function public.whirl_play(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if action='start' and p->>'mode' in ('course','assessment') then raise exception 'Choose a public quiz mode'; end if;
 if action='reveal' and exists(
  select 1 from public.rounds r join public.sessions s on s.id=r.session_id
  where r.id=(p->>'round')::uuid and s.id=(p->>'id')::uuid and s.user_id=auth.uid()
    and r.snapshot->'presentation'->>'mechanic'='text'
 ) then raise exception 'Text clues have no image reveal'; end if;
 return public.whirl_play_internal(action,p);
end; $$;
