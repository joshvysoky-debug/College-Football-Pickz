'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { PickOutcome } from '@/lib/scoring';
import type { UserWeekRecap } from '@/lib/weeklyRecap';

const OUTCOME_LABEL: Record<PickOutcome | 'pending', string> = {
  win: 'Win',
  home_upset_win: 'Home Upset',
  away_upset_win: 'Away Upset',
  neutral_upset_win: 'Neutral Upset',
  ot_loss: 'OT Loss',
  incorrect: 'Incorrect',
  no_pick: 'No Pick',
  pending: 'Pending',
};

const OUTCOME_STYLE: Record<PickOutcome | 'pending', string> = {
  win: 'text-turf-bright',
  home_upset_win: 'text-turf-bright',
  away_upset_win: 'text-turf-bright',
  neutral_upset_win: 'text-turf-bright',
  ot_loss: 'text-bulb',
  incorrect: 'text-miss',
  no_pick: 'text-muted',
  pending: 'text-muted',
};

export default function RecapBoard({ recaps }: { recaps: UserWeekRecap[] }) {
  const [selected, setSelected] = useState<string | 'all'>('all');

  const visible = selected === 'all' ? recaps : recaps.filter((r) => r.userId === selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" active={selected === 'all'} onClick={() => setSelected('all')} />
        {recaps.map((r) => (
          <FilterPill
            key={r.userId}
            label={r.name}
            active={selected === r.userId}
            onClick={() => setSelected(r.userId)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted">No players to show.</p>
      ) : (
        <div className="space-y-4">
          {visible.map((r) => (
            <div
              key={r.userId}
              className="overflow-hidden rounded-lg border border-field-line bg-field-panel2 shadow-glow"
            >
              <div className="flex items-center justify-between border-b border-field-line bg-field-night/60 px-5 py-3">
                <span className="font-display text-xl tracking-wide text-chalk">{r.name}</span>
                <span className="font-score text-lg tabular text-bulb">
                  {r.weekPoints} <span className="text-xs uppercase tracking-widest text-muted">pts</span>
                </span>
              </div>

              {r.picks.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">No featured games this week.</p>
              ) : (
                r.picks.map((p) => (
                  <div
                    key={p.gameId}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-field-line/60 px-5 py-3 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 font-score text-sm text-chalk">
                      <TeamLabel
                        team={p.away}
                        isPick={p.pickedTeamId === p.away.id}
                      />
                      <span className="text-muted">@</span>
                      <TeamLabel
                        team={p.home}
                        isPick={p.pickedTeamId === p.home.id}
                      />
                    </div>
                    <span
                      className={`font-score text-[11px] font-semibold uppercase tracking-widest ${OUTCOME_STYLE[p.outcome]}`}
                    >
                      {p.pickedTeam ? OUTCOME_LABEL[p.outcome] : 'No Pick'}
                    </span>
                    <span className="text-right font-score text-lg tabular text-chalk">
                      {p.completed ? `+${p.points}` : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamLabel({ team, isPick }: { team: { school: string; logo_url: string | null }; isPick: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${isPick ? 'text-bulb' : 'text-muted'}`}>
      {team.logo_url && (
        <Image src={team.logo_url} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
      )}
      {team.school}
    </span>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-score text-xs uppercase tracking-widest transition ${
        active
          ? 'border-bulb bg-bulb/15 text-bulb'
          : 'border-field-line text-muted hover:text-chalk'
      }`}
    >
      {label}
    </button>
  );
}
