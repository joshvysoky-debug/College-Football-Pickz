import type { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchEspnWeeks, getWeekForDate } from '@/lib/cfbd';

type SupabaseServerClient = ReturnType<typeof createClient> | ReturnType<typeof createServiceClient>;

/**
 * Which week to send someone to when they land on "/" (This Week) or
 * "/recap" with no week specified — and also which week the sync routes
 * treat as "current" for their own purposes (see both sync route files).
 *
 * Primary source: ESPN's own regular-season week calendar (see
 * `fetchEspnWeeks` in lib/cfbd.ts) — the real, sometimes irregular-length
 * week boundaries the group actually means by "Week 1", "Week 2", etc.
 * (CFBD's own per-game `week` field doesn't match this — see that
 * function's comment for why relying on CFBD's numbering broke Week 1.)
 *
 * Fallback: if ESPN's endpoint is unreachable or returns nothing, fall
 * back to deriving the week from games already in our own `games` table
 * — the highest week number that has at least one game whose kickoff has
 * already passed. This is a looser approximation (it can't know about a
 * new week before something in it has actually started), but it keeps
 * "This Week" working rather than failing outright if ESPN's undocumented
 * endpoint ever goes down or changes shape.
 */
export async function getDisplayWeek(
  supabase: SupabaseServerClient,
  season: number
): Promise<number> {
  try {
    const weeks = await fetchEspnWeeks(season);
    if (weeks.length > 0) {
      return getWeekForDate(weeks, new Date());
    }
  } catch (err) {
    console.error('getDisplayWeek: ESPN calendar fetch failed, falling back to DB', err);
  }

  const { data, error } = await supabase
    .from('games')
    .select('week')
    .eq('season', season)
    .lte('start_date', new Date().toISOString())
    .order('week', { ascending: false })
    .limit(1);

  if (error) {
    console.error('getDisplayWeek: failed to look up games, defaulting to week 1', error);
    return 1;
  }

  return data?.[0]?.week ?? 1;
}
