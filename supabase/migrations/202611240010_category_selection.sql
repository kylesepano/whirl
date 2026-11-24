alter table public.sessions add column categories text[]
 check(categories is null or (
  cardinality(categories) between 1 and 6
  and categories <@ array['who','where','when','what','why','how']
  and array_position(categories,null) is null
 ));

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
 and (case when s.categories is null then s.category is null or q.kind=s.category
           else q.kind=any(s.categories) end)
 and (s.mode<>'course' or exists(select 1 from public.course_questions cq where cq.course_id=s.course_id and cq.question_id=q.id))
 and (s.mode<>'assessment' or exists(select 1 from public.assessment_questions aq where aq.assessment_id=s.assessment_id and aq.question_id=q.id))
$$;

create or replace function public.whirl_play(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 allowed constant text[]:=array['who','where','when','what','why','how'];
 requested text[];
 started jsonb;
 s public.sessions;
begin
 if action<>'start' or (p->>'categories' is null and p->>'category' is null) then
  return public.whirl_play_unfocused(action,p);
 end if;
 if p->>'categories' is null then
  requested=array[p->>'category'];
 elsif jsonb_typeof(p->'categories')='array' then
  select array_agg(distinct value order by value) into requested
  from jsonb_array_elements_text(p->'categories') c(value);
 end if;
 if coalesce(cardinality(requested),0)=0 or array_position(requested,null) is not null
    or not requested <@ allowed then
  raise exception 'Choose at least one valid question category';
 end if;
 if exists(
  select 1 from unnest(requested) as selected(kind)
  where not exists(select 1 from public.questions q
                   where q.kind=selected.kind and q.status='published' and q.verified_at is not null)
 ) then
  raise exception 'A selected category has no published questions';
 end if;
 started=public.whirl_play_unfocused(action,p);
 update public.sessions set categories=requested,
  category=case when cardinality(requested)=1 then requested[1] end
 where id=(started->>'id')::uuid and user_id=auth.uid() returning * into strict s;
 return public.whirl_session(s);
end; $$;
