import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import RecapBoard from '@/components/RecapBoard';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { formatWeekDateRange } from '@/lib/dateFormat';
import { buildWeekGames, buildWeeklyRecap } from '@/lib/weeklyRecap';
import type { Game, Team } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function RecapWeekPage({ params }: { params: { week: string } }) {
  const week = Number(params.week) || 1;
  const { season } = currentSeasonAndWeek();
  const supabase = createClient();

  const [{ data: games, error: gamesError }, { data: profiles }] = await Promise.all([
    supabase
      .from('games')
      .select('*')
      .eq('season', season)
      .eq('week', week)
      .eq('featured', true)
      .order('start_date', { ascending: true }),
    supabase.from('profiles').select('id, display_name'),
  ]);

  if (gamesError) {
    console.error('RecapWeekPage: failed to load games', gamesError);
  }

  const gameIds = (games ?? []).map((g) => g.id);
  const dateRange = formatWeekDateRange((games ?? []).map((g) => g.start_date));

  // RLS naturally keeps everyone's picks secret before a game locks, same
  // as the Picks page — recap rows will just be empty for weeks in progress.
  const { data: picks } =
    gameIds.length > 0
      ? await supabase.from('picks').select('game_id, picked_team_id, user_id').in('game_id', gameIds)
      : { data: [] as { game_id: number; picked_team_id: number; user_id: string }[] };

  const neededTeamIds = Array.from(
    new Set(
      (games ?? [])
        .flatMap((g) => [g.home_team_id, g.away_team_id])
        .filter((id): id is number => id !== null)
    )
  );

  const { data: teams, error: teamsError } =
    neededTeamIds.length > 0
      ? await supabase.from('teams').select('*').in('id', neededTeamIds)
      : { data: [] as Team[], error: null };

  if (teamsError) {
    console.error('RecapWeekPage: failed to load teams', teamsError);
  }

  const teamById = new Map<number, Team>((teams ?? []).map((t) => [t.id, t]));

  const recaps = buildWeeklyRecap({
    games: (games ?? []) as Game[],
    picks: picks ?? [],
    profiles: profiles ?? [],
    teamById,
  });

  const weekGames = buildWeekGames({ games: (games ?? []) as Game[], teamById });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-chalk">Week {week} Recap</h1>
          {dateRange && <p className="mt-1 font-score text-xs text-muted">{dateRange}</p>}
        </div>
        <div className="flex gap-2 font-score text-sm">
          <Link
            href={`/recap/${Math.max(1, week - 1)}`}
            className="rounded border border-field-line px-3 py-1 text-muted hover:text-chalk"
          >
            &larr; Prev
          </Link>
          <Link
            href={`/recap/${week + 1}`}
            className="rounded border border-field-line px-3 py-1 text-muted hover:text-chalk"
          >
            Next &rarr;
          </Link>
        </div>
      </div>

      {!games || games.length === 0 ? (
        <div className="rounded-lg border border-dashed border-field-line px-6 py-12 text-center">
          <p className="font-display text-xl text-chalk">No featured games for Week {week} yet</p>
          <p className="mt-2 text-sm text-muted">
            Check back once the week&apos;s slate is loaded and games kick off.
          </p>
        </div>
      ) : (
        <RecapBoard recaps={recaps} games={weekGames} />
      )}
    </div>
  );
}
