const CFBD_BASE = 'https://api.collegefootballdata.com';

export type CfbdGame = {
  id: number;
  season: number;
  week: number;
  season_type: string;
  start_date: string;
  completed: boolean;
  neutral_site: boolean;
  /** True once a completed game's line scores show more than 4 quarters played. */
  overtime: boolean;
  notes: string | null;
  home_id: number;
  home_team: string;
  home_points: number | null;
  home_classification: string | null;
  away_id: number;
  away_team: string;
  away_points: number | null;
  away_classification: string | null;
};

export type CfbdTeam = {
  id: number;
  school: string;
  mascot: string | null;
  conference: string | null;
  classification: string | null;
  logos: string[] | null;
};

/** A single game's live in-progress state, keyed by game id in fetchLiveScoreboard's result. */
export type CfbdLiveStatus = {
  status: string | null;
  period: number | null;
  clock: string | null;
  /**
   * True once ESPN reports the game as final (status.type.completed).
   * Lets a caller grade a game the moment ESPN sees it end, without
   * waiting on CFBD's own (much less frequent) sync — see
   * app/api/sync/live/route.ts. CFBD's own sync remains the backstop:
   * once it also agrees the game is over, its numbers become (and stay)
   * authoritative, per the group's bylaws.
   */
  completed: boolean;
  /**
   * Live/final score from ESPN's scoreboard. Used both as a display-only
   * number while a game is in progress, and — only once `completed` above
   * is true — as the actual graded score until CFBD's own sync confirms
   * or corrects it.
   */
  homePoints: number | null;
  awayPoints: number | null;
};

