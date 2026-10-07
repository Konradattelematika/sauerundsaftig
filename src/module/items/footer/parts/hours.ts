/**
 * Öffnungszeiten kompakt: aufeinanderfolgende Tage mit gleichen Zeiten zusammenfassen
 * („Mo 8–16 Uhr · Di–Mi Ruhetag · Do–So 8–16 Uhr"). Quelle: site.json über opening-hours.ts.
 */
import { formatShortTime, type Schedule, type WeekKey } from '../../../../lib/opening-hours';

const ORDER: WeekKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SHORT: Record<WeekKey, string> = { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' };

function rangeText(ranges: [string, string][]): string {
  if (ranges.length === 0) return 'Ruhetag';
  return ranges.map(([a, b]) => `${formatShortTime(a).replace(' Uhr', '')}–${formatShortTime(b)}`).join(', ');
}

export function compactHours(schedule: Schedule): { days: string; hours: string; closed: boolean }[] {
  const groups: { from: WeekKey; to: WeekKey; hours: string }[] = [];
  for (const key of ORDER) {
    const hours = rangeText(schedule.week[key] ?? []);
    const last = groups[groups.length - 1];
    if (last && last.hours === hours) last.to = key;
    else groups.push({ from: key, to: key, hours });
  }
  return groups.map((g) => ({
    days: g.from === g.to ? SHORT[g.from] : `${SHORT[g.from]}–${SHORT[g.to]}`,
    hours: g.hours,
    closed: g.hours === 'Ruhetag',
  }));
}
