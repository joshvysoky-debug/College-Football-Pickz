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
const PAD = { top: 24, right: 24, bottom: 40, left: 32 };
const CHART_W = WIDTH - PAD.left - PAD.right;
const CHART_H = HEIGHT - PAD.top - PAD.bottom;
const TICK_COUNT = 5;

export default function SeasonProgressChart({
  weeks,
  series,
}: {
  weeks: number[];
  series: PlayerSeries[];
}) {
  const maxPoint = Math.max(1, ...series.flatMap((s) => s.points));
  const niceMax = Math.max(5, Math.ceil(maxPoint / 5) * 5);
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) =>
    Math.round((niceMax / (TICK_COUNT - 1)) * i)
  );

  const xFor = (i: number) =>
    PAD.left + (weeks.length > 1 ? (i / (weeks.length - 1)) * CHART_W : CHART_W / 2);
  const yFor = (value: number) => PAD.top + CHART_H - (value / niceMax) * CHART_H;

  return (
    <div className="rounded-lg border border-field-line bg-field-panel2 p-5 shadow-glow">
      <h2 className="font-display text-lg tracking-wide text-chalk">Season Points</h2>

      <div className="mt-3 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full min-w-[520px]"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke="#29303C"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={yFor(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted font-score text-[10px]"
              >
                {t}
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
            const d = s.points
              .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)},${yFor(v)}`)
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
                {s.points.map((v, i) => (
                  <circle key={i} cx={xFor(i)} cy={yFor(v)} r={3} fill={color} />
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
              {s.name} <span className="text-chalk">{s.points.at(-1) ?? 0}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
