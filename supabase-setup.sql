-- ============================================================
-- FocusLog — Supabase schema + security (run once)
-- Paste this into your Supabase project: SQL Editor → New query → Run.
-- ============================================================

-- ---------- EXAMS ----------
create table if not exists public.exams (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text,
  exam_date   date,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- ---------- SESSIONS ----------
create table if not exists public.sessions (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  exam_id      uuid,
  start_ts     timestamptz not null,
  end_ts       timestamptz,
  duration_sec integer not null default 0,
  effort       integer,
  attention    integer,
  note         text,
  source       text,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- ---------- PLANS ----------
create table if not exists public.plans (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  exam_id      uuid,
  kind         text not null,            -- 'once' | 'weekly'
  date         date,
  weekday      integer,                  -- 0=Sun … 6=Sat
  time         text,
  duration_min integer,
  note         text,
  done         boolean not null default false,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- Helpful indexes for incremental sync
create index if not exists exams_user_upd    on public.exams    (user_id, updated_at);
create index if not exists sessions_user_upd on public.sessions (user_id, updated_at);
create index if not exists plans_user_upd    on public.plans    (user_id, updated_at);

-- ============================================================
-- Row Level Security: each user can only see/change their rows
-- ============================================================
alter table public.exams    enable row level security;
alter table public.sessions enable row level security;
alter table public.plans    enable row level security;

-- exams
drop policy if exists "own exams" on public.exams;
create policy "own exams" on public.exams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sessions
drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- plans
drop policy if exists "own plans" on public.plans;
create policy "own plans" on public.plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Done. FocusLog will now sync your data across every signed-in device.
