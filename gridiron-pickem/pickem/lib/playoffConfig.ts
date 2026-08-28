import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Number of teams each player may select for the playoff picks.
 * Currently matches the CFP field size — bump this if the format changes.
 */
export const MAX_PLAYOFF_PICKS = 12;

/**
 * Playoff picks lock the moment the first Week 1 game of the season kicks
 * off — same "picks lock at kickoff" pattern already used for weekly game
 * picks. Restricted to featured games so this lines up with what's actually
 * visible on This Week; the games table also carries a long tail of
 * lower-profile/non-featured games (backfilled money-game opponents, data
 * quality leftovers) that can kick off earlier and would otherwise lock
 * picks before the real Week 1 slate even starts. Returns null if Week 1
 * hasn't been synced yet, in which case picks should be treated as
 * unlocked (fail-open rather than blocking everything just because sync
 * hasn't run yet).
 */
export async function getPlayoffPicksLockTime(
  supabase: SupabaseClient<Database>,
  season: number
): Promise<Date | null> {
  const { data } = await supabase
    .from('games')
    .select('start_date')
    .eq('season', season)
    .eq('week', 1)
    .eq('featured', true)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? new Date(data.start_date) : null;
}
