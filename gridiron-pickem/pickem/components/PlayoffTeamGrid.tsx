'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Team } from '@/lib/database.types';

export default function PlayoffTeamGrid({
  groups,
  initialPickedIds,
  maxPicks,
  locked,
}: {
  groups: { conference: string; teams: Team[] }[];
  initialPickedIds: number[];
  maxPicks: number;
  locked: boolean;
}) {
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set(initialPickedIds));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function toggle(teamId: number) {
    if (locked) return;
    setError(null);
    const wasPicked = pickedIds.has(teamId);

    if (!wasPicked && pickedIds.size >= maxPicks) {
      setError(`You can only pick ${maxPicks} teams. Remove one first.`);
      return;
    }

    const previous = pickedIds;
    const next = new Set(pickedIds);
    if (wasPicked) {
      next.delete(teamId);
    } else {
      next.add(teamId);
    }
    setPickedIds(next); // optimistic

    startTransition(async () => {
      const res = wasPicked
        ? await fetch(`/api/playoff-picks?teamId=${teamId}`, { method: 'DELETE' })
        : await fetch('/api/playoff-picks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId }),
          });

      if (!res.ok) {
        setPickedIds(previous);
        const responseBody = await res.json().catch(() => ({}));
        setError(responseBody.error ?? 'Could not save pick');
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg border border-field-line bg-field-panel2 px-5 py-3">
        <span className="font-score text-sm uppercase tracking-widest text-muted">Selected</span>
        <span className="font-display text-xl text-chalk">
          {pickedIds.size} / {maxPicks}
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-miss/40 bg-miss/10 px-4 py-2 font-score text-xs text-miss">
          {error}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.conference} className="space-y-2">
          <h2 className="font-score text-[11px] uppercase tracking-widest text-muted">
            {group.conference}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.teams.map((team) => {
              const selected = pickedIds.has(team.id);
              return (
                <button
                  key={team.id}
                  onClick={() => toggle(team.id)}
                  disabled={pending || locked}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-bulb bg-bulb/15'
                      : 'border-field-line bg-field-panel hover:bg-field-panel2'
                  } ${pending || locked ? 'opacity-70' : ''}`}
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
                  <span className="font-display text-sm tracking-wide text-chalk">
                    {team.school}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
