import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { MAX_PLAYOFF_PICKS } from '@/lib/playoffConfig';
import PlayoffTeamGrid from '@/components/PlayoffTeamGrid';
import type { Team } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function PlayoffPicksPage() {
  const supabase = createClient();
  const { season } = currentSeasonAndWeek();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: teams }, { data: allPicks }, { data: profiles }] = await Promise.all([
    supabase
      .from('teams')
      .select('*')
      .eq('classification', 'fbs')
      .order('conference', { ascending: true })
      .order('school', { ascending: true }),
    supabase.from('playoff_picks').select('user_id, team_id').eq('season', season),
    supabase.from('profiles').select('id, display_name'),
  ]);

  const fbsTeams = (teams ?? []) as Team[];
  const picks = allPicks ?? [];
  const myPickedIds = user ? picks.filter((p) => p.user_id === user.id).map((p) => p.team_id) : [];

  const countByUser = new Map<string, number>();
  for (const p of picks) {
    countByUser.set(p.user_id, (countByUser.get(p.user_id) ?? 0) + 1);
  }

  const roster = (profiles ?? [])
    .map((p) => ({
      id: p.id,
      name: p.display_name?.trim() || 'Anonymous',
      count: countByUser.get(p.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamsByConference = new Map<string, Team[]>();
  for (const t of fbsTeams) {
    const key = t.conference ?? 'Independents';
    const list = teamsByConference.get(key) ?? [];
    list.push(t);
    teamsByConference.set(key, list);
  }

  const groups = Array.from(teamsByConference.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([conference, confTeams]) => ({ conference, teams: confTeams }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-wide text-chalk">Playoff Picks</h1>
        <p className="mt-1 font-score text-xs text-muted">
          Pick the {MAX_PLAYOFF_PICKS} teams you think make the College Football Playoff. FBS
          teams only.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg tracking-wide text-chalk">Everyone&apos;s Picks</h2>
        <div className="overflow-hidden rounded-lg border border-field-line bg-field-panel2 shadow-glow">
          {roster.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">No players yet.</p>
          ) : (
            roster.map((p) => (
              <Link
                key={p.id}
                href={`/playoff-picks/${p.id}`}
                className="flex items-center justify-between border-b border-field-line/60 px-5 py-3 transition last:border-b-0 hover:bg-field-panel"
              >
                <span className="font-display text-lg tracking-wide text-chalk">{p.name}</span>
                <span className="font-score text-sm tabular text-muted">
                  {p.count} / {MAX_PLAYOFF_PICKS}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg tracking-wide text-chalk">Your Picks</h2>
        {fbsTeams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-field-line px-6 py-12 text-center">
            <p className="font-display text-xl text-chalk">No teams loaded yet</p>
            <p className="mt-2 text-sm text-muted">
              Teams load in automatically the next time scores sync.
            </p>
          </div>
        ) : (
          <PlayoffTeamGrid
            groups={groups}
            initialPickedIds={myPickedIds}
            maxPicks={MAX_PLAYOFF_PICKS}
          />
        )}
      </div>
    </div>
  );
}
