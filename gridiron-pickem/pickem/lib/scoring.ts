import type { Game } from '@/lib/database.types';

/**
 * Implements the weekly per-game scoring table from Article III of the CFB
 * Game Time Bylaws, plus the Article V playoff-prediction bonus.
 *
 * | Result                  | Points |
 * |-------------------------|--------|
 * | Win                     | 2      |
 * | Overtime Loss           | 1      |
 * | Home Upset Win          | 4      |
 * | Away Upset Win          | 6      |
 * | Neutral-Site Upset Win  | 4      |
 * | Incorrect Pick          | 0      |
 * | No Pick                 | 0      |
 *
 * An "upset" is when the selected (winning) team was ranked at least 20
 * spots lower than the team it beat — regardless of whether either team
 * was actually in the AP Top 25. Rank here means the full-field SP+ rank
 * (see `fetchSpRanks` in lib/cfbd.ts), not the AP Top 25 rank, since the
 * AP poll only covers 25 teams and the bylaws' upset rule needs to apply
 * even when both teams are unranked there.
 */

export type PickOutcome =
  | 'no_pick'
  | 'incorrect'
  | 'ot_loss'
  | 'win'
  | 'home_upset_win'
  | 'away_upset_win'
  | 'neutral_upset_win';

export const OUTCOME_POINTS: Record<PickOutcome, number> = {
  no_pick: 0,
  incorrect: 0,
  ot_loss: 1,
  win: 2,
  home_upset_win: 4,
  neutral_upset_win: 4,
  away_upset_win: 6,
};

export const PLAYOFF_TEAM_POINTS = 10;

/** True when the winning team was ranked at least 20 spots lower than the team it beat. */
export function isUpset(winnerRank: number | null, loserRank: number | null): boolean {
  if (winnerRank === null || loserRank === null) return false;
  return winnerRank - loserRank >= 20;
}

/**
 * True when a game's two teams are far enough apart in SP+ rank (20+ spots)
 * that a win by the worse-ranked side would qualify as an Article III upset.
 * Unlike `isUpset`, this doesn't need to know who won — it's meant for
 * flagging a game as upset-worthy before or during play, not for scoring a
 * completed pick.
 */
export function isPotentialUpset(homeRank: number | null, awayRank: number | null): boolean {
  if (homeRank === null || awayRank === null) return false;
  return Math.abs(homeRank - awayRank) >= 20;
}

/**
 * How many points a correct pick on the home team vs. the away team would
 * be worth, based only on the two teams' SP+ ranks and whether the game is
 * neutral-site — no result needed. Used to show "what a correct guess is
 * worth" on the picks page before/during a game, as opposed to `scorePick`
 * which grades a specific pick against a finished game.
 *
 * When the teams aren't 20+ ranks apart, a correct pick is just a plain
 * Win (2) either way. When they are, the worse-ranked side is the
 * "underdog" — picking them correctly is the upset bonus (4 home / 6 away /
 * 4 neutral), while picking the favorite correctly stays a plain Win (2).
 */
export function potentialPickPoints({
  homeRank,
  awayRank,
  neutralSite,
}: {
  homeRank: number | null;
  awayRank: number | null;
  neutralSite: boolean;
}): { homePoints: number; awayPoints: number } {
  if (!isPotentialUpset(homeRank, awayRank)) {
    return { homePoints: OUTCOME_POINTS.win, awayPoints: OUTCOME_POINTS.win };
  }

  // isPotentialUpset already confirmed both ranks are non-null.
  const homeIsUnderdog = (homeRank as number) > (awayRank as number);

  if (neutralSite) {
    return homeIsUnderdog
      ? { homePoints: OUTCOME_POINTS.neutral_upset_win, awayPoints: OUTCOME_POINTS.win }
      : { homePoints: OUTCOME_POINTS.win, awayPoints: OUTCOME_POINTS.neutral_upset_win };
  }

  return homeIsUnderdog
    ? { homePoints: OUTCOME_POINTS.home_upset_win, awayPoints: OUTCOME_POINTS.win }
    : { homePoints: OUTCOME_POINTS.win, awayPoints: OUTCOME_POINTS.away_upset_win };
}

/**
 * Scores a single pick against its (completed) game.
 * Returns `null` if the game hasn't finished yet — there's nothing to score.
 */
export function scorePick({
  game,
  pickedTeamId,
}: {
  game: Game;
  pickedTeamId: number | null;
}): { outcome: PickOutcome; points: number } | null {
  if (pickedTeamId === null || pickedTeamId === undefined) {
    return { outcome: 'no_pick', points: OUTCOME_POINTS.no_pick };
  }

  if (!game.completed || game.winner_team_id === null) {
    return null;
  }

  const correct = pickedTeamId === game.winner_team_id;

  if (!correct) {
    const outcome: PickOutcome = game.overtime ? 'ot_loss' : 'incorrect';
    return { outcome, points: OUTCOME_POINTS[outcome] };
  }

  const pickedIsHome = pickedTeamId === game.home_team_id;
  const winnerRank = pickedIsHome ? game.home_sp_rank : game.away_sp_rank;
  const loserRank = pickedIsHome ? game.away_sp_rank : game.home_sp_rank;

  if (isUpset(winnerRank, loserRank)) {
    const outcome: PickOutcome = game.neutral_site
      ? 'neutral_upset_win'
      : pickedIsHome
        ? 'home_upset_win'
        : 'away_upset_win';
    return { outcome, points: OUTCOME_POINTS[outcome] };
  }

  return { outcome: 'win', points: OUTCOME_POINTS.win };
}
