-- Gridiron Pick'em — FCS/FBS classification migration
-- Run this once in the Supabase SQL editor, after 002_scoring.sql has
-- already been applied.
--
-- Denormalizes each game's home/away classification ('fbs' / 'fcs' / etc.)
-- directly onto the games row, mirroring how neutral_site/overtime/
-- home_sp_rank/away_sp_rank were added in 002. This is what lets
-- lib/scoring.ts detect an FBS-vs-FCS game and force it to count as an
-- upset, since SP+ never assigns FCS teams a numeric rank to compare —
-- without this column, an FCS team beating an FBS team was silently
-- scored as a plain Win instead of the upset it actually is.

alter table games
  add column if not exists home_classification text,
  add column if not exists away_classification text;
