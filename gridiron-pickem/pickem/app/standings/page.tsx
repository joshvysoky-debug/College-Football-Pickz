import { createClient } from '@/lib/supabase/server';
import type { Standing } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function StandingsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('standings')
    .select('*')
    .order('correct', { ascending: false });

  const standings = (data ?? []) as Standing[];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl tracking-wide text-chalk">Standings</h1>

      <div className="overflow-hidden rounded-lg border border-field-line bg-field-panel2 shadow-glow">
        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 border-b border-field-line bg-field-night/60 px-5 py-3 font-score text-[11px] uppercase tracking-widest text-muted">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">W</span>
          <span className="text-right">Picks</span>
        </div>

        {standings.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No completed games yet this season &mdash; standings will fill in as results come in.
          </p>
        ) : (
          standings.map((s, i) => (
            <div
              key={s.user_id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 border-b border-field-line/60 px-5 py-4 last:border-b-0"
            >
              <span className="font-score text-lg tabular text-bulb">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-display text-xl tracking-wide text-chalk">
                {s.display_name ?? 'Anonymous'}
              </span>
              <span className="font-score text-2xl tabular text-chalk">
                {String(s.correct).padStart(2, '0')}
              </span>
              <span className="font-score text-sm tabular text-muted">/{s.total_completed}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
