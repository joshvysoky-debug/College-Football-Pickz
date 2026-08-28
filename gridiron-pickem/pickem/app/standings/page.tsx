import { createClient } from '@/lib/supabase/server';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { buildSeasonProgress, type PickRow } from '@/lib/seasonProgress';
import { buildStandings } from '@/lib/standings';
import SeasonProgressChart from '@/components/SeasonProgressChart';
import type { Game } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function StandingsPage() {
  const supabase = createClient();
  const { season } = currentSeasonAndWeek();

  const [{ data: profiles }, { data: completedGames }, { data: playoffPicks }, { data: playoffField }] =
    await Promise.all([
      supabase.from('profiles').select('id, display_name'),
      supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('completed', true)
        .order('week', { ascending: true }),
      supabase.from('playoff_picks').select('user_id, team_id').eq('season', season),
      supabase.from('playoff_field').select('team_id').eq('season', season),
    ]);

  const games = (completedGames ?? []) as Game[];
  const gameIds = games.map((g) => g.id);

  const { data: picksData } =
    gameIds.length > 0
      ? await supabase.from('picks').select('game_id, picked_team_id, user_id').in('game_id', gameIds)
      : { data: [] as PickRow[] };

  const nameById = new Map<string, string>(
    (profiles ?? []).map((p) => [p.id, p.display_name?.trim() || 'Anonymous'])
  );

  const { weeks, series } = buildSeasonProgress({
    games,
    picks: picksData ?? [],
    nameById,
  });

  const playoffFieldTeamIds = new Set((playoffField ?? []).map((r) => r.team_id));

  const standings = buildStandings({
    games,
    picks: picksData ?? [],
    playoffPicks: playoffPicks ?? [],
    playoffFieldTeamIds,
    profiles: profiles ?? [],
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl tracking-wide text-chalk">Standings</h1>

      {weeks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-field-line px-6 py-10 text-center">
          <p className="text-sm text-muted">
            The season points chart will fill in once games start finishing.
          </p>
        </div>
      ) : (
        <SeasonProgressChart weeks={weeks} series={series} />
      )}

      <div className="overflow-hidden rounded-lg border border-field-line bg-field-panel2 shadow-glow">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-4 border-b border-field-line bg-field-night/60 px-5 py-3 font-score text-[11px] uppercase tracking-widest text-muted">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">Weekly</span>
          <span className="text-right">Playoff</span>
          <span className="text-right">Total</span>
        </div>

        {standings.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No completed games yet this season &mdash; standings will fill in as results come in.
          </p>
        ) : (
          standings.map((s, i) => (
            <div
              key={s.userId}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-4 border-b border-field-line/60 px-5 py-4 last:border-b-0"
            >
              <span className="font-score text-lg tabular text-bulb">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <span className="font-display text-xl tracking-wide text-chalk">{s.name}</span>
                <span className="ml-2 font-score text-xs tabular text-muted">
                  {s.correctPicks}/{s.totalCompletedPicks} correct
                </span>
              </div>
              <span className="font-score text-sm tabular text-muted">{s.weeklyPoints}</span>
              <span className="font-score text-sm tabular text-muted">{s.playoffPoints}</span>
              <span className="font-score text-2xl tabular text-chalk">{s.totalPoints}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
