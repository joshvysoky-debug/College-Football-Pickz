import type { Game } from '@/lib/database.types';
import { scorePick } from '@/lib/scoring';

export type PickRow = { game_id: number; picked_team_id: number; user_id: string };

export type PlayerSeries = {
  userId: string;
  name: string;
  points: number[]; // cumulative Article III points, aligned index-for-index with `weeks`
  ranks: number[]; // place in the standings at the end of each week (1 = first), aligned with `weeks`
};

/**
 * Builds each player's cumulative Article III weekly-scoring point total and
 * standings place by week, for the season chart on the Standings page.
 *
 * This intentionally uses weekly game-pick points only, not the Article V
 * playoff-prediction bonus — that bonus resolves all at once at the end of
 * the season rather than week by week, so it's shown as part of the season
 * total in the standings table instead of as a step in this chart.
 *
 * Places use standard competition ranking: players tied on points share a
 * place and the next place is skipped (e.g. 1, 2, 2, 4).
 *
 * - `games` should be every *completed* game this season (any week).
 * - `picks` should cover all picks made on those games.
 * - `nameById` is the full set of players to plot, even ones with zero
 *   points so far (they still get a place each week).
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
    return { userId, name, points, ranks: [] };
  });

  // Place at the end of each week, from that week's cumulative totals.
  weeks.forEach((_, i) => {
    for (const s of series) {
      const mine = s.points[i];
      s.ranks[i] = 1 + series.filter((o) => o.points[i] > mine).length;
    }
  });

  // Current place first (ties broken by name), so the legend order tracks the standings.
  series.sort(
    (a, b) => (a.ranks.at(-1) ?? 0) - (b.ranks.at(-1) ?? 0) || a.name.localeCompare(b.name)
  );

  return { weeks, series };
}
