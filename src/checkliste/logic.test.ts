import { describe, expect, it } from 'vitest';
import seed from '../../server/seed/checklist.json';
import {
  countdown,
  defaultFilters,
  formatShort,
  groupItems,
  linkify,
  matchesFilters,
  parseFilters,
  progress,
  safeHref,
} from './logic';
import type { Item } from './types';

function item(p: Partial<Item> & { id: string }): Item {
  return {
    title: p.id,
    description: '',
    phase: 'vor',
    owner: 'team',
    status: 'offen',
    priority: 'normal',
    category: 'Inhalte',
    createdAt: '2026-10-07T08:00:00Z',
    updatedAt: '2026-10-07T08:00:00Z',
    updatedBy: 'seed',
    ...p,
  };
}

describe('Filter', () => {
  it('Standard je Rolle', () => {
    expect(defaultFilters('inhaberin')).toEqual({ fuer: 'josie', phase: 'alle', status: 'offen' });
    expect(defaultFilters('team')).toEqual({ fuer: 'alle', phase: 'alle', status: 'offen' });
  });
  it('liest URL-Parameter, ungültige Werte → Rollen-Standard', () => {
    expect(parseFilters('?fuer=team&phase=nach&status=alle', 'inhaberin')).toEqual({ fuer: 'team', phase: 'nach', status: 'alle' });
    expect(parseFilters('?fuer=quatsch', 'inhaberin').fuer).toBe('josie');
  });
  it('„Josie" umfasst beide, „Erledigt" umfasst verworfen', () => {
    const f = { fuer: 'josie', phase: 'alle', status: 'offen' } as const;
    expect(matchesFilters(item({ id: 'a', owner: 'beide' }), f)).toBe(true);
    expect(matchesFilters(item({ id: 'b', owner: 'team' }), f)).toBe(false);
    expect(matchesFilters(item({ id: 'c', owner: 'josie', status: 'in_arbeit' }), f)).toBe(true);
    expect(matchesFilters(item({ id: 'd', status: 'verworfen' }), { fuer: 'alle', phase: 'alle', status: 'erledigt' })).toBe(true);
  });
});

describe('Gruppierung & Fortschritt', () => {
  const items = [
    item({ id: 'n1', phase: 'nach', category: 'Fotos' }),
    item({ id: 'v1', category: 'Inhalte' }),
    item({ id: 'v2', category: 'Rechtliches', priority: 'blocker' }),
    item({ id: 'v3', category: 'Inhalte', priority: 'wichtig' }),
    item({ id: 'v4', category: 'Inhalte', status: 'erledigt' }),
    item({ id: 'v5', category: 'Inhalte', status: 'verworfen', priority: 'blocker' }),
  ];
  it('Phase vor → nach, Kategorie in Erscheinungsreihenfolge, Priorität zuerst', () => {
    const g = groupItems(items, { fuer: 'alle', phase: 'alle', status: 'offen' });
    expect(g.map((x) => x.phase)).toEqual(['vor', 'nach']);
    expect(g[0].categories.map((c) => c.category)).toEqual(['Inhalte', 'Rechtliches']);
    expect(g[0].categories[0].items.map((i) => i.id)).toEqual(['v3', 'v1']);
  });
  it('„keep" hält gerade geänderte Punkte sichtbar', () => {
    const g = groupItems(items, { fuer: 'alle', phase: 'alle', status: 'offen' }, new Set(['v4']));
    expect(g[0].categories[0].items.map((i) => i.id)).toContain('v4');
  });
  it('Fortschritt ohne verworfene, offene Blocker', () => {
    expect(progress(items)).toEqual({ vor: { done: 1, total: 4 }, nach: { done: 0, total: 1 }, openBlockers: 1 });
  });
});

describe('Zeit (Europe/Berlin)', () => {
  it('kurzes Format „07.10., 14:32"', () => {
    expect(formatShort('2026-10-07T12:32:00Z', new Date('2026-10-07T13:00:00Z'))).toBe('07.10., 14:32');
    expect(formatShort('2025-12-24T08:05:00Z', new Date('2026-10-07T13:00:00Z'))).toBe('24.12.2025, 09:05');
  });
  it('Countdown und „Seit … live"', () => {
    const at = '2026-10-10T16:00:00+02:00';
    expect(countdown(at, new Date('2026-10-07T10:00:00+02:00'))).toEqual({ live: false, text: 'Noch 3 Tage, 6 Stunden' });
    expect(countdown(at, new Date('2026-10-10T15:59:00+02:00')).text).toBe('Noch 1 Minute');
    expect(countdown(at, new Date('2026-10-10T16:00:00+02:00'))).toEqual({ live: true, text: 'Seit 10.10.2026, 16:00 Uhr live' });
  });
});

describe('Text & Links', () => {
  it('erkennt Links ohne Satzzeichen am Ende', () => {
    expect(linkify('Siehe https://sauerundsaftig.de/karte. Danke')).toEqual([
      { type: 'text', value: 'Siehe ' },
      { type: 'link', href: 'https://sauerundsaftig.de/karte', label: 'sauerundsaftig.de/karte' },
      { type: 'text', value: '. Danke' },
    ]);
  });
  it('lässt HTML als Text stehen und lässt nur http(s) als Link zu', () => {
    expect(linkify('<img src=x onerror=alert(1)>')).toEqual([{ type: 'text', value: '<img src=x onerror=alert(1)>' }]);
    expect(linkify('javascript:alert(1)')).toEqual([{ type: 'text', value: 'javascript:alert(1)' }]);
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://sauerundsaftig.de/besuch')).toBe('https://sauerundsaftig.de/besuch');
  });
});

describe('Seed server/seed/checklist.json', () => {
  const items = seed.items as Array<Record<string, unknown>>;
  it('Format und feste kebab-case-IDs', () => {
    expect(seed.version).toBe(1);
    const ids = items.map((i) => i.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of items) {
      expect(it.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(typeof it.title).toBe('string');
      expect(typeof it.description).toBe('string');
      expect(['vor', 'nach']).toContain(it.phase);
      expect(['team', 'josie', 'beide']).toContain(it.owner);
      expect(['offen', 'in_arbeit', 'erledigt', 'verworfen']).toContain(it.status);
      expect(['blocker', 'wichtig', 'normal']).toContain(it.priority);
      expect(typeof it.category).toBe('string');
      if (it.link !== undefined) expect(it.link).toMatch(/^https:\/\/(module\.)?sauerundsaftig\.de(\/|$)/);
      if (it.link !== undefined) expect(it.link).not.toMatch(/sauerundsaftig\.de\/a(\/|$)/);
    }
  });
  it('keine Hinweise auf Überraschung/Geschenk', () => {
    expect(JSON.stringify(seed)).not.toMatch(/überrasch|geschenk|geburtstag/i);
  });
});
