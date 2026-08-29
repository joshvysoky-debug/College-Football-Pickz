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
  /** Live score from ESPN's scoreboard, more current than CFBD's during an in-progress game. */
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

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?limit=1000';

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
 * Maps game id -> live in-progress state (status/period/clock/score).
 *
 * CFBD's own live scoreboard endpoint (`/scoreboard`) requires a Patreon
 * Tier 1+ subscription and returns 401 on a free-tier key — confirmed
 * against the real API. This uses ESPN's public, unauthenticated
 * scoreboard endpoint instead, which is undocumented but has no key
 * requirement and returns the same kind of live period/clock/status data.
 * It also happens to carry the current score, which is more trustworthy
 * than CFBD's `home_points`/`away_points` while a game is still in
 * progress — the sync route prefers this score over CFBD's for any game
 * this map has an entry for.
 *
 * ESPN uses its own game and team ids, not CFBD's, so games are matched by
 * normalized home/away school name rather than id. Only games ESPN reports
 * as actually in progress (`state === 'in'`) get an entry — pre-kickoff and
 * final games are left for the caller's existing countdown/Final handling,
 * since ESPN's pre-game period/clock are just placeholder zeros.
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
    const res = await fetch(ESPN_SCOREBOARD_URL, { cache: 'no-store' });

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
      if (type?.state !== 'in') continue; // only care about live games

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
      // silently overwrite a real CFBD score with a false "0-0".
      const homePoints = homeCompetitor?.score !== undefined ? Number(homeCompetitor.score) : null;
      const awayPoints = awayCompetitor?.score !== undefined ? Number(awayCompetitor.score) : null;

      const key = `${normalizeTeamName(home)}|${normalizeTeamName(away)}`;
      liveByTeamPair.set(key, {
        status: (type?.name ?? null) as string | null,
        period: (status?.period ?? null) as number | null,
        clock: (status?.displayClock ?? null) as string | null,
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

/** Which CFB week "now" falls in, using the regular season's Tuesday-to-Tuesday
 *  week boundaries. Falls back to week 1 before the season starts. */
export function currentSeasonAndWeek(now = new Date()): { season: number; week: number } {
  const year = now.getUTCFullYear();
  const seasonStart = new Date(Date.UTC(year, 7, 24));
  if (now < seasonStart) {
    return { season: year, week: 1 };
  }
  const diffMs = now.getTime() - seasonStart.getTime();
  const week = Math.min(15, Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1));
  return { season: year, week };
}
