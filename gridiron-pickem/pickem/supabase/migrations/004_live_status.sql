-- Gridiron Pick'em — live game status migration
-- Run this once in the Supabase SQL editor, after 003_classification.sql
-- has already been applied.
--
-- Adds columns to hold CFBD's live scoreboard data (status/period/clock),
-- so the UI can show "Q3 · 8:42" instead of a static "Kicked off" badge
-- once a game is actually in progress. These are populated best-effort by
-- the sync route from CFBD's live scoreboard endpoint, which is separate
-- from the historical /games endpoint games.completed/points come from.
-- Games that haven't kicked off yet, or where the live endpoint didn't
-- return a row (e.g. between syncs, or if the live endpoint isn't
-- reachable on the current CFBD plan), simply keep these columns null —
-- the UI falls back to the existing pre-kickoff countdown in that case.

alter table games
  add column if not exists live_status text,
  add column if not exists period smallint,
  add column if not exists clock text;
