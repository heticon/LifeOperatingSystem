-- Life OS — database schema (Supabase / Postgres).
-- Run once in Supabase → SQL Editor → New query → paste → Run.

-- One row per record (task, project, homework, …) so edits from two devices
-- never overwrite each other's unrelated changes.
create table if not exists public.items (
  id          text        not null,
  user_id     uuid        not null default auth.uid() references auth.users on delete cascade,
  kind        text        not null,               -- task | project | homework | subject | timetable | focus | event
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(), -- set by the device that made the change (last write wins)
  deleted     boolean     not null default false, -- soft delete so other devices learn about it
  primary key (user_id, id)
);

-- Server time of the last write. Devices pull "everything with synced_at after my last pull",
-- so an edit made offline (old updated_at) and uploaded later is still picked up.
alter table public.items add column if not exists synced_at timestamptz not null default now();

create or replace function public.items_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.synced_at := now(); return new; end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.items_touch();

drop index if exists public.items_user_updated;
create index if not exists items_user_synced on public.items (user_id, synced_at);

-- Row-level security: every row is visible and editable only by its owner.
alter table public.items enable row level security;

drop policy if exists "own rows" on public.items;
create policy "own rows" on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Live updates to other open devices.
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;
