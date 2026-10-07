/**
 * Serverseitige Beispiele für die Vorschau: feste Zeitpunkte (Europe/Berlin), damit Josie alle
 * Zustände sieht, egal wann sie schaut. Echte Logik aus src/lib/opening-hours.ts, echte Zeiten
 * aus src/data/site.json.
 */
import site from '../../../../data/site.json';
import { getOpeningStatus, weekOverview, type Schedule } from '../../../../lib/opening-hours';
import { toView, type StatusView } from './view';

export const SCHEDULE: Schedule = site.openingHours as unknown as Schedule;
export const SCHEDULE_JSON = JSON.stringify({ week: SCHEDULE.week, exceptions: SCHEDULE.exceptions });

export const WEEK = weekOverview(SCHEDULE);

export const EXAMPLES: { label: string; at: string }[] = [
  { label: 'Donnerstag, 10:00 Uhr', at: '2026-10-08T08:00:00Z' },
  { label: 'Samstag, 15:30 Uhr', at: '2026-10-10T13:30:00Z' },
  { label: 'Dienstag, 12:00 Uhr', at: '2026-10-06T10:00:00Z' },
];

export function exampleViews(): { label: string; view: StatusView }[] {
  return EXAMPLES.map((e) => ({ label: e.label, view: toView(getOpeningStatus(SCHEDULE, new Date(e.at))) }));
}

/** Aktueller Zustand zur Build-Zeit (wird im Browser sofort überschrieben) */
export function viewNow(): StatusView {
  return toView(getOpeningStatus(SCHEDULE));
}
