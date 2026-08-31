import type { createClient, createServiceClient } from '@/lib/supabase/server';

type SupabaseServerClient = ReturnType<typeof createClient> | ReturnType<typeof createServiceClient>;

/**
 * Which week to send someone to when they land on "/" (This Week) or
 * "/recap" with no week specified.
 *
 * `currentSeasonAndWeek()` in lib/cfbd.ts is a fixed calendar formula
 * (hardcoded Aug 24 season start, 7-day buckets). That formula is fine for
 * its actual job — telling the sync routes which week of fresh CFBD/ESPN
 * data to keep pulling forward — because sync just keeps every week's
 * games around forever once fetched; being a day early or late to start
 * pulling a new week is harmless.
 *
 * It's the wrong tool for deciding what a person *sees*, though: it has no
 * relationship to any actual kickoff. As soon as "now" crosses its
 * hardcoded boundary, "/" jumps to the next week even if that week's games
 * haven't been played (or even started) yet — which is exactly what made
 * Week 1's games disappear from "This Week" a couple of days after they
 * were played, while Week 2's games were still days away.
 *
 * Instead, derive the displayed week from games that actually exist in
 * the `games` table: the current week is the highest week number that has
 * at least one game whose kickoff has already passed. That keeps "This
 * Week" pinned on Week 1 all the way through the weekend and into the
 * following week, until Week 2's own games start kicking off — whatever
 * real dates those happen to fall on.
 */
export async function getDisplayWeek(
  supabase: SupabaseServerClient,
  season: number
): Promise<number> {
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
