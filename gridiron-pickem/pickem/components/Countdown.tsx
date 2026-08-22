'use client';

import { useEffect, useState } from 'react';

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Kicked off';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Locks in ${days}d ${hours}h`;
  if (hours > 0) return `Locks in ${hours}h ${minutes}m`;
  return `Locks in ${minutes}m`;
}

export default function Countdown({ startDate }: { startDate: string }) {
  const target = new Date(startDate).getTime();
  const [label, setLabel] = useState(() => formatRemaining(target - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setLabel(formatRemaining(target - Date.now()));
    }, 30_000);
    return () => clearInterval(id);
  }, [target]);

  const locked = target - Date.now() <= 0;

  return (
    <span className={`font-score text-xs tabular ${locked ? 'text-miss' : 'text-bulb'}`}>
      {label}
    </span>
  );
}
