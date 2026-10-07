/**
 * Gemeinsame Besuchs-Daten für die Alternativen: Wochentage, zusammengefasste Öffnungszeiten,
 * Hinweise (Stand Agent R: nicht barrierefrei, Hunde an der Leine, bar oder Karte) und Icon-Pfade
 * (lucide-static, ISC — als Pfaddaten übernommen, damit kein Laufzeit-Import nötig ist).
 */
import site from '../../../data/site.json';
import { weekOverview, type Schedule } from '../../../lib/opening-hours';
import { telHref, routeHref } from '../../../lib/format';

export const schedule = site.openingHours as unknown as Schedule;
export const week = weekOverview(schedule);
export const WEEK_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const phoneHref = telHref(site.phone);
export const route = routeHref(site.address.street, site.address.zip, site.address.city);
export const RESERVIEREN = 'Reserviere deinen Tisch per Telefon.';

/** "08:00–16:00 Uhr" → "8–16 Uhr" */
export function shortHours(hours: string): string {
  return hours.replace(/0?(\d{1,2}):00/g, '$1');
}

/** Aufeinanderfolgende Tage mit gleichen Zeiten zusammenfassen: [{ label: "Do – So", hours }] */
export function groupedWeek(): { label: string; longLabel: string; hours: string; closed: boolean }[] {
  const groups: { from: number; to: number; hours: string }[] = [];
  week.forEach((d, i) => {
    const last = groups.at(-1);
    if (last && last.hours === d.hours) last.to = i;
    else groups.push({ from: i, to: i, hours: d.hours });
  });
  return groups.map((g) => {
    const a = week[g.from]!;
    const b = week[g.to]!;
    const single = g.from === g.to;
    const sep = g.to - g.from === 1 ? ' + ' : ' – ';
    return {
      label: single ? a.short : `${a.short}${sep}${b.short}`,
      longLabel: single ? a.day : `${a.day}${g.to - g.from === 1 ? ' und ' : ' bis '}${b.day}`,
      hours: g.hours,
      closed: g.hours === 'Ruhetag',
    };
  });
}

export const breakfastUntil = site.breakfastUntil.replace(/^0/, '').replace(':00', '');

export interface Hint {
  id: 'hund' | 'zahlung' | 'barriere';
  text: string;
  /** SVG-Inhalt (24×24, stroke) */
  icon: string;
}

export const HINTS: Hint[] = [
  {
    id: 'hund',
    text: 'Hunde an der Leine sind willkommen.',
    icon: '<path d="M11.25 16.25h1.5L12 17z"/><path d="M16 14v.5"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309"/><path d="M8 14v.5"/><path d="M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/>',
  },
  {
    id: 'zahlung',
    text: 'Bezahlen kannst du bar oder mit Karte.',
    icon: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  },
  {
    id: 'barriere',
    text: 'Das Café ist leider nicht barrierefrei.',
    icon: '<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>',
  },
];

export const ICON_PHONE =
  '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>';
export const ICON_PIN = '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>';
export const ICON_SUNRISE =
  '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>';
