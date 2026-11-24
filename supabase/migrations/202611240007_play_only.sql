-- Game sessions store the current game's state, without using past games to
-- choose questions or exposing an account's score history.
create or replace function public.whirl_pool(s public.sessions)
returns table(qid uuid, kind text, used bigint, recent timestamptz, missed boolean)
language sql stable set search_path='' as $$
 with used_in_session as (
  select r.question_id,count(*) as uses
  from public.rounds r where r.session_id=s.id group by r.question_id
 )
 select q.id,q.kind,coalesce(u.uses,0),null::timestamptz,false
 from public.questions q left join used_in_session u on u.question_id=q.id
 where q.status='published' and q.verified_at is not null
 and (s.mode<>'course' or exists(select 1 from public.course_questions cq where cq.course_id=s.course_id and cq.question_id=q.id))
 and (s.mode<>'assessment' or exists(select 1 from public.assessment_questions aq where aq.assessment_id=s.assessment_id and aq.question_id=q.id))
$$;

revoke select on public.sessions from anon,authenticated;

alter function public.whirl_workspace(text,jsonb) rename to whirl_workspace_catalog;
revoke all on function public.whirl_workspace_catalog(text,jsonb) from public,anon,authenticated;
create function public.whirl_workspace(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if action in ('stats','leaderboard') then
  raise exception 'Player tracking is unavailable' using errcode='42501';
 end if;
 if action in ('browse','bank_subjects','editor_list') and not exists(
  select 1 from public.profiles where id=auth.uid() and role='admin'
 ) then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if action='editor_list' then
  return coalesce((select jsonb_agg(to_jsonb(entry) order by entry.updated_at desc,entry.id) from (
   select q.id,q.prompt,q.kind,q.status,t.title,t.subject,q.updated_at
   from public.questions q join public.topics t on t.id=q.topic_id
   where q.status<>'deleted'
    and (p->>'status' is null or q.status=p->>'status')
    and (coalesce(trim(p->>'search'),'')='' or concat_ws(' ',t.title,t.subject,q.prompt) ilike '%'||left(trim(p->>'search'),100)||'%')
   order by q.updated_at desc,q.id
   limit 24 offset greatest(0,least(1000000,coalesce((p->>'offset')::int,0)))
  ) entry),'[]'::jsonb);
 end if;
 return public.whirl_workspace_catalog(action,p);
end; $$;
revoke all on function public.whirl_workspace(text,jsonb) from public,anon,authenticated;
grant execute on function public.whirl_workspace(text,jsonb) to anon,authenticated;
