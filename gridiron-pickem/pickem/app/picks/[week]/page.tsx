import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import GameCard from '@/components/GameCard';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { formatWeekDateRange } from '@/lib/dateFormat';
import type { Game, Team } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function WeekPage({ params }: { params: { week: string } }) {
  const week = Number(params.week) || 1;
  const { season } = currentSeasonAndWeek();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: games }, { data: teams }, { data: myPicks }] = await Promise.all([
    supabase
      .from('games')
      .select('*')
      .eq('season', season)
      .eq('week', week)
      .eq('featured', true)
      .order('start_date', { ascending: true }),
    supabase.from('teams').select('*'),
    user
      ? supabase.from('picks').select('game_id, picked_team_id').eq('user_id', user.id)
      : Promise.resolve({ data: [] as { game_id: number; picked_team_id: number }[] }),
  ]);

  const teamById = new Map<number, Team>((teams ?? []).map((t) => [t.id, t]));
  const pickByGame = new Map((myPicks ?? []).map((p) => [p.game_id, p.picked_team_id]));
  const dateRange = formatWeekDateRange((games ?? []).map((g) => g.start_date));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-chalk">Week {week}</h1>
          {dateRange && (
            <p className="mt-1 font-score text-xs text-muted">{dateRange}</p>
          )}
        </div>
        <div className="flex gap-2 font-score text-sm">
          <Link
            href={`/picks/${Math.max(1, week - 1)}`}
            className="rounded border border-field-line px-3 py-1 text-muted hover:text-chalk"
          >
            &larr; Prev
          </Link>
          <Link
            href={`/picks/${week + 1}`}
            className="rounded border border-field-line px-3 py-1 text-muted hover:text-chalk"
          >
            Next &rarr;
          </Link>
        </div>
      </div>

      {!games || games.length === 0 ? (
        <EmptyState week={week} />
      ) : (
        <div className="space-y-4">
          {(games as Game[]).map((game) => {
            const home = teamById.get(game.home_team_id ?? -1);
            const away = teamById.get(game.away_team_id ?? -1);
            if (!home || !away) return null;
            return (
              <GameCard
                key={game.id}
                game={game}
                home={{ team: home, points: game.home_points, rank: game.home_rank }}
                away={{ team: away, points: game.away_points, rank: game.away_rank }}
                myPick={pickByGame.get(game.id) ?? null}
                locked={new Date(game.start_date) <= new Date()}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ week }: { week: number }) {
  return (
    <div className="rounded-lg border border-dashed border-field-line px-6 py-12 text-center">
      <p className="font-display text-xl text-chalk">No games loaded for Week {week} yet</p>
      <p className="mt-2 text-sm text-muted">
        Scores sync automatically during the season. If a week just started, give it a few
        minutes, or trigger a manual sync (see the README).
      </p>
    </div>
  );
}
