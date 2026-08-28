import type { Game } from '@/lib/database.types';
import { scorePick } from '@/lib/scoring';

export type PickRow = { game_id: number; picked_team_id: number; user_id: string };

export type PlayerSeries = {
  userId: string;
  name: string;
  points: number[]; // cumulative Article III points, aligned index-for-index with `weeks`
};

/**
 * Builds each player's cumulative Article III weekly-scoring point total by
 * week, for the season points chart on the Standings page.
 *
 * This intentionally charts weekly game-pick points only, not the Article V
 * playoff-prediction bonus — that bonus resolves all at once at the end of
 * the season rather than week by week, so it's shown as part of the season
 * total in the standings table instead of as a step in this chart.
 *
 * - `games` should be every *completed* game this season (any week).
 * - `picks` should cover all picks made on those games.
 * - `nameById` is the full set of players to plot, even ones with zero
 *   points so far (they still get a flat line at 0).
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
  const gameById = new Map(games.map((g) => [g.id, g]));

  const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);

  // userId -> week -> points earned that week
  const weeklyPoints = new Map<string, Map<number, number>>();

  for (const p of picks) {
    const game = gameById.get(p.game_id);
    if (!game) continue;

    const result = scorePick({ game, pickedTeamId: p.picked_team_id });
    if (!result || result.points === 0) continue;

    const userWeeks = weeklyPoints.get(p.user_id) ?? new Map<number, number>();
    userWeeks.set(game.week, (userWeeks.get(game.week) ?? 0) + result.points);
    weeklyPoints.set(p.user_id, userWeeks);
  }

  const series: PlayerSeries[] = Array.from(nameById.entries()).map(([userId, name]) => {
    const userWeeks = weeklyPoints.get(userId) ?? new Map<number, number>();
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