function authHeaders() {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error('CFBD_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };
}

export async function fetchGames(opts: {
  year: number;
  week?: number;
  seasonType?: 'regular' | 'postseason';
}): Promise<CfbdGame[]> {
  const params = new URLSearchParams({
    year: String(opts.year),
    division: 'fbs',
    seasonType: opts.seasonType ?? 'regular',
  });
  if (opts.week) params.set('week', String(opts.week));

  const res = await fetch(`${CFBD_BASE}/games?${params.toString()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`CFBD /games failed: ${res.status} ${await res.text()}`);
  }

  const raw = await res.json();

  return raw.map((g: Record<string, unknown>): CfbdGame => {
    // CFBD doesn't expose a plain "went to overtime" flag. What it does give
    // is each team's per-quarter line score, which for an OT game simply has
    // more than 4 entries (one extra entry per overtime period). That's the
    // only reliable signal available, so derive it from there.
    const homeLineScores = (g.homeLineScores ?? g.home_line_scores) as number[] | null | undefined;
    const awayLineScores = (g.awayLineScores ?? g.away_line_scores) as number[] | null | undefined;
    const periodsPlayed = Math.max(homeLineScores?.length ?? 0, awayLineScores?.length ?? 0);

    return {
      id: g.id as number,
      season: g.season as number,
      week: g.week as number,
      season_type: (g.seasonType ?? g.season_type) as string,
      start_date: (g.startDate ?? g.start_date) as string,
      completed: Boolean(g.completed),
      neutral_site: Boolean(g.neutralSite ?? g.neutral_site),
      overtime: Boolean(g.completed) && periodsPlayed > 4,
      notes: (g.notes ?? null) as string | null,
      home_id: (g.homeId ?? g.home_id) as number,
      home_team: (g.homeTeam ?? g.home_team) as string,
      home_points: (g.homePoints ?? g.home_points) as number | null,
      home_classification: (g.homeClassification ?? g.home_classification ?? null) as string | null,
      away_id: (g.awayId ?? g.away_id) as number,
      away_team: (g.awayTeam ?? g.away_team) as string,
      away_points: (g.awayPoints ?? g.away_points) as number | null,
      away_classification: (g.awayClassification ?? g.away_classification ?? null) as string | null,
    };
  });
}

export async function fetchTeams(year: number): Promise<CfbdTeam[]> {
  // Pass `year` so we get the team roster as it existed for that season —
  // team IDs/classifications can shift year to year (realignment, renamed
  // or relocated programs), and the schedule for `year` may reference a
  // team that isn't in CFBD's undated default list.
  const res = await fetch(`${CFBD_BASE}/teams?year=${year}&division=fbs`, {
    headers: authHeaders(),
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!res.ok) {
    throw new Error(`CFBD /teams failed: ${res.status} ${await res.text()}`);
  }

  const raw = await res.json();
  return raw.map((t: Record<string, unknown>): CfbdTeam => ({
    id: t.id as number,
    school: t.school as string,
    mascot: (t.mascot ?? null) as string | null,
    conference: (t.conference ?? null) as string | null,
    classification: (t.classification ?? null) as string | null,
    logos: (t.logos ?? null) as string[] | null,
  }));
}

/** Maps school name -> AP Top 25 rank for the given week. */
export async function fetchTop25(opts: {
  year: number;
  week: number;
  seasonType?: 'regular' | 'postseason';
}): Promise<Map<string, number>> {
  const params = new URLSearchParams({
    year: String(opts.year),
    seasonType: opts.seasonType ?? 'regular',
    week: String(opts.week),
  });

  const res = await fetch(`${CFBD_BASE}/rankings?${params.toString()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error(`CFBD /rankings failed: ${res.status} ${await res.text()}`);
    return new Map();
  }

  const raw = await res.json();
  const ranks = new Map<string, number>();
  for (const weekEntry of raw as Array<{
    polls?: Array<{ poll: string; ranks: Array<{ school: string; rank: number }> }>;
  }>) {
    for (const poll of weekEntry.polls ?? []) {
      if (poll.poll === 'AP Top 25') {
        for (const r of poll.ranks) ranks.set(r.school, r.rank);
      }
    }
  }
  return ranks;
}

/**
 * Maps school name -> a full-field numeric rank (1 = best), derived from
 * CFBD's SP+ ratings.
 *
 * The AP Top 25 (see `fetchTop25`) only ranks 25 teams, which isn't enough
 * to test the bylaws' upset rule ("ranked at least 20 spots higher") when
 * neither team is in the Top 25 — e.g. two unranked SEC teams. SP+ rates
 * essentially every FBS team, so sorting by rating and assigning a rank by
 * position gives a real number for the whole field, not just the ranked
 * ones.
 */
export async function fetchSpRanks(year: number): Promise<Map<string, number>> {
  const res = await fetch(`${CFBD_BASE}/ratings/sp?year=${year}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error(`CFBD /ratings/sp failed: ${res.status} ${await res.text()}`);
    return new Map();
  }

  const raw = (await res.json()) as Array<{ team: string; rating: number }>;

  const sorted = [...raw]
    .filter((t) => typeof t.rating === 'number')
    .sort((a, b) => b.rating - a.rating);

  const ranks = new Map<string, number>();
  sorted.forEach((t, i) => ranks.set(t.team, i + 1));
  return ranks;
}

const ESPN_SCOREBOARD_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';

/**
 * Today's date in US Eastern time, formatted YYYYMMDD — the format ESPN's
 * scoreboard endpoint expects for its `dates` query param.
 *
 * Eastern time, not UTC: US college football scheduling (and ESPN's own
 * date grouping) is anchored to the Eastern calendar day, and a UTC "today"
 * would occasionally clip a late West Coast kickoff (which lands after
 * midnight UTC) into the wrong bucket.
 */
function todayEspnDateParam(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

/**
 * Loosely normalizes a school name for matching CFBD's team names against
 * ESPN's: strips diacritics (CFBD/ESPN don't always agree on "San José
 * State" vs "San Jose State"), lowercases, and drops everything but
 * letters/digits (so "Texas A&M", "Texas A&amp;M", "Texas AM" all collapse
 * to the same key). Not bulletproof, but good enough for a best-effort
 * live badge — a missed match just means that one game keeps showing the
 * pre-kickoff countdown instead of a quarter/clock.
 */
function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Maps game id -> live/final state (status/period/clock/score/completed).
 *
 * CFBD's own live scoreboard endpoint (`/scoreboard`) requires a Patreon
 * Tier 1+ subscription and returns 401 on a free-tier key — confirmed
 * against the real API. This uses ESPN's public, unauthenticated
 * scoreboard endpoint instead, which is undocumented but has no key
 * requirement and returns the same kind of live period/clock/status data,
 * plus the current score and whether the game has ended.
 *
 * Grading model: app/api/sync/live uses `completed` here to grade a game
 * (set completed/winner_team_id) the moment ESPN reports it final, since
 * that route runs every couple of minutes for free. app/api/sync (CFBD)
 * runs far less often but never lets that grading get reverted — it only
 * takes over once CFBD's own data agrees the game is over, at which point
 * CFBD's numbers become the authoritative, final record per the group's
 * bylaws. See both routes' comments for the exact handoff logic.
 *
 * Calling this with no `dates` param leaves ESPN to pick whatever it
 * considers the "current week," and that default window has been observed
 * to silently omit some Week 0 games (e.g. the season-opening Dublin
 * game), so this game would never get picked up even while in progress or
 * ending. So this always passes `dates=` explicitly for today (see
 * `todayEspnDateParam`), plus `groups=80` (ESPN's FBS group id, matching
 * CFBD's own `division=fbs` filter) to make sure the full FBS slate for
 * that date comes back rather than a possibly-narrower default.
 *
 * ESPN uses its own game and team ids, not CFBD's, so games are matched by
 * normalized home/away school name rather than id. Games ESPN reports as
 * in progress (`state === 'in'`) or just finished (`state === 'post'`) get
 * an entry; pre-kickoff games are left for the caller's existing countdown
 * handling, since ESPN's pre-game period/clock are just placeholder zeros.
 *
 * Best-effort throughout: since this is an unofficial endpoint that could
 * change shape or disappear without notice, any failure is logged and
 * swallowed so the rest of the sync still succeeds.
 */
export async function fetchLiveScoreboard(
  games: Pick<CfbdGame, 'id' | 'home_team' | 'away_team'>[]
): Promise<Map<number, CfbdLiveStatus>> {
  const result = new Map<number, CfbdLiveStatus>();
  if (games.length === 0) return result;

  try {
    const url = `${ESPN_SCOREBOARD_BASE}?groups=80&limit=1000&dates=${todayEspnDateParam()}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      console.error(`ESPN scoreboard failed: ${res.status} ${await res.text()}`);
      return result;
    }

    const raw = await res.json();
    const events = (raw.events ?? []) as Array<Record<string, unknown>>;

    // Build a lookup of normalized "home|away" -> live status, from every
    // in-progress event ESPN is currently reporting.
    const liveByTeamPair = new Map<string, CfbdLiveStatus>();

    for (const event of events) {
      const competition = (event.competitions as Array<Record<string, unknown>> | undefined)?.[0];
      if (!competition) continue;

      const status = competition.status as Record<string, unknown> | undefined;
      const type = status?.type as Record<string, unknown> | undefined;
      const state = type?.state as string | undefined;
      if (state !== 'in' && state !== 'post') continue; // in progress or just-finished only

      const competitors = competition.competitors as
        | Array<{ homeAway: string; team?: { location?: string }; score?: string }>
        | undefined;
      const homeCompetitor = competitors?.find((c) => c.homeAway === 'home');
      const awayCompetitor = competitors?.find((c) => c.homeAway === 'away');
      const home = homeCompetitor?.team?.location;
      const away = awayCompetitor?.team?.location;
      if (!home || !away) continue;

      // ESPN gives score as a numeric string on each competitor; fall back
      // to null rather than 0 if it's missing/unparseable so this doesn't
      // silently overwrite a real display score with a false "0-0".
      const homePoints = homeCompetitor?.score !== undefined ? Number(homeCompetitor.score) : null;
      const awayPoints = awayCompetitor?.score !== undefined ? Number(awayCompetitor.score) : null;

      const key = `${normalizeTeamName(home)}|${normalizeTeamName(away)}`;
      liveByTeamPair.set(key, {
        status: (type?.name ?? null) as string | null,
        period: (status?.period ?? null) as number | null,
        clock: (status?.displayClock ?? null) as string | null,
        completed: Boolean(type?.completed),
        homePoints: Number.isFinite(homePoints) ? homePoints : null,
        awayPoints: Number.isFinite(awayPoints) ? awayPoints : null,
      });
    }

    for (const g of games) {
      const key = `${normalizeTeamName(g.home_team)}|${normalizeTeamName(g.away_team)}`;
      const live = liveByTeamPair.get(key);
      if (live) result.set(g.id, live);
    }
  } catch (err) {
    console.error('ESPN scoreboard fetch threw (non-fatal)', err);
  }

  return result;
}

/**
 * Best-effort lookup of the actual College Football Playoff field (the 12
 * teams that made it) for a season, derived from postseason game notes.
 *
 * CFBD labels playoff-round postseason games' `notes` field with the round
 * name (e.g. "First Round", "Quarterfinal"). The 8 non-bye teams all appear
 * in a "First Round" game; the 4 bye teams only first appear in a
 * "Quarterfinal" game. Unioning participants across both rounds recovers
 * all 12. This is inherently a bit fragile (it depends on CFBD's note
 * wording, and only works once the bracket has been announced), so treat
 * the `playoff_field` table as having a manual-override escape hatch if
 * this ever comes back short.
 */
export async function fetchActualPlayoffField(year: number): Promise<number[]> {
  const games = await fetchGames({ year, seasonType: 'postseason' });

  const roundNamePattern = /first round|quarterfinal/i;
  const teamIds = new Set<number>();

  for (const g of games) {
    if (!g.notes || !roundNamePattern.test(g.notes)) continue;
    teamIds.add(g.home_id);
    teamIds.add(g.away_id);
  }

  return Array.from(teamIds);
}

/**
 * Which season "now" falls in. Just a calendar-year read — CFBD seasons
 * are named for the year they're played in, and that never needs
 * "current week"-style guesswork the way week numbers do.
 *
 * This used to also return a `week`, first computed from a fixed Aug 24
 * start-date and rigid 7-day buckets, then later from CFBD's own
 * per-game week numbering. Both are gone now: CFBD's week boundaries
 * don't match what the group (or ESPN) actually mean by "Week 1" — see
 * `fetchEspnWeeks` below, which is now the one place "week" is defined
 * for this whole app. Both the display pages (via `getDisplayWeek` in
 * lib/currentWeek.ts) and the sync routes read from it.
 */
export function currentSeasonAndWeek(now = new Date()): { season: number } {
  return { season: now.getUTCFullYear() };
}

export type EspnWeek = {
  number: number;
  startDate: string;
  endDate: string;
};

/**
 * ESPN's own regular-season week boundaries for a year — the same
 * calendar that drives espn.com's schedule and scoreboard week groupings,
 * fetched from ESPN's (undocumented but free, no-key) seasons endpoint.
 *
 * This app used to trust CFBD's own per-game `week` field for grouping
 * games into weeks. That turned out to be wrong: CFBD's internal week
 * numbering doesn't match ESPN's (or the group's) — for the 2026 season,
 * CFBD calls only Sept 3-6 "Week 1", while ESPN (and everyone actually
 * watching the sport) calls Aug 22 - Sep 7 "Week 1", folding in every
 * season-opening game rather than giving them a separate "Week 0". Since
 * "Week 1" needs to mean what the group actually means by it, ESPN's
 * calendar — not CFBD's week field — is now the definition this app uses;
 * see determineOurWeek below for how each game gets bucketed by it.
 */
export async function fetchEspnWeeks(year: number): Promise<EspnWeek[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/common/v3/sports/football/college-football/seasons?startingseason=${year}`,
    { next: { revalidate: 60 * 60 * 12 } }
  );

  if (!res.ok) {
    throw new Error(`ESPN seasons failed: ${res.status} ${await res.text()}`);
  }

  const raw = await res.json();
  const seasons = (raw.seasons ?? []) as Array<Record<string, unknown>>;
  const season = seasons.find((s) => s.year === year);
  if (!season) return [];

  const types = (season.types ?? []) as Array<Record<string, unknown>>;
  // ESPN's schema: type 1 = Preseason, 2 = Regular Season, 3 = Postseason,
  // 4 = Off Season. Only the regular season's weeks apply here — postseason
  // games are handled separately (see fetchActualPlayoffField).
  const regular = types.find((t) => t.type === 2);
  if (!regular) return [];

  const weeks = (regular.weeks ?? []) as Array<Record<string, unknown>>;
  return weeks.map((w) => ({
    number: w.number as number,
    startDate: w.startDate as string,
    endDate: w.endDate as string,
  }));
}

/**
 * Which of `weeks` a given date falls in, by ESPN's own boundaries.
 * Falls back to the first week if `date` is before the season, and the
 * last known week if after (this app doesn't track postseason weeks).
 */
export function getWeekForDate(weeks: EspnWeek[], date: Date): number {
  if (weeks.length === 0) return 1;
  const sorted = [...weeks].sort((a, b) => a.number - b.number);

  for (const w of sorted) {
    if (date >= new Date(w.startDate) && date <= new Date(w.endDate)) {
      return w.number;
    }
  }
  if (date < new Date(sorted[0].startDate)) return sorted[0].number;
  return sorted[sorted.length - 1].number;
}
