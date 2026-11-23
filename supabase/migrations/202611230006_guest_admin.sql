alter table public.profiles drop constraint profiles_role_check;
update public.profiles set role='guest' where role<>'admin';
alter table public.profiles alter column role set default 'guest';
alter table public.profiles add constraint profiles_role_check check(role in ('guest','admin'));

-- Retain question references and round snapshots after a moderator deletes a variant.
alter table public.questions drop constraint questions_status_check;
alter table public.questions add constraint questions_status_check
 check(status in ('review','published','rejected','deleted'));
alter table public.questions drop constraint questions_topic_id_kind_key;
drop index public.whirl_prompt_unique;
create unique index whirl_active_topic_kind on public.questions(topic_id,kind) where status<>'deleted';
create unique index whirl_prompt_unique on public.questions(lower(trim(prompt))) where status<>'deleted';

alter function public.whirl_workspace(text,jsonb) rename to whirl_workspace_internal;
revoke all on function public.whirl_workspace_internal(text,jsonb) from public,anon,authenticated;

create function public.whirl_workspace(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); qid uuid; state text;
begin
 if action in ('browse','leaderboard','me','stats','report') then
  return public.whirl_workspace_internal(action,p);
 end if;
 if not exists(select 1 from public.profiles where id=actor and role='admin') then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if action='editor_list' then
  return coalesce((select jsonb_agg(to_jsonb(s)) from (
   select q.id,q.prompt,q.kind,q.status,t.title from public.questions q join public.topics t on t.id=q.topic_id
   where q.status<>'deleted' and (p->>'status' is null or q.status=p->>'status')
   order by q.updated_at desc,q.id limit 24 offset greatest(0,coalesce((p->>'offset')::int,0))
  ) s),'[]'::jsonb);
 end if;
 if action in ('editor_get','save_question','review','delete_question') and p->>'question' is not null then
  qid=(p->>'question')::uuid;
  select status into state from public.questions where id=qid for update;
  if action='delete_question' then
   if not found then raise exception 'Question unavailable'; end if;
   update public.questions set status='deleted',verified_at=null,verified_by=null,updated_at=now()
    where id=qid and status<>'deleted';
   return 'true'::jsonb;
  end if;
  if state='deleted' then raise exception 'Question unavailable'; end if;
 end if;
 if action in ('admin_stats','reports','editor_get','save_question','validate','preview_score','review') then
  return public.whirl_workspace_internal(action,p);
 end if;
 raise exception 'Unknown workspace action';
end; $$;
revoke execute on function public.whirl_workspace(text,jsonb) from public,anon,authenticated;
grant execute on function public.whirl_workspace(text,jsonb) to anon,authenticated;

alter function public.whirl_play(text,jsonb) rename to whirl_play_internal;
revoke all on function public.whirl_play_internal(text,jsonb) from public,anon,authenticated;
create function public.whirl_play(action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if action='start' and p->>'mode' in ('course','assessment') then
  raise exception 'Choose a public quiz mode';
 end if;
 return public.whirl_play_internal(action,p);
end; $$;
revoke execute on function public.whirl_play(text,jsonb) from public,anon,authenticated;
grant execute on function public.whirl_play(text,jsonb) to authenticated;
