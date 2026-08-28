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
 *
 * FCS opponents are a special case: SP+ only rates FBS teams, so an FCS
 * team never has a numeric rank to compare. Rather than silently treating
 * that as "not an upset" for lack of data, any FBS-vs-FCS game is always
 * treated as upset-eligible — an FCS team beating an FBS team counts as an
 * upset regardless of what the (nonexistent) rank gap would say.
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

/** True when the two classifications are an FBS/FCS pairing (order doesn't matter). */
export function isFcsMismatch(
  classificationA: string | null | undefined,
  classificationB: string | null | undefined
): boolean {
  return (
    (classificationA === 'fcs' && classificationB === 'fbs') ||
    (classificationA === 'fbs' && classificationB === 'fcs')
  );
}

/**
 * True when the winning team qualifies as an upset over the team it beat —
 * either because it was ranked at least 20 spots lower, or because it was
 * the FCS side in an FBS-vs-FCS game (which has no rank data to compare).
 */
export function isUpset({
  winnerRank,
  loserRank,
  winnerClassification,
  loserClassification,
}: {
  winnerRank: number | null;
  loserRank: number | null;
  winnerClassification?: string | null;
  loserClassification?: string | null;
}): boolean {
  if (winnerClassification === 'fcs' && loserClassification === 'fbs') return true;
  if (winnerRank === null || loserRank === null) return false;
  return winnerRank - loserRank >= 20;
}

/**
 * True when a game's two teams are far enough apart (20+ SP+ spots, or an
 * FBS-vs-FCS pairing) that a win by the worse-ranked side would qualify as
 * an Article III upset. Unlike `isUpset`, this doesn't need to know who
 * won — it's meant for flagging a game as upset-worthy before or during
 * play, not for scoring a completed pick.
 */
export function isPotentialUpset({
  homeRank,
  awayRank,
  homeClassification,
  awayClassification,
}: {
  homeRank: number | null;
  awayRank: number | null;
  homeClassification?: string | null;
  awayClassification?: string | null;
}): boolean {
  if (isFcsMismatch(homeClassification, awayClassification)) return true;
  if (homeRank === null || awayRank === null) return false;
  return Math.abs(homeRank - awayRank) >= 20;
}

/**
 * How many points a correct pick on the home team vs. the away team would
 * be worth, based only on the two teams' SP+ ranks/classifications and
 * whether the game is neutral-site — no result needed. Used to show "what
 * a correct guess is worth" on the picks page before/during a game, as
 * opposed to `scorePick` which grades a specific pick against a finished
 * game.
 *
 * When the teams aren't 20+ ranks apart (and it's not an FBS-vs-FCS game),
 * a correct pick is just a plain Win (2) either way. Otherwise, the
 * worse-ranked (or FCS) side is the "underdog" — picking them correctly is
 * the upset bonus (4 home / 6 away / 4 neutral), while picking the
 * favorite correctly stays a plain Win (2).
 */
export function potentialPickPoints({
  homeRank,
  awayRank,
  neutralSite,
  homeClassification,
  awayClassification,
}: {
  homeRank: number | null;
  awayRank: number | null;
  neutralSite: boolean;
  homeClassification?: string | null;
  awayClassification?: string | null;
}): { homePoints: number; awayPoints: number } {
  const fcsMismatch = isFcsMismatch(homeClassification, awayClassification);

  if (!fcsMismatch && !isPotentialUpset({ homeRank, awayRank })) {
    return { homePoints: OUTCOME_POINTS.win, awayPoints: OUTCOME_POINTS.win };
  }

  // If it's an FBS-vs-FCS game, the FCS side is always the underdog —
  // otherwise fall back to whichever side is ranked worse (isPotentialUpset
  // already confirmed both ranks are non-null in that case).
  const homeIsUnderdog = fcsMismatch
    ? homeClassification === 'fcs'
    : (homeRank as number) > (awayRank as number);

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
  const winnerClassification = pickedIsHome ? game.home_classification : game.away_classification;
  const loserClassification = pickedIsHome ? game.away_classification : game.home_classification;

  if (isUpset({ winnerRank, loserRank, winnerClassification, loserClassification })) {
    const outcome: PickOutcome = game.neutral_site
      ? 'neutral_upset_win'
      : pickedIsHome
        ? 'home_upset_win'
        : 'away_upset_win';
    return { outcome, points: OUTCOME_POINTS[outcome] };
  }

  return { outcome: 'win', points: OUTCOME_POINTS.win };
}
