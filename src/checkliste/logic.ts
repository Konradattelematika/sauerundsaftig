/**
 * Reine Logik der Checkliste (ohne DOM): Filter, Gruppierung, Fortschritt, Zeitformate, Link-Erkennung.
 * Getestet in logic.test.ts.
 */
import type {
  Comment,
  Filters,
  FuerFilter,
  Item,
  Owner,
  Phase,
  PhaseFilter,
  Priority,
  Role,
  Status,
  StatusFilter,
} from './types';

export const DEFAULT_GO_LIVE = '2026-10-19T16:00:00+02:00';
const TZ = 'Europe/Berlin';

// ---------- Beschriftungen ----------

export const PHASE_LABEL: Record<Phase, string> = { vor: 'Vor Go-Live', nach: 'Nach Go-Live' };
export const OWNER_LABEL: Record<Owner, string> = { team: 'Team', josie: 'Josie', beide: 'Beide' };
export const STATUS_LABEL: Record<Status, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
  verworfen: 'Verworfen',
};
export const PRIORITY_LABEL: Record<Priority, string> = { blocker: 'Blocker', wichtig: 'Wichtig', normal: 'Normal' };
export const ROLE_LABEL: Record<Role, string> = { team: 'Team', inhaberin: 'Inhaberin' };

const PRIORITY_RANK: Record<Priority, number> = { blocker: 0, wichtig: 1, normal: 2 };
const PHASES: Phase[] = ['vor', 'nach'];

// ---------- Filter ----------

const FUER_VALUES: FuerFilter[] = ['alle', 'team', 'josie'];
const PHASE_VALUES: PhaseFilter[] = ['vor', 'nach', 'alle'];
const STATUS_VALUES: StatusFilter[] = ['offen', 'erledigt', 'alle'];

/** Standard-Ansicht je Rolle: Josie sieht ihre offenen Punkte, das Team alle offenen. */
export function defaultFilters(role: Role): Filters {
  return { fuer: role === 'inhaberin' ? 'josie' : 'alle', phase: 'alle', status: 'offen' };
}

function pick<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return value !== null && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/** Liest ?fuer=&phase=&status= — unbekannte Werte fallen auf den Rollen-Standard zurück. */
export function parseFilters(search: string, role: Role): Filters {
  const params = new URLSearchParams(search);
  const def = defaultFilters(role);
  return {
    fuer: pick(params.get('fuer'), FUER_VALUES, def.fuer),
    phase: pick(params.get('phase'), PHASE_VALUES, def.phase),
    status: pick(params.get('status'), STATUS_VALUES, def.status),
  };
}

export function filtersToSearch(f: Filters): string {
  return `?${new URLSearchParams({ fuer: f.fuer, phase: f.phase, status: f.status }).toString()}`;
}

export function isOpenStatus(s: Status): boolean {
  return s === 'offen' || s === 'in_arbeit';
}

/**
 * Passt ein Punkt zu den Filtern? „Josie" umfasst auch Punkte für beide, „Team" ebenso.
 * Status „Erledigt" zeigt erledigte und verworfene Punkte (beides ist abgeschlossen).
 */
export function matchesFilters(item: Item, f: Filters): boolean {
  if (f.fuer === 'team' && item.owner === 'josie') return false;
  if (f.fuer === 'josie' && item.owner === 'team') return false;
  if (f.phase !== 'alle' && item.phase !== f.phase) return false;
  if (f.status === 'offen' && !isOpenStatus(item.status)) return false;
  if (f.status === 'erledigt' && isOpenStatus(item.status)) return false;
  return true;
}

export interface CategoryGroup {
  category: string;
  items: Item[];
}
export interface PhaseGroup {
  phase: Phase;
  categories: CategoryGroup[];
  count: number;
}

/**
 * Gruppiert nach Phase (vor → nach), dann Kategorie (Reihenfolge des ersten Auftretens in `items`).
 * Innerhalb einer Kategorie: Blocker → Wichtig → Normal, sonst stabile Reihenfolge.
 * `keep` sind Punkte, die trotz Filter sichtbar bleiben (gerade geändert/angelegt — damit nichts wegspringt).
 */
