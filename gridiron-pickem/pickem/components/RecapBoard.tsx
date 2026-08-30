'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import type { PickOutcome } from '@/lib/scoring';
import type { RecapPickRow, UserWeekRecap, WeekGameRow } from '@/lib/weeklyRecap';

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

type GamePickEntry = {
  userId: string;
  name: string;
  pickedTeam: RecapPickRow['pickedTeam'];
  outcome: PickOutcome | 'pending';
  points: number;
  completed: boolean;
};

export default function RecapBoard({
  recaps,
  games,
}: {
  recaps: UserWeekRecap[];
  games: WeekGameRow[];
}) {
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);

  // Drives the kickoff-lock check below. Re-checked every 30s so a game
  // that kicks off while someone has the Recap page open unlocks on its
  // own, without needing a refresh (same pattern as Countdown.tsx).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Everyone already comes down in `recaps`, so "everyone's picks for this
  // game" is just a regroup of data already on the page — no extra fetch.
  const entriesByGame = useMemo(() => {
    const map = new Map<number, GamePickEntry[]>();
    for (const r of recaps) {
      for (const p of r.picks) {
        const arr = map.get(p.gameId) ?? [];
        arr.push({
          userId: r.userId,
          name: r.name,
          pickedTeam: p.pickedTeam,
          outcome: p.outcome,
          points: p.points,
          completed: p.completed,
        });
        map.set(p.gameId, arr);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    }
    return map;
  }, [recaps]);

  return (
    <div className="space-y-6">
      {/* Weekly totals */}
      <div className="overflow-hidden rounded-lg border border-field-line bg-field-panel2 shadow-glow">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-b border-field-line bg-field-night/60 px-5 py-3 font-score text-[11px] uppercase tracking-widest text-muted">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">Points</span>
        </div>
        {recaps.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No players yet.</p>
        ) : (
          recaps.map((r, i) => (
            <div
              key={r.userId}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-b border-field-line/60 px-5 py-3 last:border-b-0"
            >
              <span className="font-score text-sm tabular text-bulb">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-display text-lg tracking-wide text-chalk">{r.name}</span>
              <span className="text-right font-score text-lg tabular text-chalk">{r.weekPoints}</span>
            </div>
          ))
        )}
      </div>

      {/* Games — click a row to see everyone's pick for that game */}
      <div className="overflow-hidden rounded-lg border border-field-line bg-field-panel2 shadow-glow">
        <div className="border-b border-field-line bg-field-night/60 px-5 py-3 font-score text-[11px] uppercase tracking-widest text-muted">
          Games
        </div>
        {games.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No featured games this week.</p>
        ) : (
          games.map((g) => {
            const isExpanded = expandedGameId === g.gameId;
            const entries = entriesByGame.get(g.gameId) ?? [];
            const kickedOff = now >= new Date(g.startDate).getTime();

            return (
              <div key={g.gameId} className="border-b border-field-line/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpandedGameId(isExpanded ? null : g.gameId)}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-3 text-left transition ${
                    isExpanded ? 'bg-field-night/50' : 'hover:bg-field-night/30'
                  }`}
                >
                  <span className="flex items-center gap-2 font-score text-sm text-chalk">
                    <TeamLabel team={g.away} />
                    <span className="text-muted">@</span>
                    <TeamLabel team={g.home} />
                  </span>
                  <span className="font-score text-[11px] uppercase tracking-widest text-muted">
                    {g.completed ? 'Final' : kickedOff ? 'Upcoming' : 'Locked'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="space-y-1.5 bg-field-night/40 px-5 py-3">
                    {!kickedOff ? (
                      <p className="font-score text-xs uppercase tracking-widest text-muted">
                        Picks are hidden until kickoff.
                      </p>
                    ) : entries.length === 0 ? (
                      <p className="font-score text-xs text-muted">No one has picked this game yet.</p>
                    ) : (
                      entries.map((e) => (
                        <div key={e.userId} className="flex items-center justify-between font-score text-xs">
                          <span className="text-chalk">{e.name}</span>
                          <span className="flex items-center gap-3">
                            <span className="text-chalk">{e.pickedTeam ? e.pickedTeam.school : '—'}</span>
                            <span className={`w-24 text-right uppercase tracking-widest ${OUTCOME_STYLE[e.outcome]}`}>
                              {e.pickedTeam ? OUTCOME_LABEL[e.outcome] : 'No Pick'}
                            </span>
                            <span className="w-8 text-right tabular text-muted">
                              {e.completed ? `+${e.points}` : '—'}
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TeamLabel({ team }: { team: { school: string; logo_url: string | null } }) {
  return (
    <span className="flex items-center gap-1.5 text-chalk">
      {team.logo_url && (
        <Image
          src={team.logo_url}
          alt=""
          width={18}
          height={18}
          unoptimized
          className="h-[18px] w-[18px] object-contain"
        />
      )}
      {team.school}
    </span>
  );
}
