alter table public.sessions add column category text
 check(category in ('who','where','when','what','why','how'));

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
 and (s.category is null or q.kind=s.category)
 and (s.mode<>'course' or exists(select 1 from public.course_questions cq where cq.course_id=s.course_id and cq.question_id=q.id))
 and (s.mode<>'assessment' or exists(select 1 from public.assessment_questions aq where aq.assessment_id=s.assessment_id and aq.question_id=q.id))
$$;

alter function public.whirl_play(text,jsonb) rename to whirl_play_unfocused;
revoke all on function public.whirl_play_unfocused(text,jsonb) from public,anon,authenticated;
create function public.whirl_play(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare selected_category text:=p->>'category'; started jsonb; s public.sessions;
begin
 if action<>'start' or selected_category is null then
  return public.whirl_play_unfocused(action,p);
 end if;
 if selected_category not in ('who','where','when','what','why','how') then
  raise exception 'Choose a valid question category';
 end if;
 if not exists(select 1 from public.questions
     where kind=selected_category and status='published' and verified_at is not null) then
  raise exception 'There are no published questions for this category';
 end if;
 started=public.whirl_play_unfocused(action,p);
 update public.sessions set category=selected_category
 where id=(started->>'id')::uuid and user_id=auth.uid() returning * into strict s;
 return public.whirl_session(s);
end; $$;
revoke all on function public.whirl_play(text,jsonb) from public,anon,authenticated;
grant execute on function public.whirl_play(text,jsonb) to authenticated;
