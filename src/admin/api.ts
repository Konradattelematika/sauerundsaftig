/** JSON-Schicht für /api/cms/* (Vertrag: docs/CMS-PLAN.md §7.3). 401 → Login mit Rücksprung. */
import type { MediaItem, SiteDoc } from '../cms/types';

export interface Build {
  id: string;
  kind: 'live' | 'preview';
  state: 'queued' | 'running' | 'ok' | 'failed';
  revision: number;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  logTail?: string;
  requestedBy?: string;
  reason?: string;
}

/** Gerade ausgelieferter Build (live) bzw. aktueller Vorschau-Build */
export interface OnlineBuild {
  id: string;
  revision: number;
  builtAt?: string;
  codeVersion?: string;
  /** true = noch das dist/ aus dem Deploy (das CMS hat noch nicht selbst gebaut) */
  image?: boolean;
}

export interface Me {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface DocMeta {
  revision?: number;
  updatedAt?: string;
  updatedBy?: string;
  publishedAt?: string;
  publishedBy?: string;
  [k: string]: unknown;
}

export interface CmsState {
  draft: SiteDoc;
  draftMeta: DocMeta;
  publishedMeta: DocMeta | null;
  dirty: boolean;
  live: Build | null;
  preview: Build | null;
  online?: OnlineBuild | null;
  previewOnline?: OnlineBuild | null;
  /** strenge Prüfung des gespeicherten Entwurfs */
  issues?: { errors?: { path: string; message: string }[]; warnings?: { path: string; message: string }[] };
  me: Me;
  codeVersion?: string;
  /** Inhalte schreibgeschützt (z. B. nach einem Code-Rollback) — Grund als Text */
  readOnly?: string | false | null;
}

export interface PublishResult {
  build: Build;
  revision?: number;
  draftRevision?: number;
  changed?: boolean;
  redirects?: { from: string; to: string }[];
  version?: VersionInfo | null;
}

export interface ValidationIssue {
  path: string;
  message: string;
  level?: 'error' | 'warning';
}

export interface VersionInfo {
  id: string;
  revision: number;
  publishedAt?: string;
  publishedBy?: string;
}

export interface CmsUser {
  id: string;
  name: string;
  role: string;
  /** env = Server-Konfiguration (SUS_USERS: nur Passwort änderbar), dashboard = hier angelegt */
  source?: 'env' | 'dashboard' | string;
  editable?: boolean;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let redirecting = false;
export function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
}

async function request<T>(method: string, path: string, body?: unknown, extra: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...((extra.headers as Record<string, string>) ?? {}) };
  let payload: BodyInit | undefined;
  if (body instanceof Blob) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...extra, method, headers, credentials: 'same-origin', cache: 'no-store', body: payload });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server.');
  }
  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'Nicht angemeldet');
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const msg =
      typeof obj.error === 'string' ? obj.error : typeof obj.message === 'string' ? obj.message : res.status === 403 ? 'Dafür fehlt dir die Berechtigung.' : `Serverfehler (HTTP ${res.status})`;
    throw new ApiError(res.status, msg, obj);
  }
  return data as T;
}

const unwrap = <T>(res: unknown, key: string): T =>
  res && typeof res === 'object' && key in (res as object) && !Array.isArray(res) ? ((res as Record<string, T>)[key] as T) : (res as T);

export const api = {
  state: () => request<CmsState>('GET', '/api/cms/state'),
  saveDraft: (doc: SiteDoc, baseRevision: number) =>
    request<{ revision: number; updatedAt?: string }>('PUT', '/api/cms/draft', { doc, baseRevision }),
  discard: () => request<{ revision?: number }>('POST', '/api/cms/draft/discard', {}),
  preview: () => request<{ build: Build }>('POST', '/api/cms/preview', {}),
  publish: (revision: number) => request<PublishResult>('POST', '/api/cms/publish', { revision }),
  build: () => request<{ live: Build | null; preview: Build | null; online?: OnlineBuild | null; previewOnline?: OnlineBuild | null }>('GET', '/api/cms/build'),
  versions: async () => unwrap<VersionInfo[]>(await request('GET', '/api/cms/versions'), 'versions') ?? [],
  restore: (id: string) => request<{ revision: number }>('POST', `/api/cms/versions/${encodeURIComponent(id)}/restore`, {}),
  /** veröffentlichter Inhaltsstand (für die Änderungsübersicht; s. Bitte an den Orchestrator) */
  published: async (): Promise<SiteDoc | null> => {
    try {
      const r = await request<unknown>('GET', '/api/cms/published');
      const doc = unwrap<SiteDoc>(r, 'doc');
      return doc && typeof doc === 'object' && Array.isArray((doc as SiteDoc).pages) ? doc : null;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null;
      throw e;
    }
  },
  uploadMedia: async (file: File, opts: { alt?: string; replace?: string } = {}) => {
    const q = opts.replace ? `?replace=${encodeURIComponent(opts.replace)}` : '';
    const headers: Record<string, string> = {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name),
    };
    if (opts.alt) headers['X-Alt'] = encodeURIComponent(opts.alt);
    return unwrap<MediaItem>(await request('POST', `/api/cms/media${q}`, file, { headers }), 'media');
  },
  deleteMedia: (id: string) => request<unknown>('DELETE', `/api/cms/media/${encodeURIComponent(id)}`),
  users: async () => unwrap<CmsUser[]>(await request('GET', '/api/cms/users'), 'users') ?? [],
  createUser: async (u: { id: string; name: string; role: string; password: string }) =>
    unwrap<CmsUser>(await request('POST', '/api/cms/users', u), 'user'),
  patchUser: async (id: string, patch: Record<string, unknown>) =>
    unwrap<CmsUser>(await request('PATCH', `/api/cms/users/${encodeURIComponent(id)}`, patch), 'user'),
  deleteUser: (id: string) => request<unknown>('DELETE', `/api/cms/users/${encodeURIComponent(id)}`),
};

/** Bild-URL für Vorschauen im Admin (auch builtin/placeholder) */
export function mediaUrl(id: string, w = 320, v?: string | number): string {
  return `/api/cms/media/${encodeURIComponent(id)}/file?w=${w}${v ? `&v=${encodeURIComponent(String(v))}` : ''}`;
}

/** Vorschau-Modus setzen und eine Seite öffnen (Server: /admin/vorschau) */
export function previewUrl(path: string, editor = false): string {
  const next = editor ? editorUrl(path) : path;
  return `/admin/vorschau?an=1&next=${encodeURIComponent(next)}`;
}

/** Seite im Editor-Modus (ohne Vorschau-Leiste, mit Editor-Brücke) */
export function editorUrl(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}__cms=editor`;
}

/** Vorschau-Cookie setzen (Server: /admin/vorschau?an=1 → Weiterleitung auf eine winzige Datei) */
export async function ensurePreviewCookie(): Promise<void> {
  try {
    const res = await fetch(`/admin/vorschau?an=1&next=${encodeURIComponent('/brand/favicon-16.png')}`, { credentials: 'same-origin', cache: 'no-store' });
    await res.arrayBuffer(); // Antwort abholen, sonst bleibt die Verbindung offen
  } catch {
    /* ohne Cookie zeigt das iframe den Live-Stand */
  }
}
