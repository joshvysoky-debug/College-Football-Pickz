import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  fetchGames,
  fetchTeams,
  fetchTop25,
  fetchSpRanks,
  fetchLiveScoreboard,
  fetchActualPlayoffField,
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
  const { season, week } = currentSeasonAndWeek();

  try {
    const [teams, thisWeek, lastWeek, top25, spRanks] = await Promise.all([
      fetchTeams(season),
      fetchGames({ year: season, week }),
      week > 1 ? fetchGames({ year: season, week: week - 1 }) : Promise.resolve([]),
      fetchTop25({ year: season, week }),
      fetchSpRanks(season),
    ]);

    const teamRows = teams.map((t) => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      conference: t.conference,
      classification: t.classification,
      logo_url: t.logos?.[0] ? t.logos[0].replace(/^http:\/\//, 'https://') : null,
    }));

    const knownTeamIds = new Set(teamRows.map((t) => t.id));

    const games = [...lastWeek, ...thisWeek];

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

      // While a game is in progress, ESPN's scoreboard score (see
      // fetchLiveScoreboard) is more current than CFBD's home_points/
      // away_points, which isn't guaranteed to update play-by-play on a
      // free-tier key. Once the game is no longer in the live map (i.e.
      // it's final), CFBD's own points are the source of truth again.
      const homePoints = live?.homePoints ?? g.home_points;
      const awayPoints = live?.awayPoints ?? g.away_points;

      return {
        id: g.id,
        season: g.season,
        week: g.week,
        season_type: g.season_type,
        start_date: g.start_date,
        home_team_id: g.home_id,
        away_team_id: g.away_id,
        home_points: homePoints,
        away_points: awayPoints,
        completed: g.completed,
        winner_team_id: g.completed
          ? (g.home_points ?? 0) > (g.away_points ?? 0)
            ? g.home_id
            : g.away_id
          : null,
        featured: isRanked || isSecMatchup,
        home_rank: homeRank,
        away_rank: awayRank,
        neutral_site: g.neutral_site,
        overtime: g.overtime,
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
        live_status: live?.status ?? null,
        period: live?.period ?? null,
        clock: live?.clock ?? null,
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
      week,
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
