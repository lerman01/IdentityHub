const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const STEPS: Array<[limitSeconds: number, divisor: number, unit: Intl.RelativeTimeFormatUnit]> = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86400, 3600, 'hour'],
  [604800, 86400, 'day'],
  [2629800, 604800, 'week'],
  [31557600, 2629800, 'month'],
  [Infinity, 31557600, 'year'],
];

/** "12 seconds ago", "3 minutes ago", "yesterday" — no library needed. */
export function relativeTime(iso: string): string {
  const parsed = Date.parse(iso);
  // Timestamps now come from Jira; don't render "Invalid Date" if one surprises us.
  if (Number.isNaN(parsed)) return 'unknown';

  const seconds = (parsed - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  for (const [limit, divisor, unit] of STEPS) {
    if (abs < limit) return rtf.format(Math.round(seconds / divisor), unit);
  }
  return rtf.format(Math.round(seconds / 31557600), 'year');
}
