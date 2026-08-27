import type { Game } from '@/lib/database.types';

export type PickRow = { game_id: number; picked_team_id: number; user_id: string };

export type PlayerSeries = {
  userId: string;
  name: string;
  points: number[]; // cumulative correct picks, aligned index-for-index with `weeks`
};

/**
 * Builds each player's cumulative correct-pick total by week, for the
 * season points chart on the Standings page.
 *
 * - `games` should be every *completed* game this season (any week).
 * - `picks` should cover all picks made on those games.
 * - `nameById` is the full set of players to plot, even ones with zero
 *   correct picks so far (they still get a flat line at 0).
 */
export function buildSeasonProgress({
  games,
  picks,
  nameById,
}: {
  games: Game[];
  picks: PickRow[];
  nameById: Map<string, string>;
}): { weeks: number[]; series: PlayerSeries[] } {
  const weekByGameId = new Map(games.map((g) => [g.id, g.week]));
  const winnerByGameId = new Map(games.map((g) => [g.id, g.winner_team_id]));

  const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);

  // userId -> week -> correct picks made that week
  const weeklyCorrect = new Map<string, Map<number, number>>();

  for (const p of picks) {
    const week = weekByGameId.get(p.game_id);
    const winner = winnerByGameId.get(p.game_id);
    if (week === undefined || winner === null || winner === undefined) continue;
    if (p.picked_team_id !== winner) continue;

    const userWeeks = weeklyCorrect.get(p.user_id) ?? new Map<number, number>();
    userWeeks.set(week, (userWeeks.get(week) ?? 0) + 1);
    weeklyCorrect.set(p.user_id, userWeeks);
  }

  const series: PlayerSeries[] = Array.from(nameById.entries()).map(([userId, name]) => {
    const userWeeks = weeklyCorrect.get(userId) ?? new Map<number, number>();
    let running = 0;
    const points = weeks.map((w) => {
      running += userWeeks.get(w) ?? 0;
      return running;
    });
    return { userId, name, points };
  });

  // Highest current total first, so the legend order roughly tracks the standings.
  series.sort((a, b) => (b.points.at(-1) ?? 0) - (a.points.at(-1) ?? 0));

  return { weeks, series };
}
