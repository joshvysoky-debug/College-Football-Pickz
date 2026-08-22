import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchGames, fetchTeams, currentSeasonAndWeek } from '@/lib/cfbd';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron sends this automatically when CRON_SECRET is set as an env var.
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return true;

  // Fallback for manual triggers / other schedulers.
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
    const [teams, thisWeek, lastWeek] = await Promise.all([
      fetchTeams(),
      fetchGames({ year: season, week }),
      week > 1 ? fetchGames({ year: season, week: week - 1 }) : Promise.resolve([]),
    ]);

    const teamRows = teams.map((t) => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      conference: t.conference,
      logo_url: t.logos?.[0] ?? null,
    }));

    if (teamRows.length > 0) {
      const { error } = await supabase.from('teams').upsert(teamRows);
      if (error) throw error;
    }

    const games = [...lastWeek, ...thisWeek];
    const gameRows = games.map((g) => ({
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
    }));

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
    });
  } catch (err) {
    console.error('sync failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 }
    );
  }
}