export function groupItems(items: Item[], f: Filters, keep: ReadonlySet<string> = new Set()): PhaseGroup[] {
  const order = new Map(items.map((it, i) => [it.id, i]));
  const categoryOrder: string[] = [];
  for (const it of items) if (!categoryOrder.includes(it.category)) categoryOrder.push(it.category);

  const visible = items.filter((it) => keep.has(it.id) || matchesFilters(it, f));
  const groups: PhaseGroup[] = [];
  for (const phase of PHASES) {
    const inPhase = visible.filter((it) => it.phase === phase);
    if (!inPhase.length) continue;
    const categories: CategoryGroup[] = [];
    for (const category of categoryOrder) {
      const list = inPhase
        .filter((it) => it.category === category)
        .sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
        );
      if (list.length) categories.push({ category, items: list });
    }
    groups.push({ phase, categories, count: inPhase.length });
  }
  return groups;
}

export interface Progress {
  vor: { done: number; total: number };
  nach: { done: number; total: number };
  openBlockers: number;
}

/** Fortschritt über alle Punkte (verworfene zählen nicht mit). */
export function progress(items: Item[]): Progress {
  const p: Progress = { vor: { done: 0, total: 0 }, nach: { done: 0, total: 0 }, openBlockers: 0 };
  for (const it of items) {
    if (it.status === 'verworfen') continue;
    p[it.phase].total++;
    if (it.status === 'erledigt') p[it.phase].done++;
    if (it.priority === 'blocker' && isOpenStatus(it.status)) p.openBlockers++;
  }
  return p;
}

/** Offen = Feedback/Frage, das noch nicht als eingebaut markiert ist (Antworten zählen nicht). */
export function isOpenComment(c: Comment): boolean {
  return !c.resolved && c.kind !== 'antwort';
}

export function sortComments(list: Comment[]): Comment[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------- Zeit (Europe/Berlin) ----------

const partsFmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: TZ,
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function berlin(d: Date): Record<'weekday' | 'day' | 'month' | 'year' | 'hour' | 'minute', string> {
  const out = { weekday: '', day: '', month: '', year: '', hour: '', minute: '' };
  for (const p of partsFmt.formatToParts(d)) if (p.type in out) out[p.type as keyof typeof out] = p.value;
  return out;
}

/** „07.10., 14:32" — mit Jahr, wenn es nicht das aktuelle ist. */
export function formatShort(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = berlin(d);
  const sameYear = p.year === berlin(now).year;
  return `${p.day}.${p.month}.${sameYear ? '' : p.year}, ${p.hour}:${p.minute}`;
}

/** „19.10.2026, 16:00 Uhr" */
export function formatDateTime(iso: string): string {
  const p = berlin(new Date(iso));
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute} Uhr`;
}

/** „Montag, 19.10.2026 · 16:00 Uhr" */
export function formatGoLive(iso: string): string {
  const p = berlin(new Date(iso));
  return `${p.weekday}, ${p.day}.${p.month}.${p.year} · ${p.hour}:${p.minute} Uhr`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Countdown-Text bis zum Go-Live; `live` = Zeitpunkt erreicht. */
export function countdown(goLiveAt: string, now: Date = new Date()): { live: boolean; text: string } {
  const target = new Date(goLiveAt).getTime();
  const ms = target - now.getTime();
  if (ms <= 0) return { live: true, text: `Seit ${formatDateTime(goLiveAt)} live` };
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  let text: string;
  if (days >= 1) text = `Noch ${plural(days, 'Tag', 'Tage')}, ${plural(hours, 'Stunde', 'Stunden')}`;
  else if (hours >= 1) text = `Noch ${plural(hours, 'Stunde', 'Stunden')}, ${plural(minutes, 'Minute', 'Minuten')}`;
  else if (minutes >= 1) text = `Noch ${plural(minutes, 'Minute', 'Minuten')}`;
  else text = 'Gleich geht’s los';
  return { live: false, text };
}

/** Gültiger ISO-Zeitpunkt? */
export function isValidDate(iso: unknown): iso is string {
  return typeof iso === 'string' && !Number.isNaN(new Date(iso).getTime());
}

// ---------- Text ----------

export type Segment = { type: 'text'; value: string } | { type: 'link'; href: string; label: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}»“”’]+$/;

/** Zerlegt Text in Text- und Link-Segmente (nur http/https). Ausgabe wird als Textknoten gesetzt → kein HTML. */
export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(TRAILING);
    if (trail) url = url.slice(0, -trail[0].length);
    const start = m.index ?? 0;
    if (start > last) out.push({ type: 'text', value: text.slice(last, start) });
    out.push({ type: 'link', href: url, label: url.replace(/^https?:\/\//i, '') });
    last = start + url.length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

/** Nur absolute http(s)-Links zulassen (kein javascript: o. Ä.). */
export function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** user-id → Anzeigename („konrad" → „Konrad"). */
export function displayUser(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
}
