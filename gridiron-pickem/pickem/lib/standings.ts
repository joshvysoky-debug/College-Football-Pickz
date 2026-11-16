import type { Game } from '@/lib/database.types';
import { scorePick, PLAYOFF_TEAM_POINTS } from '@/lib/scoring';

export type PickRow = { game_id: number; picked_team_id: number; user_id: string };
export type PlayoffPickRow = { user_id: string; team_id: number };
export type ProfileRow = { id: string; display_name: string | null };

export type UserSeasonTotals = {
  userId: string;
  name: string;
  /** Sum of Article III weekly game-pick points. */
  weeklyPoints: number;
  /** Sum of Article V playoff-prediction points (10 per correctly picked team). */
  playoffPoints: number;
  /** Article VI: weeklyPoints + playoffPoints — this is what decides the champion. */
  totalPoints: number;
  correctPicks: number;
  totalCompletedPicks: number;
};

/**
 * Computes each player's full season point total per the CFB Game Time
 * Bylaws (Article III weekly scoring + Article V playoff scoring, combined
 * per Article VI). Replaces the old count-based `standings` SQL view, since
 * the scoring rules depend on rank differentials and overtime that aren't
 * practical to express in SQL.
 */
export function buildStandings({
  games,
  picks,
  playoffPicks,
  playoffFieldTeamIds,
  profiles,
}: {
  games: Game[];
  picks: PickRow[];
  playoffPicks: PlayoffPickRow[];
  playoffFieldTeamIds: Set<number>;
  profiles: ProfileRow[];
}): UserSeasonTotals[] {
  const gameById = new Map(games.map((g) => [g.id, g]));

  const weeklyPointsByUser = new Map<string, number>();
  const correctByUser = new Map<string, number>();
  const completedByUser = new Map<string, number>();

  // Score every completed game for every player, not just the picks each
  // player happened to make. A missed pick counts as a game played with no
  // points (same as lib/weeklyRecap.ts), so everyone's "possible picks"
  // total is the same: the number of completed featured games.
  const pickByUserAndGame = new Map<string, number>();
  for (const p of picks) {
    if (gameById.has(p.game_id)) {
      pickByUserAndGame.set(`${p.user_id}:${p.game_id}`, p.picked_team_id);
    }
  }

  for (const pr of profiles) {
    for (const game of games) {
      if (!game.completed) continue;

      const pickedTeamId = pickByUserAndGame.get(`${pr.id}:${game.id}`) ?? null;
      const result = scorePick({ game, pickedTeamId });
      if (!result) continue;

      weeklyPointsByUser.set(pr.id, (weeklyPointsByUser.get(pr.id) ?? 0) + result.points);
      completedByUser.set(pr.id, (completedByUser.get(pr.id) ?? 0) + 1);

      if (result.outcome !== 'incorrect' && result.outcome !== 'ot_loss' && result.outcome !== 'no_pick') {
        correctByUser.set(pr.id, (correctByUser.get(pr.id) ?? 0) + 1);
      }
    }
  }

  const playoffPointsByUser = new Map<string, number>();
  for (const pp of playoffPicks) {
    if (!playoffFieldTeamIds.has(pp.team_id)) continue;
    playoffPointsByUser.set(
      pp.user_id,
      (playoffPointsByUser.get(pp.user_id) ?? 0) + PLAYOFF_TEAM_POINTS
    );
  }

  const totals: UserSeasonTotals[] = profiles.map((pr) => {
    const weeklyPoints = weeklyPointsByUser.get(pr.id) ?? 0;
    const playoffPoints = playoffPointsByUser.get(pr.id) ?? 0;
    return {
      userId: pr.id,
      name: pr.display_name?.trim() || 'Anonymous',
      weeklyPoints,
      playoffPoints,
      totalPoints: weeklyPoints + playoffPoints,
      correctPicks: correctByUser.get(pr.id) ?? 0,
      totalCompletedPicks: completedByUser.get(pr.id) ?? 0,
    };
  });

  return totals.sort((a, b) => b.totalPoints - a.totalPoints);
}
