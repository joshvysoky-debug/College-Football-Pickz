import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  fetchGames,
  fetchTeams,
  fetchTop25,
  fetchSpRanks,
  fetchLiveScoreboard,
  fetchActualPlayoffField,
  fetchEspnWeeks,
  getWeekForDate,
  currentSeasonAndWeek,
} from '@/lib/cfbd';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return true;

  const querySecret = request.nextUrl.searchParams.get('secret');
  return querySecret === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { season } = currentSeasonAndWeek();

  try {
    // ESPN's calendar defines what "week" means here (see fetchEspnWeeks'
    // comment in lib/cfbd.ts — CFBD's own per-game week field doesn't
    // match it). Also fetch the CFBD schedule for the *entire* regular
    // season in one call (omitting `week` — CFBD's /games endpoint
    // returns the whole season's games without it) rather than pulling
    // week-by-week: since our own week boundaries don't line up with
    // CFBD's, filtering by CFBD's week number could miss games that
    // belong in a given ESPN week. Every game gets (re-)bucketed into our
    // own week number below, from its actual start_date.
    const [espnWeeks, teams, seasonGames, spRanks] = await Promise.all([
      fetchEspnWeeks(season),
      fetchTeams(season),
      fetchGames({ year: season, seasonType: 'regular' }),
      fetchSpRanks(season),
    ]);

    const currentWeek = getWeekForDate(espnWeeks, new Date());

    // AP Top 25 is still fetched per-week from CFBD (there's no
    // whole-season version of this endpoint), using CFBD's own week
    // numbering — since that can lag/lead our ESPN-based numbering by a
    // week or two early in the season, this is a best-effort input to the
    // "featured game" flag below, not to any bylaws scoring math (which
    // relies on the season-wide SP+ ranks instead).
    const top25 = await fetchTop25({ year: season, week: currentWeek });

    const teamRows = teams.map((t) => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      conference: t.conference,
      classification: t.classification,
      logo_url: t.logos?.[0] ? t.logos[0].replace(/^http:\/\//, 'https://') : null,
    }));

    const knownTeamIds = new Set(teamRows.map((t) => t.id));

    const games = seasonGames;

    // Needs the actual games list (for team-name matching against ESPN's
    // scoreboard) so this can't join the Promise.all above — it has to run
    // after `games` exists. See fetchLiveScoreboard's doc comment for why
    // this isn't a CFBD call.
    const liveScoreboard = await fetchLiveScoreboard(games);

    // CFBD's /teams endpoint (even filtered to division=fbs) only covers
    // that season's FBS roster. Games against FCS/lower-division opponents
    // (common in early-season "money games") reference a team id that never
    // shows up there. Without some row for that id, the pick'em UI has no
    // name to render and has to hide the whole matchup - so backfill a
    // minimal team row straight from the game payload, which always carries
    // the opponent's name (and their real classification) even when CFBD's
    // team list doesn't include them.
    for (const g of games) {
      if (!knownTeamIds.has(g.home_id)) {
        teamRows.push({
          id: g.home_id,
          school: g.home_team,
          mascot: null,
          conference: null,
          classification: g.home_classification,
          logo_url: null,
        });
        knownTeamIds.add(g.home_id);
      }
      if (!knownTeamIds.has(g.away_id)) {
        teamRows.push({
          id: g.away_id,
          school: g.away_team,
          mascot: null,
          conference: null,
          classification: g.away_classification,
          logo_url: null,
        });
        knownTeamIds.add(g.away_id);
      }
    }

    if (teamRows.length > 0) {
      const { error } = await supabase.from('teams').upsert(teamRows);
      if (error) throw error;
    }

    const confByTeamId = new Map(teams.map((t) => [t.id, t.conference]));

    // app/api/sync/live can grade a game (completed/winner_team_id) ahead
    // of this sync, from ESPN's fast final-state signal. This sync must
    // never revert that — only take over as the authoritative record once
    // CFBD's own data agrees the game is over. Pulling the current DB
    // state first is what makes that check possible.
    const gameIds = games.map((g) => g.id);
    const { data: existingRows, error: existingError } =
      gameIds.length > 0
        ? await supabase
            .from('games')
            .select('id, completed, winner_team_id, home_points, away_points, overtime, live_status, period, clock')
            .in('id', gameIds)
        : { data: [] as Array<{
            id: number;
            completed: boolean;
            winner_team_id: number | null;
            home_points: number | null;
            away_points: number | null;
            overtime: boolean;
            live_status: string | null;
            period: number | null;
            clock: string | null;
          }>, error: null };
    if (existingError) throw existingError;
    const existingById = new Map((existingRows ?? []).map((r) => [r.id, r]));

    const gameRows = games.map((g) => {
      const homeRank = top25.get(g.home_team) ?? null;
      const awayRank = top25.get(g.away_team) ?? null;
      const isRanked = homeRank !== null || awayRank !== null;
      const isSecMatchup =
        confByTeamId.get(g.home_id) === 'SEC' || confByTeamId.get(g.away_id) === 'SEC';

      // Best-effort live status for this game, if the scoreboard endpoint
      // returned one. Games not currently in progress (not yet kicked off,
      // already final, or just absent from this particular poll) simply
      // won't have an entry, and gameRows below fall back to nulls — the
      // UI treats null period/clock as "no live data" and shows its
      // pre-kickoff countdown or Final badge instead.
      const live = liveScoreboard.get(g.id);
      const existing = existingById.get(g.id);

      // ESPN already graded this game (via app/api/sync/live) and CFBD
      // hasn't caught up yet — leave the scoring fields exactly as they
      // are rather than reverting to CFBD's still-in-progress numbers.
      // Once CFBD's own g.completed flips true, this stops applying and
      // CFBD's values take over below as normal.
      const alreadyGradedByEspn = existing?.completed === true && !g.completed;

      const homePoints = alreadyGradedByEspn
        ? existing!.home_points
        : g.completed
          ? g.home_points
          : live?.homePoints ?? g.home_points;
      const awayPoints = alreadyGradedByEspn
        ? existing!.away_points
        : g.completed
          ? g.away_points
          : live?.awayPoints ?? g.away_points;

      return {
        id: g.id,
        season: g.season,
        // Our own week bucket, derived from ESPN's calendar and this
        // game's actual kickoff — not CFBD's g.week (see fetchEspnWeeks'
        // comment in lib/cfbd.ts for why those two numbers can differ).
        week: getWeekForDate(espnWeeks, new Date(g.start_date)),
        season_type: g.season_type,
        start_date: g.start_date,
        home_team_id: g.home_id,
        away_team_id: g.away_id,
        home_points: homePoints,
        away_points: awayPoints,
        completed: alreadyGradedByEspn ? true : g.completed,
        winner_team_id: alreadyGradedByEspn
          ? existing!.winner_team_id
          : g.completed
            ? (g.home_points ?? 0) > (g.away_points ?? 0)
              ? g.home_id
              : g.away_id
            : null,
        featured: isRanked || isSecMatchup,
        home_rank: homeRank,
        away_rank: awayRank,
        neutral_site: g.neutral_site,
        overtime: alreadyGradedByEspn ? existing!.overtime : g.overtime,
        // Full-field SP+ rank, used to test the bylaws' "ranked at least 20
        // spots higher" upset rule even when neither team is in the AP
        // Top 25 (e.g. two unranked SEC teams playing each other).
        home_sp_rank: spRanks.get(g.home_team) ?? null,
        away_sp_rank: spRanks.get(g.away_team) ?? null,
        // FCS opponents never get an SP+ rank, so classification is stored
        // separately to let lib/scoring.ts force FBS-vs-FCS games to count
        // as upsets regardless of (missing) rank data.
        home_classification: g.home_classification,
        away_classification: g.away_classification,
        // Live in-progress state (see fetchLiveScoreboard) — drives the
        // "Q3 · 8:42" badge in place of the static "Kicked off" label.
        live_status: alreadyGradedByEspn ? existing!.live_status : live?.status ?? null,
        period: alreadyGradedByEspn ? existing!.period : live?.period ?? null,
        clock: alreadyGradedByEspn ? existing!.clock : live?.clock ?? null,
      };
    });

    if (gameRows.length > 0) {
      const { error } = await supabase.from('games').upsert(gameRows);
      if (error) throw error;
    }

    // Best-effort: once the CFP bracket is announced, this recovers the
    // real 12-team field so playoff picks can be graded (Article V). Before
    // the bracket exists this just returns an empty list, which is a no-op
    // here rather than something worth failing the whole sync over.
    let playoffFieldSynced = 0;
    try {
      const fieldTeamIds = await fetchActualPlayoffField(season);
      if (fieldTeamIds.length > 0) {
        const { error } = await supabase
          .from('playoff_field')
          .upsert(fieldTeamIds.map((team_id) => ({ season, team_id })));
        if (error) throw error;
        playoffFieldSynced = fieldTeamIds.length;
      }
    } catch (err) {
      console.error('playoff field sync failed (non-fatal)', err);
    }

    return NextResponse.json({
      ok: true,
      season,
      week: currentWeek,
      teamsSynced: teamRows.length,
      gamesSynced: gameRows.length,
      rankedSchoolsFound: top25.size,
      spRanksFound: spRanks.size,
      liveGamesFound: liveScoreboard.size,
      playoffFieldSynced,
    });
  } catch (err) {
    console.error('sync failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 }
    );
  }
}
