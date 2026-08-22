import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchGames, fetchTeams, fetchTop25, currentSeasonAndWeek } from '@/lib/cfbd';

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
    const [teams, thisWeek, lastWeek, top25] = await Promise.all([
      fetchTeams(season),
      fetchGames({ year: season, week }),
      week > 1 ? fetchGames({ year: season, week: week - 1 }) : Promise.resolve([]),
      fetchTop25({ year: season, week }),
    ]);

    const teamRows = teams.map((t) => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      conference: t.conference,
      logo_url: t.logos?.[0] ? t.logos[0].replace(/^http:\/\//, 'https://') : null,
    }));

    const knownTeamIds = new Set(teamRows.map((t) => t.id));

    const games = [...lastWeek, ...thisWeek];

    // CFBD's /teams endpoint only covers that season's FBS roster. Games
    // against FCS/lower-division opponents (common in early-season "money
    // games") reference a team id that never shows up there. Without some
    // row for that id, the pick'em UI has no name to render and has to hide
    // the whole matchup - so backfill a minimal team row straight from the
    // game payload, which always carries the opponent's name even when
    // CFBD's team list doesn't.
    for (const g of games) {
      if (!knownTeamIds.has(g.home_id)) {
        teamRows.push({ id: g.home_id, school: g.home_team, mascot: null, conference: null, logo_url: null });
        knownTeamIds.add(g.home_id);
      }
      if (!knownTeamIds.has(g.away_id)) {
        teamRows.push({ id: g.away_id, school: g.away_team, mascot: null, conference: null, logo_url: null });
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
        confByTeamId.get(g.home_id) === 'SEC' && confByTeamId.get(g.away_id) === 'SEC';

      return {
        id: g.id,
        season: g.season,
        week: g.week,
        season_type: g.season_type,
        start_date: g.start_date,
        home_team_id: g.home_id,
        away_team_id: g.away_id,
        home_points: g.home_points,
        away_points: g.away_points,
        completed: g.completed,
        winner_team_id: g.completed
          ? (g.home_points ?? 0) > (g.away_points ?? 0)
            ? g.home_id
            : g.away_id
          : null,
        featured: isRanked || isSecMatchup,
        home_rank: homeRank,
        away_rank: awayRank,
      };
    });

    if (gameRows.length > 0) {
      const { error } = await supabase.from('games').upsert(gameRows);
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      season,
      week,
      teamsSynced: teamRows.length,
      gamesSynced: gameRows.length,
      rankedSchoolsFound: top25.size,
    });
  } catch (err) {
    console.error('sync failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 }
    );
  }
}
