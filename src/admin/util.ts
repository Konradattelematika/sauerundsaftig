/** Kleine, framework-freie Helfer des Admin-Dashboards (rein, ohne DOM — testbar). */

export type PathSeg = string | number;

export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}

export function getAt(root: unknown, path: PathSeg[]): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg as string];
  }
  return cur;
}

/** Pfad aus Server-/Validator-Meldungen normalisieren: 'pages[3].sections.2' / 'pages/start/…' → Segmente */
export function parsePath(path: string | PathSeg[]): PathSeg[] {
  if (Array.isArray(path)) return path;
  return String(path)
    .replace(/\[(\w+|"[^"]*"|'[^']*')\]/g, '.$1')
    .split(/[./]/)
    .filter(Boolean)
    .map((s) => s.replace(/^["']|["']$/g, ''))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/**
 * Pfad mit IDs (z. B. pages.start.sections.hero.fields.title) in Index-Pfad umwandeln
 * (pages.0.sections.1.fields.title). Unbekannte Segmente bleiben stehen.
 */
export function canonicalPath(root: unknown, path: string | PathSeg[]): string {
  const segs = parsePath(path);
  const out: PathSeg[] = [];
  let cur: unknown = root;
  for (const seg of segs) {
    if (Array.isArray(cur) && typeof seg === 'string') {
      const idx = cur.findIndex((x) => x && typeof x === 'object' && ((x as { id?: unknown }).id === seg || (x as { slug?: unknown }).slug === seg));
      if (idx >= 0) {
        out.push(idx);
        cur = cur[idx];
        continue;
      }
    }
    out.push(seg);
    cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[seg as string] : undefined;
  }
  return out.join('.');
}

const UMLAUT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

/** „Über uns & Team“ → „ueber-uns-team“ */
export function slugify(text: string, max = 60): string {
  return String(text ?? '')
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUT[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** eindeutige ID im Geltungsbereich (base, base-2, base-3 …) */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const b = slugify(base, 50) || 'eintrag';
  if (!set.has(b)) return b;
  for (let i = 2; ; i++) if (!set.has(`${b}-${i}`)) return `${b}-${i}`;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { cancel(): void; flush(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  let last: A | undefined;
  const d = (...a: A) => {
    last = a;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...a);
    }, ms);
  };
  d.cancel = () => {
    if (t) clearTimeout(t);
    t = undefined;
  };
  d.flush = () => {
    if (t && last) {
      clearTimeout(t);
      t = undefined;
      fn(...last);
    }
  };
  return d;
}

const TZ = 'Europe/Berlin';
const fmtDateTime = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
const fmtDate = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, dateStyle: 'medium' });
const fmtTime = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** Zeitpunkt (ISO) in Berliner Zeit, z. B. „8. Okt. 2026, 14:05“ */
export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : fmtDateTime.format(d);
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '–';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? String(iso) : fmtDate.format(d);
}

export function formatTime(iso: string | number | Date): string {
  return fmtTime.format(new Date(iso));
}

/** „vor 3 Minuten“ (grob, für Status-Anzeigen) */
export function relativeTime(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Minute${m === 1 ? '' : 'n'}`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `vor ${hr} Stunde${hr === 1 ? '' : 'n'}`;
  return formatDateTime(iso);
}

/** Zahl deutsch formatieren (Komma) bzw. aus deutscher Eingabe lesen */
export function formatNumber(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}

export function parseNumber(s: string): number | undefined {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Text kürzen (für Listen-Beschriftungen) */
export function truncate(s: string, max = 60): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Beschriftung eines Listeneintrags aus seinem itemLabel-Wert: Text direkt, Link-Objekt → label,
 * Bild-Verweis → Medien-ID (z. B. itemLabel: 'link' bei Button-Listen).
 */
export function labelOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.label === 'string') return o.label.trim();
    if (typeof o.title === 'string') return o.title.trim();
    if (typeof o.media === 'string') return o.media;
  }
  return '';
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Array-Element verschieben (in place) */
export function moveItem<T>(arr: T[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}
