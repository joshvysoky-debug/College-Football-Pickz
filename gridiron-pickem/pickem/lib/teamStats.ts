import type { Game, Team } from '@/lib/database.types';

export type LastWeekResult =
  | { kind: 'bye' }
  | { kind: 'result'; opponent: string; teamScore: number; oppScore: number; won: boolean }
  | null;

export type TeamStats = {
  record: string; // e.g. "5-2"
  lastWeek: LastWeekResult;
};

/**
 * Builds a per-team map of season record ("W-L") and last week's result,
 * for the set of teams playing in the currently-displayed week.
 *
 * - `recordGames` should be every *completed* game this season for these
 *   teams, from weeks before `week`.
 * - `lastWeekGames` should be every game from `week - 1` for these teams
 *   (win, loss, or otherwise) so a missing entry can be recognized as a bye.
 */
export function buildTeamStats({
  teamIds,
  week,
  recordGames,
  lastWeekGames,
  teamById,
}: {
  teamIds: number[];
  week: number;
  recordGames: Game[];
  lastWeekGames: Game[];
  teamById: Map<number, Team>;
}): Map<number, TeamStats> {
  const stats = new Map<number, TeamStats>();

  for (const teamId of teamIds) {
    let wins = 0;
    let losses = 0;
    for (const g of recordGames) {
      const isHome = g.home_team_id === teamId;
      const isAway = g.away_team_id === teamId;
      if (!isHome && !isAway) continue;
      if (g.winner_team_id === teamId) wins += 1;
      else losses += 1;
    }

    let lastWeek: LastWeekResult = null;

    if (week > 1) {
      const game = lastWeekGames.find(
        (g) => g.home_team_id === teamId || g.away_team_id === teamId
      );

      if (!game) {
        lastWeek = { kind: 'bye' };
      } else if (game.completed) {
        const isHome = game.home_team_id === teamId;
        const teamScore = isHome ? game.home_points : game.away_points;
        const oppScore = isHome ? game.away_points : game.home_points;
        const oppId = isHome ? game.away_team_id : game.home_team_id;
        const opponent = (oppId !== null ? teamById.get(oppId)?.school : null) ?? 'Unknown';

        if (teamScore !== null && oppScore !== null) {
          lastWeek = {
            kind: 'result',
            opponent,
            teamScore,
            oppScore,
            won: game.winner_team_id === teamId,
          };
        }
      }
    }

    stats.set(teamId, { record: `${wins}-${losses}`, lastWeek });
  }

  return stats;
}
