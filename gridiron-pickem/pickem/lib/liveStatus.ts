/**
 * Formats a game's live period/clock into a short badge label, e.g.
 * "Q3 · 8:42", "Halftime", or "OT". Returns null when there isn't enough
 * live data to show anything meaningful, so callers can fall back to their
 * own pre-kickoff countdown or Final badge instead.
 */
export function formatLiveStatus(
  liveStatusField: string | null,
  period: number | null,
  clock: string | null
): string | null {
  const normalizedStatus = liveStatusField?.toLowerCase() ?? null;

  if (normalizedStatus === 'halftime') return 'Halftime';

  if (period === null) return null;

  const quarterLabel = period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `${period - 4}OT`;

  // Clock can be legitimately absent right at kickoff/quarter boundaries;
  // still show the quarter rather than nothing.
  return clock ? `${quarterLabel} · ${clock}` : quarterLabel;
}
