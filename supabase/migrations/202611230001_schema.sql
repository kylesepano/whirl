create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 70),
 role text not null default 'student' check(role in ('student','instructor','admin')),
 created_at timestamptz not null default now()
);
create function public.whirl_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,name) values(new.id, coalesce(nullif(left(trim(new.raw_user_meta_data->>'name'),70),''),'Explorer'));
 return new;
end; $$;
create trigger whirl_new_user after insert on auth.users for each row execute function public.whirl_profile();
create table public.topics (
 id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null,
 subject text not null, description text not null default '', created_at timestamptz default now()
);
create table public.questions (
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.topics,
 author_id uuid references public.profiles on delete set null,
 kind text not null check(kind in ('who','where','when','what','why','how')),
 prompt text not null check(length(prompt) between 8 and 500), difficulty text not null default 'standard' check(difficulty in ('easy','standard','hard')),
 presentation jsonb not null default '{}', solution jsonb not null default '{}',
 explanation text not null default '', source_url text not null default '', source_title text not null default '',
 status text not null default 'review' check(status in ('review','published','rejected')),
 verified_at timestamptz, verified_by uuid references public.profiles on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(topic_id,kind)
);
create unique index whirl_prompt_unique on public.questions(lower(trim(prompt)));
create index whirl_playable on public.questions(kind,status) where status='published';
create table public.courses (
 id uuid primary key default gen_random_uuid(), owner_id uuid references public.profiles on delete set null,
 title text not null, description text not null, subject text not null, difficulty text not null default 'Beginner',
 cover text, published boolean not null default false, created_at timestamptz default now()
);
create table public.lessons (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses on delete cascade,
 title text not null, body text not null, position integer not null, unique(course_id,position)
);
create table public.enrollments (
 course_id uuid references public.courses on delete cascade, user_id uuid references public.profiles on delete cascade,
 enrolled_at timestamptz not null default now(), primary key(course_id,user_id)
);
create table public.lesson_progress (
 lesson_id uuid references public.lessons on delete cascade, user_id uuid references public.profiles on delete cascade,
 completed_at timestamptz not null default now(), primary key(lesson_id,user_id)
);
create table public.course_questions (
 course_id uuid references public.courses on delete cascade, question_id uuid references public.questions,
 primary key(course_id,question_id)
);
create table public.assessments (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses on delete cascade,
 title text not null, published boolean not null default false, created_at timestamptz not null default now()
);
create table public.assessment_questions (
 assessment_id uuid references public.assessments on delete cascade, question_id uuid references public.questions,
 position integer not null, primary key(assessment_id,question_id), unique(assessment_id,position)
);
create table public.sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 mode text not null check(mode in ('quick','classic','marathon','practice','course','assessment')),
 target integer, course_id uuid references public.courses, assessment_id uuid references public.assessments,
 created_at timestamptz not null default now(), finished_at timestamptz
);
create index whirl_sessions_user on public.sessions(user_id,created_at desc);
create table public.rounds (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sessions on delete cascade,
 question_id uuid not null references public.questions, position integer not null,
 snapshot jsonb not null, opened_at timestamptz not null default now(), deadline timestamptz,
 reveals integer not null default 0 check(reveals between 0 and 3), unique(session_id,position)
);
create table public.submissions (
 round_id uuid primary key references public.rounds on delete cascade,
 answer jsonb not null, score integer not null check(score between 0 and 1000),
 feedback jsonb not null, created_at timestamptz not null default now()
);
create index whirl_rounds_question on public.rounds(question_id,session_id);
create index whirl_enrollments_user on public.enrollments(user_id);
create index whirl_progress_user on public.lesson_progress(user_id);
create table public.import_jobs (
 id uuid primary key default gen_random_uuid(), source text not null, cursor text not null default '0',
 processed integer not null default 0, updated_at timestamptz not null default now(), unique(source)
);
create table public.reports (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles on delete cascade,
 question_id uuid references public.questions on delete cascade, reason text not null, created_at timestamptz default now(),
 unique(user_id,question_id)
);
alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.questions enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.course_questions enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.sessions enable row level security;
alter table public.rounds enable row level security;
alter table public.submissions enable row level security;
alter table public.import_jobs enable row level security;
alter table public.reports enable row level security;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy session_self on public.sessions for select to authenticated using(user_id=auth.uid());
revoke all on public.profiles, public.topics, public.questions, public.courses, public.lessons, public.enrollments, public.lesson_progress, public.course_questions, public.assessments, public.assessment_questions, public.sessions, public.rounds, public.submissions, public.import_jobs, public.reports from public,anon,authenticated;
grant select on public.profiles,public.sessions to authenticated;
