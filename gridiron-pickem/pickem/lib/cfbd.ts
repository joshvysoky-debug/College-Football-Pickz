const CFBD_BASE = 'https://api.collegefootballdata.com';

export type CfbdGame = {
  id: number;
  season: number;
  week: number;
  season_type: string;
  start_date: string;
  completed: boolean;
  home_id: number;
  home_team: string;
  home_points: number | null;
  away_id: number;
  away_team: string;
  away_points: number | null;
};

export type CfbdTeam = {
  id: number;
  school: string;
  mascot: string | null;
  conference: string | null;
  logos: string[] | null;
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
    // Always get fresh scores; this is only ever called from the sync route.
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`CFBD /games failed: ${res.status} ${await res.text()}`);
  }

  const raw = await res.json();

  // CFBD's field names have shifted between API versions; normalize both.
  return raw.map((g: Record<string, unknown>): CfbdGame => ({
    id: g.id as number,
    season: g.season as number,
    week: g.week as number,
    season_type: (g.seasonType ?? g.season_type) as string,
    start_date: (g.startDate ?? g.start_date) as string,
    completed: Boolean(g.completed),
    home_id: (g.homeId ?? g.home_id) as number,
    home_team: (g.homeTeam ?? g.home_team) as string,
    home_points: (g.homePoints ?? g.home_points) as number | null,
    away_id: (g.awayId ?? g.away_id) as number,
    away_team: (g.awayTeam ?? g.away_team) as string,
    away_points: (g.awayPoints ?? g.away_points) as number | null,
  }));
}

export async function fetchTeams(): Promise<CfbdTeam[]> {
  const res = await fetch(`${CFBD_BASE}/teams/`, {
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
    logos: (t.logos ?? null) as string[] | null,
  }));
}

/** Returns the set of school names currently in the AP Top 25. */
export async function fetchTop25(opts: {
  year: number;
  week: number;
  seasonType?: 'regular' | 'postseason';
}): Promise<Set<string>> {
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
    // Don't fail the whole sync if rankings are briefly unavailable early in the week.
    console.error(`CFBD /rankings failed: ${res.status} ${await res.text()}`);
    return new Set();
  }

  const raw = await res.json();
  const schools = new Set<string>();
  for (const weekEntry of raw as Array<{
    polls?: Array<{ poll: string; ranks: Array<{ school: string }> }>;
  }>) {
    for (const poll of weekEntry.polls ?? []) {
      if (poll.poll === 'AP Top 25') {
        for (const r of poll.ranks) schools.add(r.school);
      }
    }
  }
  return schools;
}

/** Which CFB week "now" falls in, using the regular season's Tuesday-to-Tuesday
 *  week boundaries. Falls back to week 1 before the season starts. */
export function currentSeasonAndWeek(now = new Date()): { season: number; week: number } {
  const year = now.getUTCFullYear();
  // Regular season effectively starts the last weekend of August.
  const seasonStart = new Date(Date.UTC(year, 7, 24));
  if (now < seasonStart) {
    return { season: year, week: 1 };
  }
  const diffMs = now.getTime() - seasonStart.getTime();
  const week = Math.min(15, Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1));
  return { season: year, week };
}
