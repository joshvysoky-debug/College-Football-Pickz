-- Gridiron Pick'em — Bylaws scoring migration
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query),
-- after 001 (schema.sql) has already been applied.
--
-- Adds the data needed to implement Article III (weighted scoring) and
-- Article V (playoff prediction scoring) from the CFB Game Time Bylaws:
--   - games.neutral_site / games.overtime: needed to tell Home Upset (4) /
--     Away Upset (6) / Neutral-Site Upset (4) apart, and to award the
--     1-point Overtime Loss consolation.
--   - games.home_sp_rank / games.away_sp_rank: a full-FBS-field numeric rank
--     (from CFBD's SP+ ratings) used for the "ranked at least 20 spots
--     higher" upset test. This is deliberately separate from
--     home_rank/away_rank, which only cover the AP Top 25 and stay in place
--     purely to drive the existing "featured game" filter.
--   - playoff_field: the actual 12-team College Football Playoff field for a
--     season, used to grade playoff_picks per Article V. Populated by the
--     sync job once the field is announced; if the automatic sync ever
--     misses a team, add/remove rows here directly in the Supabase table
--     editor as a manual override.

alter table games
  add column if not exists neutral_site boolean not null default false,
  add column if not exists overtime boolean not null default false,
  add column if not exists home_sp_rank int,
  add column if not exists away_sp_rank int;

create table if not exists playoff_field (
  season int not null,
  team_id bigint not null references teams(id),
  primary key (season, team_id)
);

alter table playoff_field enable row level security;

drop policy if exists "playoff_field readable by authenticated" on playoff_field;
create policy "playoff_field readable by authenticated" on playoff_field
  for select using (auth.role() = 'authenticated');

-- The old count-based `standings` view (correct picks / total_completed) is
-- no longer used by the app — points are now computed in application code
-- (lib/scoring.ts + lib/standings.ts) since the scoring rules depend on
-- rank differentials and overtime, which aren't practical to express as a
-- SQL view. Left in place rather than dropped, in case it's still useful
-- for ad-hoc querying/reporting.
