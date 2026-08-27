import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { MAX_PLAYOFF_PICKS } from '@/lib/playoffConfig';
import type { Team } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function PlayerPlayoffPicksPage({
  params,
}: {
  params: { userId: string };
}) {
  const supabase = createClient();
  const { season } = currentSeasonAndWeek();

  const [{ data: profile }, { data: pickRows }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('id', params.userId).single(),
    supabase
      .from('playoff_picks')
      .select('team_id')
      .eq('user_id', params.userId)
      .eq('season', season),
  ]);

  if (!profile) {
    notFound();
  }

  const teamIds = (pickRows ?? []).map((p) => p.team_id);

  const { data: teams } =
    teamIds.length > 0
      ? await supabase.from('teams').select('*').in('id', teamIds)
      : { data: [] as Team[] };

  const name = profile.display_name?.trim() || 'Anonymous';
  const pickedTeams = ((teams ?? []) as Team[])
    .slice()
    .sort((a, b) => a.school.localeCompare(b.school));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/playoff-picks"
          className="font-score text-xs uppercase tracking-widest text-muted hover:text-chalk"
        >
          &larr; Playoff Picks
        </Link>
        <h1 className="mt-2 font-display text-3xl tracking-wide text-chalk">{name}&apos;s Picks</h1>
        <p className="mt-1 font-score text-xs text-muted">
          {pickedTeams.length} / {MAX_PLAYOFF_PICKS} selected
        </p>
      </div>

      {pickedTeams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-field-line px-6 py-12 text-center">
          <p className="text-sm text-muted">{name} hasn&apos;t made any playoff picks yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pickedTeams.map((team) => (
            <div
              key={team.id}
              className="flex items-center gap-2 rounded-lg border border-bulb bg-bulb/15 px-3 py-2"
            >
              {team.logo_url && (
                <Image
                  src={team.logo_url}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 object-contain"
                />
              )}
              <span className="font-display text-sm tracking-wide text-chalk">{team.school}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
