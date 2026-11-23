create function public.whirl_workspace(action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role text; cid uuid; oid uuid; qid uuid; tid uuid; aid uuid; c public.courses;
 q public.questions; warnings text[]; result jsonb; item jsonb; idx int:=0; display jsonb;
begin
 select u.role into role from public.profiles u where u.id=actor;
 if action='catalog' then
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.title) from (
   select c2.*,exists(select 1 from public.enrollments e where e.user_id=actor and e.course_id=c2.id) enrolled,
   (select count(*) from public.lessons l where l.course_id=c2.id) lesson_count from public.courses c2 where c2.published
  ) s),'[]'::jsonb);
 end if;
 if action='browse' then
  return coalesce((select jsonb_agg(to_jsonb(s)) from (
   select q2.id,q2.kind,q2.difficulty,t.title,t.subject,q2.prompt from public.questions q2 join public.topics t on t.id=q2.topic_id
   where q2.status='published' and (coalesce(p->>'kind','')='' or q2.kind=p->>'kind')
    and (coalesce(p->>'search','')='' or concat_ws(' ',t.title,t.subject,q2.prompt) ilike '%'||left(p->>'search',100)||'%')
   order by t.title,q2.id limit 24 offset greatest(0,least(1000000,coalesce((p->>'offset')::int,0)))
  ) s),'[]'::jsonb);
 end if;
 if action='leaderboard' then
  return coalesce((select jsonb_agg(to_jsonb(s)) from (
   select pr.name,sum(b.score)::integer points,count(distinct g.id) games
   from public.sessions g join public.profiles pr on pr.id=g.user_id
   join public.rounds r on r.session_id=g.id join public.submissions b on b.round_id=r.id
   where g.finished_at is not null and g.mode in ('classic','quick','marathon')
   group by pr.id,pr.name order by points desc,pr.name limit 50
  ) s),'[]'::jsonb);
 end if;
 if actor is null or role is null then raise exception 'Sign in to continue'; end if;
 if action='me' then return (select to_jsonb(u) from public.profiles u where u.id=actor); end if;
 if action='name' then
  update public.profiles set name=left(trim(p->>'name'),70) where id=actor;
  return (select to_jsonb(u) from public.profiles u where u.id=actor);
 end if;
 if action='stats' then
  with data as (
   select g.id,g.mode,g.finished_at,r.position,r.snapshot,b.score,b.created_at,r.opened_at
   from public.sessions g join public.rounds r on r.session_id=g.id join public.submissions b on b.round_id=r.id where g.user_id=actor
  ), per_game as (
   select id,sum(score) points from data group by id
  ), days as (
   select distinct (created_at at time zone 'UTC')::date d from data
  ), streak as (
   select d,row_number() over(order by d desc) n,(select max(d) from days) last_day from days
  )
  select jsonb_build_object(
   'answered',count(*),'accuracy',coalesce(round(100.0*count(*) filter(where score>=700)/nullif(count(*),0)),0),
   'xp',coalesce(sum(case when mode='practice' then score/25 else score/10 end),0),
   'best',coalesce((select max(points) from per_game),0),
   'streak',(select count(*) from streak where last_day>=(now() at time zone 'UTC')::date-1 and last_day-d=n-1),
   'perfect',count(*) filter(where score=1000),'minutes',coalesce(round(sum(least(600,greatest(0,extract(epoch from created_at-opened_at))))/60),0),
   'subjects',coalesce((select jsonb_agg(to_jsonb(a) order by a.score desc) from (select snapshot->>'subject' name,round(avg(score)) score,count(*) n from data group by 1) a),'[]'::jsonb),
   'categories',coalesce((select jsonb_agg(to_jsonb(a) order by a.score desc) from (select snapshot->>'kind' name,round(avg(score)) score,count(*) n,count(*) filter(where score>=700) passed from data group by 1) a),'[]'::jsonb),
   'sessions',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (
    select g.id,g.mode,g.created_at,g.finished_at,g.target,coalesce(per_game.points,0) points from public.sessions g left join per_game on g.id=per_game.id where g.user_id=actor order by g.created_at desc limit 12
   ) a),'[]'::jsonb),
   'mistakes',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,position,score,snapshot->>'prompt' prompt from data where score<700 order by created_at desc limit 24) a),'[]'::jsonb)
  ) into result from data;
  return result;
 end if;
 if action='report' then
  qid=(p->>'question')::uuid;
  if not exists(select 1 from public.sessions g join public.rounds r on r.session_id=g.id join public.submissions b on b.round_id=r.id where g.user_id=actor and r.question_id=qid) then raise exception 'Answer the question before reporting it'; end if;
  if length(trim(coalesce(p->>'reason','')))<5 then raise exception 'Please describe the problem'; end if;
  insert into public.reports(user_id,question_id,reason) values(actor,qid,left(p->>'reason',1000)) on conflict(user_id,question_id) do update set reason=excluded.reason;
  return 'true'::jsonb;
 end if;
 if action in ('course','enroll','complete_lesson','save_course','save_lesson','attach','save_assessment','set_assessment_visibility','class') then
  cid=(p->>'course')::uuid;
  if cid is not null then select * into c from public.courses where id=cid; end if;
  if action='course' then
   if c.id is null or not (c.published or c.owner_id=actor or role='admin') then raise exception 'Course unavailable'; end if;
   return to_jsonb(c)||jsonb_build_object(
    'enrolled',exists(select 1 from public.enrollments e where e.course_id=cid and e.user_id=actor),
    'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'position',l.position,'body',
     case when c.owner_id=actor or role='admin' or exists(select 1 from public.enrollments e where e.course_id=cid and e.user_id=actor) then l.body end,
     'completed',exists(select 1 from public.lesson_progress lp where lp.lesson_id=l.id and lp.user_id=actor)) order by position) from public.lessons l where course_id=cid),'[]'::jsonb),
    'assessments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'published',a.published,'count',(select count(*) from public.assessment_questions aq where aq.assessment_id=a.id))) from public.assessments a where course_id=cid and (a.published or c.owner_id=actor or role='admin')),'[]'::jsonb),
    'question_count',(select count(*) from public.course_questions where course_id=cid));
  elsif action='enroll' then
   if not coalesce(c.published,false) then raise exception 'Course unavailable'; end if;
   insert into public.enrollments(course_id,user_id) values(cid,actor) on conflict do nothing;
   return 'true'::jsonb;
  elsif action='complete_lesson' then
   oid=(p->>'lesson')::uuid;
   if not exists(select 1 from public.enrollments e join public.lessons l on l.course_id=e.course_id where l.id=oid and e.course_id=cid and e.user_id=actor) then raise exception 'Enroll in this course first'; end if;
   insert into public.lesson_progress values(oid,actor,now()) on conflict do nothing;
   return 'true'::jsonb;
  end if;
  if role not in ('instructor','admin') or (cid is not null and (c.id is null or (c.owner_id is distinct from actor and role<>'admin'))) then raise exception 'Course management requires ownership'; end if;
  if action='save_course' then
   if length(trim(coalesce(p->>'title','')))<3 or length(trim(coalesce(p->>'description','')))<10 then raise exception 'Enter a course title and description'; end if;
   if cid is null then
    insert into public.courses(owner_id,title,description,subject,difficulty,cover,published) values(actor,left(p->>'title',120),left(p->>'description',4000),left(coalesce(p->>'subject','General knowledge'),60),coalesce(p->>'difficulty','Beginner'),nullif(p->>'cover',''),coalesce((p->>'published')::boolean,false)) returning * into c;
   else
    update public.courses set title=left(p->>'title',120),description=left(p->>'description',4000),subject=left(p->>'subject',60),difficulty=coalesce(p->>'difficulty','Beginner'),cover=nullif(p->>'cover',''),published=coalesce((p->>'published')::boolean,false) where id=cid returning * into c;
   end if;
   return to_jsonb(c);
  end if;
  if cid is null then raise exception 'Choose a course'; end if;
  if action='save_lesson' then
   if length(trim(coalesce(p->>'title','')))<3 or length(trim(coalesce(p->>'body','')))<10 then raise exception 'Enter a title and lesson content'; end if;
   perform 1 from public.courses where id=cid for update;
   oid=(p->>'lesson')::uuid;
   if oid is null then
    insert into public.lessons(course_id,title,body,position) select cid,left(p->>'title',120),left(p->>'body',20000),coalesce(max(position),0)+1 from public.lessons where course_id=cid;
   else
    update public.lessons set title=left(p->>'title',120),body=left(p->>'body',20000) where id=oid and course_id=cid;
   end if;
   return 'true'::jsonb;
  elsif action='attach' then
   qid=(p->>'question')::uuid;
   if not exists(select 1 from public.questions qq where qq.id=qid and qq.status='published') then raise exception 'Select a published question'; end if;
   insert into public.course_questions values(cid,qid) on conflict do nothing;
   return 'true'::jsonb;
  elsif action='save_assessment' then
   if length(trim(coalesce(p->>'title','')))<3 or jsonb_typeof(p->'questions') is distinct from 'array' or jsonb_array_length(p->'questions') not between 1 and 50 then raise exception 'Enter a title and select 1–50 questions'; end if;
   insert into public.assessments(course_id,title,published) values(cid,left(p->>'title',120),coalesce((p->>'published')::bool,false)) returning id into aid;
   for item in select value from jsonb_array_elements(p->'questions') loop
    qid=(item#>>'{}')::uuid;
    if not exists(select 1 from public.questions qq where qq.id=qid and qq.status='published') then raise exception 'Each assessment question must be published'; end if;
    idx=idx+1;
    insert into public.assessment_questions values(aid,qid,idx);
   end loop;
   return to_jsonb(aid);
  elsif action='set_assessment_visibility' then
   aid=(p->>'assessment')::uuid;
   if not exists(select 1 from public.assessments a where a.id=aid and a.course_id=cid) then raise exception 'Assessment unavailable'; end if;
   if coalesce((p->>'published')::bool,false) and exists(
    select 1 from public.assessment_questions aq join public.questions qq on qq.id=aq.question_id where aq.assessment_id=aid and qq.status<>'published'
   ) then raise exception 'Replace unapproved questions before publishing'; end if;
   update public.assessments set published=coalesce((p->>'published')::bool,false) where id=aid and course_id=cid;
   return 'true'::jsonb;
  elsif action='class' then
   return coalesce((select jsonb_agg(to_jsonb(s)) from (
    select u.name,e.enrolled_at,(select count(*) from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id where l.course_id=cid and lp.user_id=u.id) lessons,
    (select count(*) from public.sessions g where g.mode='assessment' and g.finished_at is not null and g.course_id=cid and g.user_id=u.id) assessments,
    (select round(avg(b.score)) from public.sessions g join public.rounds r on r.session_id=g.id join public.submissions b on b.round_id=r.id where g.mode='assessment' and g.course_id=cid and g.user_id=u.id) average
    from public.enrollments e join public.profiles u on u.id=e.user_id where e.course_id=cid order by u.name
   ) s),'[]'::jsonb);
  end if;
 end if;
 if role not in ('instructor','admin') then raise exception 'Staff access required'; end if;
 if action='my_courses' then return coalesce((select jsonb_agg(to_jsonb(c2) order by c2.created_at desc) from public.courses c2 where c2.owner_id=actor or role='admin'),'[]'::jsonb); end if;
 if action='editor_list' then
  return coalesce((select jsonb_agg(to_jsonb(s)) from (
   select qq.id,qq.prompt,qq.kind,qq.status,t.title from public.questions qq join public.topics t on t.id=qq.topic_id
   where (role='admin' or (qq.author_id=actor and qq.status<>'published')) and (p->>'status' is null or qq.status=p->>'status')
   order by qq.updated_at desc limit 24 offset greatest(0,coalesce((p->>'offset')::int,0))
  ) s),'[]'::jsonb);
 end if;
 if action='editor_get' then
  select * into q from public.questions where id=(p->>'question')::uuid and (role='admin' or (author_id=actor and status<>'published'));
  if not found then raise exception 'Question unavailable'; end if;
  return to_jsonb(q)||jsonb_build_object('topic',(select to_jsonb(t) from public.topics t where t.id=q.topic_id),'warnings',public.whirl_validate(q.kind,q.presentation,q.solution,q.explanation,q.source_url,q.source_title));
 end if;
 if action in ('validate','save_question','preview_score') then
  if p->>'kind' not in ('who','where','when','what','why','how') or p->>'kind' is null then raise exception 'Choose a question category'; end if;
  display=jsonb_strip_nulls(jsonb_build_object('options',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',v->'id','label',case when p->>'kind'<>'who' then v->'label' end,'image',case when p->>'kind'='who' then v->'image' end))) from jsonb_array_elements(coalesce(p->'presentation'->'options','[]')) v),
   'images',p->'presentation'->'images','mechanic',p->'presentation'->'mechanic','pairs',p->'presentation'->'pairs','matches',p->'presentation'->'matches','min',p->'presentation'->'min','max',p->'presentation'->'max','precision',p->'presentation'->'precision','seconds',p->'presentation'->'seconds','maxScore',p->'presentation'->'maxScore'));
  warnings=public.whirl_validate(p->>'kind',display,p->'solution',p->>'explanation',p->>'source_url',p->>'source_title');
  if action='validate' then return to_jsonb(warnings); end if;
  if action='preview_score' then
   if cardinality(warnings)>0 then raise exception '%',array_to_string(warnings,' '); end if;
   result=public.whirl_score(p->>'kind',p->'solution',p->'answer',greatest(0,least(3,coalesce((p->>'reveals')::int,0))));
   return jsonb_set(result,'{score}',to_jsonb(public.whirl_award((result->>'score')::int,display,p->'solution',greatest(0,least(3,coalesce((p->>'reveals')::int,0))))))
    || jsonb_build_object('answer',p->'answer','explanation',p->'explanation','sourceUrl',p->'source_url','sourceTitle',p->'source_title');
  end if;
  if length(trim(coalesce(p->>'title','')))<3 or length(trim(coalesce(p->>'prompt','')))<8 then raise exception 'Enter a topic title and a question prompt'; end if;
  qid=(p->>'question')::uuid;
  if qid is null then
   insert into public.topics(slug,title,subject) values(coalesce(nullif(trim(p->>'slug'),''),trim(regexp_replace(lower(p->>'title'),'[^a-z0-9]+','-','g'),'-')),trim(p->>'title'),coalesce(nullif(trim(p->>'subject'),''),'General knowledge'))
    on conflict(slug) do update set slug=excluded.slug returning id into tid;
   insert into public.questions(topic_id,author_id,kind,prompt,difficulty,presentation,solution,explanation,source_url,source_title)
    values(tid,actor,p->>'kind',trim(p->>'prompt'),coalesce(p->>'difficulty','standard'),display,p->'solution',coalesce(p->>'explanation',''),coalesce(p->>'source_url',''),coalesce(p->>'source_title','')) returning * into q;
  else
   update public.questions qq set kind=p->>'kind',prompt=trim(p->>'prompt'), difficulty=coalesce(p->>'difficulty','standard'),presentation=display,solution=p->'solution',explanation=coalesce(p->>'explanation',''),source_url=coalesce(p->>'source_url',''),source_title=coalesce(p->>'source_title',''),status='review',verified_at=null,verified_by=null,updated_at=now()
    where qq.id=qid and (role='admin' or (qq.author_id=actor and qq.status<>'published')) returning * into q;
   if not found then raise exception 'Question unavailable'; end if;
   if role='admin' then
    update public.topics set title=trim(p->>'title'),subject=coalesce(nullif(trim(p->>'subject'),''),'General knowledge') where id=q.topic_id;
   end if;
  end if;
  return jsonb_build_object('id',q.id,'warnings',warnings);
 end if;
 if role<>'admin' then raise exception 'Administrator access required'; end if;
 if action='review' then
  select * into q from public.questions where id=(p->>'question')::uuid for update;
  if not found then raise exception 'Question unavailable'; end if;
  if p->>'decision'='publish' then
   warnings=public.whirl_validate(q.kind,q.presentation,q.solution,q.explanation,q.source_url,q.source_title);
   if cardinality(warnings)>0 then raise exception '%',array_to_string(warnings,' '); end if;
   if p->>'confirm' is distinct from 'true' then raise exception 'Confirm that facts and media rights were reviewed'; end if;
   update public.questions set status='published',verified_at=now(),verified_by=actor,updated_at=now() where id=q.id;
  elsif p->>'decision'='reject' then
   update public.questions set status='rejected',verified_at=null,verified_by=null,updated_at=now() where id=q.id;
  else raise exception 'Choose publish or reject'; end if;
  return 'true'::jsonb;
 end if;
 if action='users' then return coalesce((select jsonb_agg(to_jsonb(g)) from (select * from public.profiles order by created_at desc limit 50 offset greatest(0,coalesce((p->>'offset')::int,0))) g),'[]'::jsonb); end if;
 if action='role' then
  oid=(p->>'user')::uuid;
  if oid=actor then raise exception 'You cannot change your own role'; end if;
  update public.profiles set role=p->>'role' where id=oid;
  return 'true'::jsonb;
 end if;
 if action='admin_stats' then
  return jsonb_build_object('users',(select count(*) from public.profiles),'courses',(select count(*) from public.courses where published),
   'topics',(select count(*) from public.topics),'publishedTopics',(select count(distinct topic_id) from public.questions where status='published'),
   'published',(select count(*) from public.questions where status='published'),'review',(select count(*) from public.questions where status='review'),
   'rejected',(select count(*) from public.questions where status='rejected'),
   'unverified',(select count(*) from public.questions where verified_at is null),
   'missingMedia',(select count(*) from public.questions qq where (kind='who' and not presentation ? 'options') or (kind='what' and not presentation ? 'images')),
   'reports',(select count(*) from public.reports),'today',(select count(*) from public.sessions where created_at>=date_trunc('day',now())),
   'types',coalesce((select jsonb_agg(to_jsonb(s)) from (select kind name,count(*) n from public.questions where status='published' group by kind) s),'[]'::jsonb),
   'subjects',coalesce((select jsonb_agg(to_jsonb(s)) from (select subject name,count(*) n from public.topics group by subject) s),'[]'::jsonb),
   'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from public.import_jobs j),'[]'::jsonb));
 end if;
 if action='reports' then return coalesce((select jsonb_agg(to_jsonb(s)) from (select r.*,q2.prompt from public.reports r join public.questions q2 on q2.id=r.question_id order by r.created_at desc limit 50) s),'[]'::jsonb); end if;
 raise exception 'Unknown workspace action';
end; $$;
revoke execute on function public.whirl_workspace(text,jsonb),public.whirl_profile() from public,anon,authenticated;
grant execute on function public.whirl_workspace(text,jsonb) to anon,authenticated;
