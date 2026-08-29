import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchLiveScoreboard, currentSeasonAndWeek } from '@/lib/cfbd';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return true;

  const querySecret = request.nextUrl.searchParams.get('secret');
  return querySecret === secret;
}

/**
 * Lightweight, CFBD-free companion to /api/sync. Refreshes the live
 * in-progress score/status (home_points, away_points, live_status, period,
 * clock) for this week's (and last week's, in case of a late finish)
 * not-yet-completed games, by pinging ESPN's free public scoreboard —
 * zero CFBD calls, so this can run as often as we like (every couple of
 * minutes) without touching CFBD's monthly call budget.
 *
 * Grading: the moment ESPN reports a game as final, this route grades it
 * immediately (completed, winner_team_id, overtime) using ESPN's own
 * score, rather than waiting on the much less frequent /api/sync. This is
 * a deliberate, agreed exception to "CFBD only" grading — final scores
 * are unambiguous facts both providers report identically almost always,
 * and the risk isn't accuracy, it's ESPN's matching pipeline missing a
 * game. /api/sync is the backstop for that: every time it runs, it
 * recomputes completed/winner_team_id from CFBD's own data and takes
 * over as the authoritative record the moment CFBD agrees the game is
 * over — see that route's comments for the exact handoff logic. This
 * route only ever grades a game once ESPN says it's final; it never
 * un-grades one.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { season, week } = currentSeasonAndWeek();

  try {
    // Only bother pinging ESPN for games that aren't already final — a
    // completed game can't still be "in progress" on ESPN's scoreboard,
    // and skipping them keeps this from ever touching a graded game.
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, home_team_id, away_team_id, home_points, away_points')
      .eq('season', season)
      .in('week', week > 1 ? [week - 1, week] : [week])
      .eq('completed', false);

    if (gamesError) throw gamesError;

    if (!games || games.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, updated: 0 });
    }

    const teamIds = Array.from(
      new Set(
        games
          .flatMap((g) => [g.home_team_id, g.away_team_id])
          .filter((id): id is number => id !== null)
      )
    );

    const { data: teams, error: teamsError } =
      teamIds.length > 0
        ? await supabase.from('teams').select('id, school').in('id', teamIds)
        : { data: [] as { id: number; school: string }[], error: null };

    if (teamsError) throw teamsError;

    const schoolById = new Map((teams ?? []).map((t) => [t.id, t.school]));

    // fetchLiveScoreboard matches by school name, so games whose teams
    // aren't in the teams table yet (shouldn't normally happen — the
    // heavy sync backfills these) are simply skipped for this pass rather
    // than failing the whole request.
    const espnInput = games
      .map((g) => {
        const home_team = g.home_team_id !== null ? schoolById.get(g.home_team_id) : undefined;
        const away_team = g.away_team_id !== null ? schoolById.get(g.away_team_id) : undefined;
        if (!home_team || !away_team) return null;
        return { id: g.id, home_team, away_team };
      })
      .filter((g): g is { id: number; home_team: string; away_team: string } => g !== null);

    const liveScoreboard = await fetchLiveScoreboard(espnInput);

    const updates = games
      .map((g) => {
        const live = liveScoreboard.get(g.id);
        if (!live) return null;

        const home_points = live.homePoints ?? g.home_points;
        const away_points = live.awayPoints ?? g.away_points;

        // ESPN reports this game as final — grade it right away rather
        // than waiting for the next CFBD sync (which still re-confirms
        // this at its own cadence and takes over as the authoritative
        // record once it agrees; see app/api/sync/route.ts). Requires
        // both team ids to be known, which they always should be for a
        // game already sitting in the games table.
        if (live.completed && g.home_team_id !== null && g.away_team_id !== null) {
          return {
            id: g.id,
            home_points,
            away_points,
            live_status: live.status,
            period: live.period,
            clock: live.clock,
            completed: true,
            winner_team_id:
              (home_points ?? 0) > (away_points ?? 0) ? g.home_team_id : g.away_team_id,
            // ESPN's period reflects the last period actually played;
            // anything past regulation's 4 quarters means overtime, the
            // same signal CFBD's own line-score-count derivation uses.
            overtime: (live.period ?? 0) > 4,
          };
        }

        return {
          id: g.id,
          home_points,
          away_points,
          live_status: live.status,
          period: live.period,
          clock: live.clock,
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    // Plain per-row updates rather than upsert — upsert would need every
    // NOT NULL column (season, week, start_date, etc.) supplied or it can
    // fail the insert path Postgres builds internally, and this route
    // only ever touches games that already exist.
    if (updates.length > 0) {
      const results = await Promise.all(
        updates.map((u) => {
          const { id, ...fields } = u;
          return supabase.from('games').update(fields).eq('id', id);
        })
      );
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;
    }

    return NextResponse.json({ ok: true, checked: games.length, updated: updates.length });
  } catch (err) {
    console.error('live sync failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'live sync failed' },
      { status: 500 }
    );
  }
}
