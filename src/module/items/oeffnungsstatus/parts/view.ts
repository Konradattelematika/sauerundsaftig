/**
 * Reiner Helfer (ohne Daten-Import, läuft auch im Browser-Bundle): zerlegt das Ergebnis von
 * getOpeningStatus() in Schlagwort („Geöffnet"), Detailzeile („bis 16 Uhr") und Ton
 * (open/soon/closed). Server und Browser nutzen dieselbe Funktion → kein Flackern.
 */
import { formatShortTime, type OpeningStatus } from '../../../../lib/opening-hours';

export type Tone = 'open' | 'soon' | 'closed';

export interface StatusView {
  tone: Tone;
  /** kurzes Schlagwort: Geöffnet · Schließt bald · Ruhetag · Geschlossen · Heiligabend */
  word: string;
  /** Detail: „bis 16 Uhr" · „noch 30 Minuten" · „Donnerstag ab 8 Uhr" */
  detail: string;
  /** Originaltext der Live-Komponente (für aria-live) */
  text: string;
}

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

/** Serverseitiger Fallback ohne JS — derselbe Wortlaut wie in der Live-Komponente */
export const FALLBACK: StatusView = {
  tone: 'closed',
  word: 'Öffnungszeiten',
  detail: 'Di + Mi Ruhetag · sonst 8–16 Uhr',
  text: 'Di + Mi Ruhetag · sonst 8–16 Uhr',
};
