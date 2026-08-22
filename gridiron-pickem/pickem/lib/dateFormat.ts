/**
 * Central Time (America/Chicago) date/time formatting helpers.
 * Uses the IANA time zone so it always renders the correct CDT/CST
 * abbreviation for the date in question, rather than assuming one.
 */

export function formatGameDateTimeCT(startDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startDate));
}

export function formatWeekDateRange(startDates: string[]): string {
  if (startDates.length === 0) return '';

  const sorted = [...startDates]
    .map((d) => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime());

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const dayFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
  });
  const yearFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
  });

  const firstStr = dayFmt.format(first);
  const lastStr = dayFmt.format(last);
  const year = yearFmt.format(last);

  if (firstStr === lastStr) return `${firstStr}, ${year}`;
  return `${firstStr} – ${lastStr}, ${year}`;
}
