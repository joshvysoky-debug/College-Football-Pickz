import type { Game, Team } from '@/lib/database.types';
import { scorePick, type PickOutcome } from '@/lib/scoring';

export type PickRow = { game_id: number; picked_team_id: number; user_id: string };
export type ProfileRow = { id: string; display_name: string | null };

export type RecapPickRow = {
  gameId: number;
  startDate: string;
  completed: boolean;
  home: Team;
  away: Team;
  pickedTeamId: number | null;
  pickedTeam: Team | null;
  /** Adds 'pending' (game not final yet) to the outcomes scorePick can return. */
  outcome: PickOutcome | 'pending';
  points: number;
};

export type UserWeekRecap = {
  userId: string;
  name: string;
  weekPoints: number;
  picks: RecapPickRow[];
};

export type WeekGameRow = {
  gameId: number;
  startDate: string;
  completed: boolean;
  home: Team;
  away: Team;
};

/**
 * The plain list of this week's games (one row each, not one per person) —
 * used for the games table on /recap/[week]. Shares the same sort/filter
 * logic as `buildWeeklyRecap` so the two stay in sync, but doesn't require
 * any profiles to exist.
 */
export function buildWeekGames({
  games,
  teamById,
}: {
  games: Game[];
  teamById: Map<number, Team>;
}): WeekGameRow[] {
  const sorted = [...games].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  const rows: WeekGameRow[] = [];
  for (const game of sorted) {
    const home = game.home_team_id !== null ? teamById.get(game.home_team_id) : undefined;
    const away = game.away_team_id !== null ? teamById.get(game.away_team_id) : undefined;
    if (!home || !away) continue;
    rows.push({ gameId: game.id, startDate: game.start_date, completed: game.completed, home, away });
  }
  return rows;
}

/**
 * Builds a per-person, per-game breakdown of a single week — the itemized
 * sibling of `buildStandings`. Where `buildStandings` sums each player's
 * points across the whole season, this walks every game in one week and
 * shows exactly what each pick was and what it scored, per Article III.
 * Powers the /recap/[week] page.
 */
export function buildWeeklyRecap({
  games,
  picks,
  profiles,
  teamById,
}: {
  games: Game[];
  picks: PickRow[];
  profiles: ProfileRow[];
  teamById: Map<number, Team>;
}): UserWeekRecap[] {
  const sortedGames = [...games].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  const pickByUserAndGame = new Map<string, number>();
  for (const p of picks) {
    pickByUserAndGame.set(`${p.user_id}:${p.game_id}`, p.picked_team_id);
  }

  const recaps: UserWeekRecap[] = profiles.map((pr) => {
    let weekPoints = 0;
    const picksOut: RecapPickRow[] = [];

    for (const game of sortedGames) {
      const home = game.home_team_id !== null ? teamById.get(game.home_team_id) : undefined;
      const away = game.away_team_id !== null ? teamById.get(game.away_team_id) : undefined;
      if (!home || !away) continue;

      const pickedTeamId = pickByUserAndGame.get(`${pr.id}:${game.id}`) ?? null;
      const pickedTeam = pickedTeamId !== null ? teamById.get(pickedTeamId) ?? null : null;

      let outcome: PickOutcome | 'pending' = 'pending';
      let points = 0;

      if (!game.completed) {
        // Game hasn't finished — nothing to score yet. Still distinguish
        // "picked, waiting on a result" from "never made a pick."
        outcome = pickedTeamId === null ? 'no_pick' : 'pending';
      } else {
        const result = scorePick({ game, pickedTeamId });
        if (result) {
          outcome = result.outcome;
          points = result.points;
        }
      }

      weekPoints += points;
      picksOut.push({
        gameId: game.id,
        startDate: game.start_date,
        completed: game.completed,
        home,
        away,
        pickedTeamId,
        pickedTeam,
        outcome,
        points,
      });
    }

    return {
      userId: pr.id,
      name: pr.display_name?.trim() || 'Anonymous',
      weekPoints,
      picks: picksOut,
    };
  });

  return recaps.sort((a, b) => b.weekPoints - a.weekPoints);
}
