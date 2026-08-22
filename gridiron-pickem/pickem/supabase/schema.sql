-- Gridiron Pick'em schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

create extension if not exists "pgcrypto";

-- ---------- Tables ----------

create table if not exists teams (
  id bigint primary key,
  school text not null,
  mascot text,
  conference text,
  logo_url text
);

create table if not exists games (
  id bigint primary key, -- CFBD game id
  season int not null,
  week int not null,
  season_type text not null default 'regular',
  start_date timestamptz not null,
  home_team_id bigint references teams(id),
  away_team_id bigint references teams(id),
  home_points int,
  away_points int,
  completed boolean not null default false,
  winner_team_id bigint references teams(id)
);

create index if not exists games_season_week_idx on games(season, week);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text
);

create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  game_id bigint not null references games(id) on delete cascade,
  picked_team_id bigint not null references teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

-- ---------- Auto-create a profile row when someone signs up ----------

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep updated_at fresh on picks
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists picks_set_updated_at on picks;
create trigger picks_set_updated_at
  before update on picks
  for each row execute procedure public.set_updated_at();

-- ---------- Standings view ----------

create or replace view standings as
select
  p.user_id,
  pr.display_name,
  count(*) filter (where g.completed and p.picked_team_id = g.winner_team_id) as correct,
  count(*) filter (where g.completed) as total_completed
from picks p
join games g on g.id = p.game_id
join profiles pr on pr.id = p.user_id
group by p.user_id, pr.display_name;

-- ---------- Row Level Security ----------

alter table teams enable row level security;
alter table games enable row level security;
alter table profiles enable row level security;
alter table picks enable row level security;

-- teams & games: readable by any signed-in friend; writes only via the
-- service-role key used by the sync job, which bypasses RLS entirely.
drop policy if exists "teams readable by authenticated" on teams;
create policy "teams readable by authenticated" on teams
  for select using (auth.role() = 'authenticated');

drop policy if exists "games readable by authenticated" on games;
create policy "games readable by authenticated" on games
  for select using (auth.role() = 'authenticated');

-- profiles: everyone in the pool can see display names; you can only edit your own.
drop policy if exists "profiles readable by authenticated" on profiles;
create policy "profiles readable by authenticated" on profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles updatable by owner" on profiles;
create policy "profiles updatable by owner" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- picks: you can always see your own; you can see someone else's pick only
-- once that game has kicked off (keeps picks secret beforehand).
drop policy if exists "read own picks" on picks;
create policy "read own picks" on picks
  for select using (auth.uid() = user_id);

drop policy if exists "read locked picks" on picks;
create policy "read locked picks" on picks
  for select using (
    exists (
      select 1 from games g
      where g.id = picks.game_id and g.start_date <= now()
    )
  );

drop policy if exists "insert own picks before lock" on picks;
create policy "insert own picks before lock" on picks
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from games g where g.id = game_id and g.start_date > now())
  );

drop policy if exists "update own picks before lock" on picks;
create policy "update own picks before lock" on picks
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from games g where g.id = game_id and g.start_date > now())
  );
