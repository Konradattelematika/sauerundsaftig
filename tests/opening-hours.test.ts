import { describe, expect, it } from 'vitest';
import { berlinParts, getOpeningStatus, weekOverview, type Schedule } from '../src/lib/opening-hours';
import site from '../src/data/site.json';

const schedule = site.openingHours as unknown as Schedule;

/** Erzeugt einen Date, der in Europe/Berlin der angegebenen Wanduhr-Zeit entspricht (Sommerzeit: UTC+2). */
function berlin(dateISO: string, hhmm: string, offset = '+02:00'): Date {
  return new Date(`${dateISO}T${hhmm}:00${offset}`);
}

describe('berlinParts', () => {
  it('rechnet UTC korrekt nach Europe/Berlin um (Sommerzeit)', () => {
    const p = berlinParts(new Date('2026-08-15T06:30:00Z')); // = 08:30 Berlin
    expect(p).toMatchObject({ dateISO: '2026-08-15', weekday: 'sat', minutes: 8 * 60 + 30 });
  });
  it('rechnet Winterzeit korrekt', () => {
    const p = berlinParts(new Date('2026-12-21T08:30:00Z')); // = 09:30 Berlin
    expect(p).toMatchObject({ dateISO: '2026-12-21', weekday: 'mon', minutes: 9 * 60 + 30 });
  });
});

describe('getOpeningStatus — alle sieben Wochentage', () => {
  // Woche ab Mo 2026-08-10
  it('Montag geöffnet (10:00)', () => {
    const s = getOpeningStatus(schedule, berlin('2026-08-10', '10:00'));
    expect(s.state).toBe('open');
    expect(s.closesAt).toBe('16:00');
    expect(s.closingSoon).toBe(false);
  });
  it('Dienstag Ruhetag → öffnet Donnerstag', () => {
    const s = getOpeningStatus(schedule, berlin('2026-08-11', '10:00'));
    expect(s.state).toBe('closed');
    expect(s.opensNext).toMatchObject({ dayLabel: 'Donnerstag', time: '08:00' });
    expect(s.text).toContain('Ruhetag');
  });
  it('Mittwoch Ruhetag → öffnet morgen', () => {
    const s = getOpeningStatus(schedule, berlin('2026-08-12', '10:00'));
    expect(s.state).toBe('closed');
    expect(s.opensNext?.dayLabel).toBe('morgen');
    expect(s.text).toContain('morgen ab 8 Uhr');
  });
  it.each([
    ['Donnerstag', '2026-08-13'],
    ['Freitag', '2026-08-14'],
    ['Samstag', '2026-08-15'],
    ['Sonntag', '2026-08-16'],
  ])('%s geöffnet um 12:00', (_n, d) => {
    expect(getOpeningStatus(schedule, berlin(d, '12:00')).state).toBe('open');
  });
});

describe('getOpeningStatus — Tagesränder', () => {
  it('vor Öffnung: öffnet heute', () => {
    const s = getOpeningStatus(schedule, berlin('2026-08-15', '07:15'));
    expect(s.state).toBe('closed');
    expect(s.opensNext).toMatchObject({ dayLabel: 'heute', time: '08:00', isToday: true });
  });
  it('exakt zur Öffnung 08:00 gilt als geöffnet', () => {
    expect(getOpeningStatus(schedule, berlin('2026-08-15', '08:00')).state).toBe('open');
  });
  it('exakt zur Schließung 16:00 gilt als geschlossen', () => {
    const s = getOpeningStatus(schedule, berlin('2026-08-15', '16:00'));
    expect(s.state).toBe('closed');
  });
  it('closingSoon ab ≤60 Minuten, mit Minutenangabe', () => {
    const s = getOpeningStatus(schedule, berlin('2026-08-15', '15:10'));
    expect(s.closingSoon).toBe(true);
    expect(s.minutesToClose).toBe(50);
    expect(s.text).toContain('50 Min');
  });
});

describe('getOpeningStatus — Feiertagsausnahmen', () => {
  it('Heiligabend geschlossen trotz regulärem Do', () => {
    const s = getOpeningStatus(schedule, berlin('2026-12-24', '10:00', '+01:00'));
    expect(s.state).toBe('closed');
    expect(s.exceptionLabel).toBe('Heiligabend');
    expect(s.text).toContain('Heiligabend');
  });
  it('nach Ausnahmen wieder normal: 27.12. (So) geöffnet', () => {
    const s = getOpeningStatus(schedule, berlin('2026-12-27', '10:00', '+01:00'));
    expect(s.state).toBe('open');
  });
});

describe('weekOverview', () => {
  it('liefert 7 Zeilen mit Ruhetagen', () => {
    const w = weekOverview(schedule);
    expect(w).toHaveLength(7);
    expect(w[1]).toMatchObject({ day: 'Dienstag', hours: 'Ruhetag' });
    expect(w[0]?.hours).toBe('08:00–16:00 Uhr');
  });
});
