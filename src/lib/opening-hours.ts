/**
 * Öffnungszeiten-Logik — pure Funktionen, Zeitzone Europe/Berlin.
 * Wichtigste Einzelkomponente der Seite (Master-Prompt §9.1).
 */

export type TimeRange = [string, string]; // ["08:00","16:00"]
export type WeekKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Exception {
  date: string; // "2026-12-24"
  hours: TimeRange[];
  label?: string;
}

export interface Schedule {
  week: Record<WeekKey, TimeRange[]>;
  exceptions: Exception[];
}

export interface OpeningStatus {
  state: 'open' | 'closed';
  /** true wenn geöffnet und Schließung ≤ 60 min entfernt */
  closingSoon: boolean;
  /** "16:00" wenn geöffnet */
  closesAt?: string;
  /** Minuten bis zur Schließung, wenn geöffnet */
  minutesToClose?: number;
  /** nächste Öffnung, wenn geschlossen */
  opensNext?: { dayLabel: string; time: string; isToday: boolean };
  /** Kurztext, z. B. "Jetzt geöffnet · schließt um 16:00" */
  text: string;
  /** heutige Ausnahme (Feiertag o. Ä.) */
  exceptionLabel?: string;
}

const WEEK_KEYS: WeekKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES: Record<WeekKey, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
};

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Datum/Uhrzeit in Europe/Berlin, unabhängig von Server-/Client-Zeitzone. */
export function berlinParts(now: Date): { dateISO: string; weekday: WeekKey; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const wd = (parts.weekday ?? 'Mon').toLowerCase().slice(0, 3) as WeekKey;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    dateISO: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEK_KEYS.includes(wd) ? wd : 'mon',
    minutes: Number(hour) * 60 + Number(parts.minute),
  };
}

function hoursFor(schedule: Schedule, dateISO: string, weekday: WeekKey): { hours: TimeRange[]; label?: string } {
  const ex = schedule.exceptions.find((e) => e.date === dateISO);
  if (ex) return { hours: ex.hours, label: ex.label };
  return { hours: schedule.week[weekday] ?? [] };
}

function addDays(dateISO: string, days: number): { dateISO: string; weekday: WeekKey } {
  const d = new Date(`${dateISO}T12:00:00Z`); // Mittag UTC: DST-sicher fürs Datum-Rechnen
  d.setUTCDate(d.getUTCDate() + days);
  const iso = d.toISOString().slice(0, 10);
  const wd = WEEK_KEYS[d.getUTCDay()] as WeekKey;
  return { dateISO: iso, weekday: wd };
}

/** Ermittelt den Live-Status. `now` injizierbar für Tests. */
export function getOpeningStatus(schedule: Schedule, now: Date = new Date()): OpeningStatus {
  const { dateISO, weekday, minutes } = berlinParts(now);
  const today = hoursFor(schedule, dateISO, weekday);

  // Gerade geöffnet?
  for (const [open, close] of today.hours) {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (minutes >= o && minutes < c) {
      const left = c - minutes;
      return {
        state: 'open',
        closingSoon: left <= 60,
        closesAt: close,
        minutesToClose: left,
        text: left <= 60
          ? `Jetzt geöffnet · schließt in ${left} Min`
          : `Jetzt geöffnet · schließt um ${close.replace(':', ':')}`,
        exceptionLabel: today.label,
      };
    }
  }

  // Öffnet heute noch?
  const upcoming = today.hours
    .map(([open]) => open)
    .filter((open) => toMinutes(open) > minutes)
    .sort((a, b) => toMinutes(a) - toMinutes(b))[0];
  if (upcoming) {
    return {
      state: 'closed',
      closingSoon: false,
      opensNext: { dayLabel: 'heute', time: upcoming, isToday: true },
      text: `Noch geschlossen · öffnet heute um ${upcoming}`,
      exceptionLabel: today.label,
    };
  }

  // Nächster Öffnungstag (max. 14 Tage vorausschauen)
  let cursor = { dateISO, weekday };
  for (let i = 1; i <= 14; i++) {
    cursor = addDays(cursor.dateISO, 1);
    const day = hoursFor(schedule, cursor.dateISO, cursor.weekday);
    const first = day.hours[0];
    if (first) {
      const dayLabel = i === 1 ? 'morgen' : DAY_NAMES[cursor.weekday];
      const isRuhetag = today.hours.length === 0 && !today.label;
      return {
        state: 'closed',
        closingSoon: false,
        opensNext: { dayLabel, time: first[0], isToday: false },
        text: `${today.label ? `${today.label} — geschlossen` : isRuhetag ? 'Heute Ruhetag' : 'Heute geschlossen'} · ${dayLabel === 'morgen' ? 'morgen' : DAY_NAMES[cursor.weekday]} ab ${formatShortTime(first[0])}`,
        exceptionLabel: today.label,
      };
    }
  }

  return { state: 'closed', closingSoon: false, text: 'Zurzeit geschlossen', exceptionLabel: today.label };
}

/** "08:00" → "8 Uhr", "08:30" → "8:30 Uhr" */
export function formatShortTime(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const hour = String(Number(h));
  return m === '00' ? `${hour} Uhr` : `${hour}:${m} Uhr`;
}

/** Wochenübersicht für Anzeige + Schema.org, Ruhetage zusammengefasst. */
export function weekOverview(schedule: Schedule): { day: string; short: string; hours: string }[] {
  const order: WeekKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return order.map((k) => ({
    day: DAY_NAMES[k],
    short: DAY_NAMES[k].slice(0, 2),
    hours: (schedule.week[k] ?? []).length === 0
      ? 'Ruhetag'
      : (schedule.week[k] ?? []).map(([a, b]) => `${a}–${b} Uhr`).join(', '),
  }));
}
