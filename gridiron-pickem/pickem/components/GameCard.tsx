'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Countdown from '@/components/Countdown';
import { formatGameDateTimeCT } from '@/lib/dateFormat';
import type { LastWeekResult } from '@/lib/teamStats';
import type { Game, Team } from '@/lib/database.types';

type TeamSide = {
  team: Team;
  points: number | null;
  rank: number | null;
  record?: string;
  lastWeek?: LastWeekResult;
};

export default function GameCard({
  game,
  home,
  away,
  myPick,
  locked,
  pickedBy,
}: {
  game: Game;
  home: TeamSide;
  away: TeamSide;
  myPick: number | null;
  locked: boolean;
  pickedBy?: { home: string[]; away: string[] };
}) {
  const [pick, setPick] = useState<number | null>(myPick);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function choose(teamId: number) {
    if (locked) return;
    setError(null);
    const previous = pick;

    // Clicking the already-selected team clears the pick.
    if (pick === teamId) {
      setPick(null); // optimistic
      startTransition(async () => {
        const res = await fetch(`/api/picks?gameId=${game.id}`, { method: 'DELETE' });
        if (!res.ok) {
          setPick(previous);
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? 'Could not clear pick');
        } else {
          router.refresh();
        }
      });
      return;
    }

    setPick(teamId); // optimistic

    startTransition(async () => {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, pickedTeamId: teamId }),
      });
      if (!res.ok) {
        setPick(previous);
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not save pick');
      } else {
        router.refresh();
      }
    });
  }

  const isFinal = game.completed;

  return (
    <div className="stub-notch flex overflow-hidden rounded-lg border border-field-line bg-field-panel">
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="font-score text-xs tabular text-muted">
            {formatGameDateTimeCT(game.start_date)}
            <span className="mx-1.5">&middot;</span>
            {isFinal ? (
              <span className="uppercase tracking-widest text-muted">Final</span>
            ) : (
              <Countdown startDate={game.start_date} />
            )}
          </span>
          {error && <span className="text-xs text-miss">{error}</span>}
        </div>

        <TeamRow
          side={away}
          selected={pick === away.team.id}
          winner={isFinal && game.winner_team_id === away.team.id}
          disabled={locked || pending}
          isFinal={isFinal}
          onChoose={() => choose(away.team.id)}
          pickedByNames={locked ? pickedBy?.away ?? [] : undefined}
        />
        <div className="h-px bg-field-line" />
        <TeamRow
          side={home}
          selected={pick === home.team.id}
          winner={isFinal && game.winner_team_id === home.team.id}
          disabled={locked || pending}
          isFinal={isFinal}
          onChoose={() => choose(home.team.id)}
          homeLabel
          pickedByNames={locked ? pickedBy?.home ?? [] : undefined}
        />
      </div>
      <div className="stub-perf" />
      <div className="flex w-16 shrink-0 items-center justify-center bg-field-panel2 font-display text-lg text-muted">
        {game.week}
      </div>
    </div>
  );
}

function TeamRow({
  side,
  selected,
  winner,
  disabled,
  isFinal,
  onChoose,
  homeLabel,
  pickedByNames,
}: {
  side: TeamSide;
  selected: boolean;
  winner: boolean;
  disabled: boolean;
  isFinal: boolean;
  onChoose: () => void;
  homeLabel?: boolean;
  pickedByNames?: string[];
}) {
  return (
    <button
      onClick={onChoose}
      disabled={disabled}
      className={`flex items-center justify-between rounded px-3 py-2 text-left transition ${
        selected ? 'bg-bulb/15 ring-1 ring-bulb' : 'hover:bg-field-panel2'
      } ${disabled && !selected ? 'cursor-default opacity-70' : ''}`}
    >
      <span className="flex items-center gap-3">
        {side.team.logo_url && (
          <Image
            src={side.team.logo_url}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        )}
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={`font-display text-xl tracking-wide ${winner ? 'text-turf-bright' : 'text-chalk'}`}>
              {side.rank !== null && <span className="text-bulb">#{side.rank} </span>}
              {side.team.school}
            </span>
            {side.record && (
              <span className="font-score text-xs text-muted">{side.record}</span>
            )}
            {side.lastWeek?.kind === 'bye' && (
              <span className="font-score text-xs text-muted">Bye Week</span>
            )}
            {side.lastWeek?.kind === 'result' && (
              <span className="font-score text-xs text-muted">
                <span className={side.lastWeek.won ? 'text-turf-bright' : 'text-miss'}>
                  {side.lastWeek.won ? 'W' : 'L'}
                </span>{' '}
                {side.lastWeek.teamScore}-{side.lastWeek.oppScore} vs {side.lastWeek.opponent}
              </span>
            )}
          </span>
          {homeLabel && <span className="text-[10px] uppercase tracking-widest text-muted">Home</span>}
          {pickedByNames && pickedByNames.length > 0 && (
            <span
              className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 font-score text-[10px] font-semibold uppercase tracking-widest ${
                isFinal
                  ? winner
                    ? 'border-turf-bright/40 bg-turf-bright/10 text-turf-bright'
                    : 'border-miss/40 bg-miss/10 text-miss'
                  : 'border-bulb/40 bg-bulb/10 text-bulb'
              }`}
            >
              Picked by {pickedByNames.join(', ')}
            </span>
          )}
        </span>
      </span>
      <span className="flex items-center gap-3">
        {isFinal && (
          <span className="font-score text-lg tabular text-chalk">{side.points ?? '-'}</span>
        )}
        {selected && !isFinal && (
          <span className="font-score text-[10px] uppercase tracking-widest text-bulb">
            Your pick &middot; tap to clear
          </span>
        )}
      </span>
    </button>
  );
}
