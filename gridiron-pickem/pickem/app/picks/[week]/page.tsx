import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import GameCard from '@/components/GameCard';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { formatWeekDateRange } from '@/lib/dateFormat';
import { buildTeamStats, type TeamStats } from '@/lib/teamStats';
import { isPotentialUpset } from '@/lib/scoring';
import type { Game, Team } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function WeekPage({ params }: { params: { week: string } }) {
  const week = Number(params.week) || 1;
  const { season } = currentSeasonAndWeek();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: games, error: gamesError }, { data: myPicks }] = await Promise.all([
    supabase
      .from('games')
      .select('*')
      .eq('season', season)
      .eq('week', week)
      .eq('featured', true)
      .order('start_date', { ascending: true }),
    user
      ? supabase.from('picks').select('game_id, picked_team_id').eq('user_id', user.id)
      : Promise.resolve({ data: [] as { game_id: number; picked_team_id: number }[] }),
  ]);

  if (gamesError) {
    console.error('WeekPage: failed to load games', gamesError);
  }

  const pickByGame = new Map((myPicks ?? []).map((p) => [p.game_id, p.picked_team_id]));
  const dateRange = formatWeekDateRange((games ?? []).map((g) => g.start_date));

  // Records + last week's results for every team playing this week.
  const gameTeamIds = Array.from(
    new Set(
      (games ?? [])
        .flatMap((g) => [g.home_team_id, g.away_team_id])
        .filter((id): id is number => id !== null)
    )
  );

  const gameIds = (games ?? []).map((g) => g.id);

  const [teamStatsResult, allPicksResult] = await Promise.all([
    gameTeamIds.length > 0
      ? (async () => {
          const idsList = gameTeamIds.join(',');
          const [{ data: recordGames }, { data: lastWeekGames }] = await Promise.all([
            supabase
              .from('games')
              .select('*')
              .eq('season', season)
              .eq('completed', true)
              .lt('week', week)
              .or(`home_team_id.in.(${idsList}),away_team_id.in.(${idsList})`),
            week > 1
              ? supabase
                  .from('games')
                  .select('*')
                  .eq('season', season)
                  .eq('week', week - 1)
                  .or(`home_team_id.in.(${idsList}),away_team_id.in.(${idsList})`)
              : Promise.resolve({ data: [] as Game[] }),
          ]);
          return { recordGames: recordGames ?? [], lastWeekGames: lastWeekGames ?? [] };
        })()
      : Promise.resolve({ recordGames: [] as Game[], lastWeekGames: [] as Game[] }),
    gameIds.length > 0
      ? supabase.from('picks').select('game_id, picked_team_id, user_id').in('game_id', gameIds)
      : Promise.resolve({ data: [] as { game_id: number; picked_team_id: number; user_id: string }[] }),
  ]);

  // Teams we need names/logos/records for: everyone playing this week, plus
  // every opponent that shows up in their prior results (for the "last week"
  // blurb and season record). Fetching by this explicit id list — instead of
  // the whole teams table unfiltered — avoids Supabase's default 1000-row
  // API cap silently truncating results as the teams table grows.
  const neededTeamIds = Array.from(
    new Set(
      [
        ...gameTeamIds,
        ...(teamStatsResult.recordGames as Game[]).flatMap((g) => [g.home_team_id, g.away_team_id]),
        ...(teamStatsResult.lastWeekGames as Game[]).flatMap((g) => [g.home_team_id, g.away_team_id]),
      ].filter((id): id is number => id !== null)
    )
  );

  const { data: teams, error: teamsError } =
    neededTeamIds.length > 0
      ? await supabase.from('teams').select('*').in('id', neededTeamIds)
      : { data: [] as Team[], error: null };

  if (teamsError) {
    console.error('WeekPage: failed to load teams', teamsError);
  }

  const teamById = new Map<number, Team>((teams ?? []).map((t) => [t.id, t]));

  let teamStats = new Map<number, TeamStats>();
  if (gameTeamIds.length > 0) {
    teamStats = buildTeamStats({
      teamIds: gameTeamIds,
      week,
      recordGames: teamStatsResult.recordGames as Game[],
      lastWeekGames: teamStatsResult.lastWeekGames as Game[],
      teamById,
    });
  }

  // RLS only returns other friends' rows here once a game has kicked off,
  // so this naturally keeps everyone's picks secret before lock.
  const allPicks = allPicksResult.data ?? [];
  const pickerIds = Array.from(new Set(allPicks.map((p) => p.user_id)));

  const { data: pickerProfiles } =
    pickerIds.length > 0
      ? await supabase.from('profiles').select('id, display_name').in('id', pickerIds)
      : { data: [] as { id: string; display_name: string | null }[] };

  const nameById = new Map<string, string>(
    (pickerProfiles ?? []).map((p) => [p.id, p.display_name?.trim() || 'Anonymous'])
  );

  const pickersByGameAndTeam = new Map<string, string[]>();
  for (const p of allPicks) {
    const key = `${p.game_id}:${p.picked_team_id}`;
    const names = pickersByGameAndTeam.get(key) ?? [];
    names.push(nameById.get(p.user_id) ?? 'Anonymous');
    pickersByGameAndTeam.set(key, names);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-chalk">Week {week}</h1>
          {dateRange && (
            <p className="mt-1 font-score text-xs text-muted">{dateRange}</p>
          )}
        </div>
        <div className="flex gap-2 font-score text-sm">
          <Link
            href={`/picks/${Math.max(1, week - 1)}`}
            className="rounded border border-field-line px-3 py-1 text-muted hover:text-chalk"
          >
            &larr; Prev
          </Link>
          <Link
            href={`/picks/${week + 1}`}
            className="rounded border border-field-line px-3 py-1 text-muted hover:text-chalk"
          >
            Next &rarr;
          </Link>
        </div>
      </div>

      {!games || games.length === 0 ? (
        <EmptyState week={week} />
      ) : (
        <div className="space-y-4">
          {(games as Game[]).map((game) => {
            const home = teamById.get(game.home_team_id ?? -1);
            const away = teamById.get(game.away_team_id ?? -1);
            if (!home || !away) return null;
            return (
              <GameCard
                key={game.id}
                game={game}
                home={{
                  team: home,
                  points: game.home_points,
                  rank: game.home_rank,
                  ...teamStats.get(home.id),
                }}
                away={{
                  team: away,
                  points: game.away_points,
                  rank: game.away_rank,
                  ...teamStats.get(away.id),
                }}
                myPick={pickByGame.get(game.id) ?? null}
                locked={new Date(game.start_date) <= new Date()}
                pickedBy={{
                  home: (pickersByGameAndTeam.get(`${game.id}:${home.id}`) ?? []).sort(),
                  away: (pickersByGameAndTeam.get(`${game.id}:${away.id}`) ?? []).sort(),
                }}
                potentialUpset={isPotentialUpset({
                  homeRank: game.home_sp_rank,
                  awayRank: game.away_sp_rank,
                  homeClassification: game.home_classification,
                  awayClassification: game.away_classification,
                })}
              />
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ week }: { week: number }) {
  return (
    <div className="rounded-lg border border-dashed border-field-line px-6 py-12 text-center">
      <p className="font-display text-xl text-chalk">No games loaded for Week {week} yet</p>
      <p className="mt-2 text-sm text-muted">
        Scores sync automatically during the season. If a week just started, give it a few
        minutes, or trigger a manual sync (see the README).
      </p>
    </div>
  );
}
