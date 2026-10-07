/** Schlanke JSON-Schicht für /api/* (Vertrag: docs/LIVE-PLAN.md §2.5). 401 → Login mit Rücksprung. */
import type { ChecklistData, Comment, CommentKind, Item, NewItemInput, User } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let redirecting = false;

export function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'Nicht angemeldet');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j.error === 'string') msg = j.error;
    } catch {
      /* keine JSON-Fehlermeldung */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

/** Toleriert sowohl `Item` als auch `{ item: Item }` als Antwort. */
function unwrap<T>(res: unknown, key: string): T {
  if (res && typeof res === 'object' && key in res) return (res as Record<string, T>)[key];
  return res as T;
}

export async function getMe(): Promise<User> {
  return unwrap<User>(await request('GET', '/api/me'), 'user');
}

export async function getChecklist(): Promise<ChecklistData> {
  const d = await request<Partial<ChecklistData>>('GET', '/api/checklist');
  return { items: Array.isArray(d.items) ? d.items : [], comments: Array.isArray(d.comments) ? d.comments : [] };
}

/** Go-Live-Zeitpunkt vom Server (ohne Auth). Fehler → null, dann gilt der Build-Wert. */
export async function getGoLive(): Promise<string | null> {
  try {
    const res = await fetch('/api/golive', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const j = (await res.json()) as { goLiveAt?: unknown };
    return typeof j.goLiveAt === 'string' ? j.goLiveAt : null;
  } catch {
    return null;
  }
}

export async function createItem(input: NewItemInput): Promise<Item> {
  return unwrap<Item>(await request('POST', '/api/checklist/items', input), 'item');
}

export async function patchItem(id: string, patch: Partial<Item>): Promise<Item> {
  return unwrap<Item>(await request('PATCH', `/api/checklist/items/${encodeURIComponent(id)}`, patch), 'item');
}

export async function createComment(itemId: string, text: string, kind: CommentKind): Promise<Comment> {
  return unwrap<Comment>(
    await request('POST', `/api/checklist/items/${encodeURIComponent(itemId)}/comments`, { text, kind }),
    'comment',
  );
}

export async function patchComment(id: string, resolved: boolean): Promise<Comment> {
  return unwrap<Comment>(
    await request('PATCH', `/api/checklist/comments/${encodeURIComponent(id)}`, { resolved }),
    'comment',
  );
}
