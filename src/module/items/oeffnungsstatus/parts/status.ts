/**
 * Gemeinsame Helfer für die Öffnungsstatus-Alternativen: zerlegt das Ergebnis von
 * getOpeningStatus() in ein Schlagwort („Geöffnet"), eine Detailzeile („bis 16 Uhr") und einen
 * Ton (open/soon/closed) — wird serverseitig (Fallback + Beispiele) und im Browser (Live-Update)
 * identisch benutzt. Beispielzeitpunkte decken alle Zustände ab, egal wann Josie schaut.
 */
import site from '../../../../data/site.json';
import { getOpeningStatus, formatShortTime, type OpeningStatus, type Schedule } from '../../../../lib/opening-hours';

export type Tone = 'open' | 'soon' | 'closed';

export interface StatusView {
  tone: Tone;
  /** kurzes Schlagwort: Geöffnet · Schließt bald · Ruhetag · Geschlossen */
  word: string;
  /** Detail: „bis 16 Uhr" · „noch 30 Minuten" · „Donnerstag ab 8 Uhr" */
  detail: string;
  /** Originaltext der Live-Komponente (für Screenreader/aria-live) */
  text: string;
}

export const SCHEDULE: Schedule = site.openingHours as unknown as Schedule;

export function toView(s: OpeningStatus): StatusView {
  if (s.state === 'open') {
    if (s.closingSoon) {
      const left = s.minutesToClose ?? 0;
      return { tone: 'soon', word: 'Schließt bald', detail: `noch ${left} Minute${left === 1 ? '' : 'n'}`, text: s.text };
    }
    return { tone: 'open', word: 'Geöffnet', detail: s.closesAt ? `bis ${formatShortTime(s.closesAt)}` : '', text: s.text };
  }
  const next = s.opensNext;
  const isRuhetag = /Ruhetag/.test(s.text);
  const word = s.exceptionLabel ? s.exceptionLabel : isRuhetag ? 'Ruhetag' : 'Geschlossen';
  const detail = next
    ? next.isToday
      ? `öffnet heute um ${formatShortTime(next.time)}`
      : `${next.dayLabel} ab ${formatShortTime(next.time)}`
    : '';
  return { tone: 'closed', word, detail, text: s.text };
}

export function viewNow(schedule: Schedule = SCHEDULE, now: Date = new Date()): StatusView {
  return toView(getOpeningStatus(schedule, now));
}

/** Feste Beispielzeitpunkte (Europe/Berlin), damit alle Zustände sichtbar sind */
export const EXAMPLES: { label: string; at: string }[] = [
  { label: 'Donnerstag, 10:00 Uhr', at: '2026-10-08T08:00:00Z' },
  { label: 'Samstag, 15:30 Uhr', at: '2026-10-10T13:30:00Z' },
  { label: 'Dienstag, 12:00 Uhr', at: '2026-10-06T10:00:00Z' },
];

export function exampleViews(schedule: Schedule = SCHEDULE): { label: string; view: StatusView }[] {
  return EXAMPLES.map((e) => ({ label: e.label, view: viewNow(schedule, new Date(e.at)) }));
}

/** Serverseitiger Fallback ohne JS — identisch mit der Live-Komponente */
export const FALLBACK: StatusView = {
  tone: 'closed',
  word: 'Öffnungszeiten',
  detail: 'Di + Mi Ruhetag · sonst 8–16 Uhr',
  text: 'Di + Mi Ruhetag · sonst 8–16 Uhr',
};
