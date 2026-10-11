import type { PlayerSeries } from '@/lib/seasonProgress';

const PALETTE = [
  '#C9A227', // bulb gold
  '#31B56A', // turf green
  '#E05252', // miss red
  '#5B9BD5', // steel blue
  '#B57EDC', // violet
  '#4FD1C5', // teal
  '#F0955A', // orange
  '#8B919A', // slate (fallback for 9th+ player)
];

const WIDTH = 800;
const HEIGHT = 320;
const PAD = { top: 24, right: 24, bottom: 40, left: 40 };
const CHART_W = WIDTH - PAD.left - PAD.right;
const CHART_H = HEIGHT - PAD.top - PAD.bottom;
// How far apart (px) to fan out lines that share the same place in a week,
// so tied players don't completely hide each other.
const TIE_SPREAD = 5;

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export default function SeasonProgressChart({
  weeks,
  series,
}: {
  weeks: number[];
  series: PlayerSeries[];
}) {
  const playerCount = Math.max(1, series.length);
  const places = Array.from({ length: playerCount }, (_, i) => i + 1);

  const xFor = (i: number) =>
    PAD.left + (weeks.length > 1 ? (i / (weeks.length - 1)) * CHART_W : CHART_W / 2);
  // 1st place at the top, last place at the bottom.
  const yForPlace = (place: number) =>
    PAD.top + (playerCount > 1 ? ((place - 1) / (playerCount - 1)) * CHART_H : CHART_H / 2);

  // For each week, fan out players tied at the same place by a few pixels.
  // tieOffset[seriesIdx][weekIdx] = vertical pixel offset
  const tieOffset: number[][] = series.map(() => weeks.map(() => 0));
  weeks.forEach((_, wi) => {
    const byPlace = new Map<number, number[]>();
    series.forEach((s, si) => {
      const r = s.ranks[wi];
      byPlace.set(r, [...(byPlace.get(r) ?? []), si]);
    });
    byPlace.forEach((idxs) => {
      if (idxs.length < 2) return;
      idxs.forEach((si, k) => {
        tieOffset[si][wi] = (k - (idxs.length - 1) / 2) * TIE_SPREAD;
      });
    });
  });

  return (
    <div className="rounded-lg border border-field-line bg-field-panel2 p-5 shadow-glow">
      <h2 className="font-display text-lg tracking-wide text-chalk">Weekly Standings</h2>

      <div className="mt-3 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full min-w-[520px]"
        >
          {places.map((p) => (
            <g key={p}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yForPlace(p)}
                y2={yForPlace(p)}
                stroke="#29303C"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={yForPlace(p)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted font-score text-[10px]"
              >
                {ordinal(p)}
              </text>
            </g>
          ))}

          {weeks.map((w, i) => (
            <text
              key={w}
              x={xFor(i)}
              y={HEIGHT - PAD.bottom + 20}
              textAnchor="middle"
              className="fill-muted font-score text-[10px]"
            >
              Wk {w}
            </text>
          ))}

          {series.map((s, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            const yAt = (i: number) => yForPlace(s.ranks[i]) + tieOffset[idx][i];
            const d = s.ranks
              .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)},${yAt(i)}`)
              .join(' ');
            return (
              <g key={s.userId}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.ranks.map((r, i) => (
                  <circle key={i} cx={xFor(i)} cy={yAt(i)} r={3.5} fill={color}>
                    <title>
                      {`${s.name} — Wk ${weeks[i]}: ${ordinal(r)} (${s.points[i]} pts)`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((s, idx) => (
          <div key={s.userId} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
            />
            <span className="font-score text-xs text-muted">
              {s.name}{' '}
              <span className="text-chalk">{ordinal(s.ranks.at(-1) ?? playerCount)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
