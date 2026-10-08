/**
 * Client-Logik des Modul-Boards (Übersicht + Detail). Kein Framework, keine Abhängigkeiten.
 *
 * - GET /api/me (401 → /login?next=…), GET /api/module/state
 * - PUT /api/module/votes { itemId, optionId, rating, comment } — Upsert je User/Element/Option
 * - PUT /api/module/choices { itemId, optionId | null } — genau eine Entscheidung je User/Element
 * - optimistisch mit Rücknahme bei Fehler + Toast (aria-live), Polling alle 30 s und bei Fokus;
 *   laufende Eingaben (fokussierte oder ungespeicherte Kommentare) werden nie überschrieben.
 * - Vorschau-Fenster: Seite in fester Breite (Desktop 1280 px / Handy 390 px) gerendert und per
 *   transform auf die Containerbreite skaliert.
 */
import type { BoardItemData, BoardUser, Choice, Rating, Vote } from './types';

type State = { votes: Vote[]; choices: Choice[] };
type IndexData = { items: BoardItemData[] };
type ItemData = { item: BoardItemData; prev?: { id: string; title: string }; next?: { id: string; title: string } };

const PV_SIZES = { desktop: { w: 1280, h: 800 }, phone: { w: 390, h: 780 } } as const;
type PvMode = keyof typeof PV_SIZES;
const PV_STORAGE_KEY = 'sus-board-pv-mode';
const POLL_MS = 30_000;

let me: BoardUser | null = null;
let state: State = { votes: [], choices: [] };
let toastTimer = 0;
let stateRevision = 0;
let refreshSequence = 0;
let mutationsInFlight = 0;
const savingVotes = new Set<string>();
const savingChoices = new Set<string>();

/* ---------- Hilfen ---------- */

function $<T extends Element>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}
function $$<T extends Element>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

let redirecting = false;

function redirectToLogin(): void {
  redirecting = true;
  location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    ...init,
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error('Nicht angemeldet');
  }
  if (!res.ok) throw new Error(`Server antwortet mit ${res.status}`);
  return (await res.json()) as T;
}

function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const el = $<HTMLElement>('[data-board-toast]');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('board-toast--error', kind === 'error');
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), kind === 'error' ? 6000 : 3500);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const RATING_LABEL: Record<Rating, string> = { nein: 'Nein', gut: 'Gut', super: 'Super gut' };

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- State-Abfragen ---------- */

function myVote(itemId: string, optionId: string): Vote | undefined {
  return state.votes.find((v) => v.itemId === itemId && v.optionId === optionId && v.userId === me?.id);
}
function myChoice(itemId: string): Choice | undefined {
  return state.choices.find((c) => c.itemId === itemId && c.userId === me?.id);
}
function othersVotes(itemId: string, optionId: string): Vote[] {
  return state.votes.filter(
    (v) => v.itemId === itemId && v.optionId === optionId && v.userId !== me?.id && (v.rating || v.comment.trim()),
  );
}
function othersChoices(itemId: string): Choice[] {
  return state.choices.filter((c) => c.itemId === itemId && c.userId !== me?.id);
}

function upsertVote(vote: Vote): void {
  const i = state.votes.findIndex((v) => v.itemId === vote.itemId && v.optionId === vote.optionId && v.userId === vote.userId);
  if (i >= 0) state.votes[i] = vote;
  else state.votes.push(vote);
}
function setChoice(itemId: string, optionId: string | null): void {
  state.choices = state.choices.filter((c) => !(c.itemId === itemId && c.userId === me?.id));
  if (optionId && me) {
    state.choices.push({ itemId, optionId, userId: me.id, userName: me.name, updatedAt: new Date().toISOString() });
  }
}

function voteKey(itemId: string, optionId: string): string {
  return `${itemId}:${optionId}`;
}

/* ---------- Vorschau-Fenster ---------- */

function fitPreview(box: HTMLElement): void {
  const mode: PvMode = box.dataset.pvMode === 'phone' ? 'phone' : 'desktop';
  const iframe = $<HTMLIFrameElement>('iframe', box);
  if (!iframe) return;
  const { w } = PV_SIZES[mode];
  const h = Number(box.dataset.pvH) || PV_SIZES[mode].h;
  const avail = box.clientWidth;
  if (!avail) return;
  const scale = Math.min(1, avail / w);
  iframe.style.width = `${w}px`;
  iframe.style.height = `${h}px`;
  iframe.style.transform = `scale(${scale})`;
  iframe.style.left = `${Math.max(0, Math.round((avail - w * scale) / 2))}px`;
  box.style.height = `${Math.round(h * scale)}px`;
}

function initPreviews(): void {
  const boxes = $$<HTMLElement>('[data-pv]');
  if (boxes.length === 0) return;
  // Startmodus: zuletzt gewählt, sonst Handy auf schmalen Bildschirmen
  const saved = localStorage.getItem(PV_STORAGE_KEY);
  const initial: PvMode = saved === 'phone' || saved === 'desktop' ? saved : window.matchMedia('(min-width: 768px)').matches ? 'desktop' : 'phone';
  for (const box of boxes) {
    if (!box.hasAttribute('data-pv-static')) box.dataset.pvMode = initial;
    fitPreview(box);
  }
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) fitPreview(entry.target as HTMLElement);
  });
  boxes.forEach((b) => ro.observe(b));

  // Umschalter je Option (Desktop/Handy) — der gewählte Modus gilt beim nächsten Laden für alle
  for (const btn of $$<HTMLButtonElement>('[data-pv-set]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.pvSet === initial));
    btn.addEventListener('click', () => {
      const mode: PvMode = btn.dataset.pvSet === 'phone' ? 'phone' : 'desktop';
      const option = btn.closest<HTMLElement>('[data-option]');
      const box = option ? $<HTMLElement>('[data-pv]', option) : null;
      if (!box) return;
      box.dataset.pvMode = mode;
      fitPreview(box);
      for (const b of $$<HTMLButtonElement>('[data-pv-set]', option ?? document)) {
        b.setAttribute('aria-pressed', String(b.dataset.pvSet === mode));
      }
      localStorage.setItem(PV_STORAGE_KEY, mode);
    });
  }
}

/* ---------- Übersicht ---------- */

function renderIndex(data: IndexData): void {
  const decided = data.items.filter((it) => myChoice(it.id)).length;
  const total = data.items.length;
  const text = $<HTMLElement>('[data-progress-text]');
  if (text) text.textContent = `${decided} von ${total} entschieden`;
  const bar = $<HTMLElement>('[data-progress-bar]');
  if (bar) bar.style.width = `${total ? Math.round((decided / total) * 100) : 0}%`;
  const hint = $<HTMLElement>('[data-progress-hint]');
  if (hint) {
    hint.textContent =
      decided === 0
        ? 'Fang einfach oben an — jede Entscheidung lässt sich später wieder ändern.'
        : decided === total
          ? 'Alles entschieden. Danke! Du kannst jederzeit noch etwas umentscheiden.'
          : `Noch ${total - decided} offen. Du kannst jederzeit weitermachen.`;
  }

  for (const item of data.items) {
    const card = $<HTMLElement>(`[data-item-card="${item.id}"]`);
    if (!card) continue;
    const choice = myChoice(item.id);
    const status = $<HTMLElement>('[data-item-status]', card);
    if (status) {
      status.textContent = '';
      if (choice) {
        const title = item.options.find((o) => o.id === choice.optionId)?.title ?? choice.optionId;
        status.append(el('span', 'board-chip board-chip--chosen', `Deine Wahl: ${title}`));
      } else {
        status.append(el('span', 'board-chip', 'Noch offen'));
      }
    }
    card.classList.toggle('is-decided', Boolean(choice));

    const chips = $<HTMLElement>('[data-item-chips]', card);
    if (chips) {
      chips.textContent = '';
      // Andere: je User ein Chip mit Initialen — ✓ entschieden, sonst beste Bewertung
      const byUser = new Map<string, { name: string; chosen?: string; best?: Rating }>();
      for (const c of othersChoices(item.id)) {
        byUser.set(c.userId, { ...(byUser.get(c.userId) ?? { name: c.userName }), chosen: c.optionId });
      }
      for (const v of state.votes) {
        if (v.itemId !== item.id || v.userId === me?.id || !v.rating) continue;
        const cur = byUser.get(v.userId) ?? { name: v.userName };
        const rank: Record<Rating, number> = { nein: 0, gut: 1, super: 2 };
        if (!cur.best || rank[v.rating] > rank[cur.best]) cur.best = v.rating;
        byUser.set(v.userId, cur);
      }
      for (const [, u] of byUser) {
        const chosenTitle = u.chosen ? (item.options.find((o) => o.id === u.chosen)?.title ?? u.chosen) : undefined;
        const chip = el('li', `board-chip board-chip--initials${u.chosen ? ' board-chip--chosen' : ''}`);
        chip.textContent = initials(u.name) + (u.chosen ? ' ✓' : u.best ? ' ★' : '');
        chip.title = u.chosen ? `${u.name}: ${chosenTitle}` : `${u.name} hat bewertet`;
        chip.setAttribute('aria-label', chip.title);
        chips.append(chip);
      }
    }
  }
}

/* ---------- Detail ---------- */

function renderItem(data: ItemData): void {
  const { item } = data;
  const choice = myChoice(item.id);

  const line = $<HTMLElement>('[data-item-choice]');
  if (line) {
    const title = choice ? (item.options.find((o) => o.id === choice.optionId)?.title ?? choice.optionId) : null;
    line.textContent = title ? `Deine Entscheidung: ${title}` : 'Du hast dich hier noch nicht entschieden.';
    line.classList.toggle('board-status--ok', Boolean(title));
  }

  for (const option of item.options) {
    const root = $<HTMLElement>(`[data-option="${option.id}"]`);
    if (!root) continue;
    const vote = myVote(item.id, option.id);
    const voteSaving = savingVotes.has(voteKey(item.id, option.id));
    const choiceSaving = savingChoices.has(item.id);

    for (const btn of $$<HTMLButtonElement>('[data-rate]', root)) {
      btn.setAttribute('aria-pressed', String(Boolean(vote?.rating) && btn.dataset.rate === vote?.rating));
      btn.disabled = voteSaving;
    }
    root.classList.toggle('is-rejected', vote?.rating === 'nein');

    const ta = $<HTMLTextAreaElement>('[data-comment]', root);
    if (ta && document.activeElement !== ta && ta.dataset.dirty !== '1') {
      ta.value = vote?.comment ?? '';
    }

    const chooseBtn = $<HTMLButtonElement>('[data-choose]', root);
    const chosen = choice?.optionId === option.id;
    if (chooseBtn) {
      chooseBtn.disabled = choiceSaving;
      chooseBtn.setAttribute('aria-pressed', String(chosen));
      chooseBtn.textContent = chosen ? 'Deine Wahl ✓' : 'Das nehme ich';
      chooseBtn.title = chosen ? 'Nochmal tippen nimmt die Entscheidung zurück' : '';
    }
    root.classList.toggle('is-chosen', chosen);

    const commentSave = $<HTMLButtonElement>('[data-comment-save]', root);
    if (commentSave) commentSave.disabled = voteSaving;

    const others = $<HTMLElement>('[data-others]', root);
    if (others) {
      others.textContent = '';
      const votes = othersVotes(item.id, option.id);
      const chosenBy = othersChoices(item.id).filter((c) => c.optionId === option.id);
      if (votes.length === 0 && chosenBy.length === 0) {
        others.append(el('p', 'board-status', 'Noch keine Stimmen von anderen.'));
      } else {
        const list = el('ul', 'board-votes');
        for (const c of chosenBy) {
          const li = el('li', 'board-vote');
          li.append(el('strong', '', c.userName));
          li.append(el('span', 'board-chip board-chip--chosen', 'hat sich hierfür entschieden'));
          li.append(timeEl(c.updatedAt));
          list.append(li);
        }
        for (const v of votes) {
          const li = el('li', 'board-vote');
          li.append(el('strong', '', v.userName));
          if (v.rating) li.append(el('span', `board-chip board-chip--${v.rating}`, RATING_LABEL[v.rating]));
          li.append(timeEl(v.updatedAt));
          if (v.comment.trim()) li.append(el('q', '', v.comment.trim()));
          list.append(li);
        }
        others.append(list);
      }
    }
  }
}

function timeEl(iso: string): HTMLTimeElement {
  const t = el('time', '', formatTime(iso));
  t.dateTime = iso;
  return t;
}

function bindItem(data: ItemData): void {
  const { item } = data;

  for (const option of item.options) {
    const root = $<HTMLElement>(`[data-option="${option.id}"]`);
    if (!root) continue;
    const ta = $<HTMLTextAreaElement>('[data-comment]', root);
    const statusEl = $<HTMLElement>('[data-comment-status]', root);

    // Bewertung: Toggle — nochmal tippen nimmt zurück
    for (const btn of $$<HTMLButtonElement>('[data-rate]', root)) {
      btn.addEventListener('click', () => {
        const rating = btn.dataset.rate as Rating;
        const prev = myVote(item.id, option.id);
        const next: Rating | null = prev?.rating === rating ? null : rating;
        void saveVote(item.id, option.id, next, ta?.value ?? prev?.comment ?? '', data, prev, statusEl ?? undefined, ta ?? undefined);
      });
    }

    // Kommentar: speichert per Button oder Strg/Cmd+Enter (nur wenn geändert)
    if (ta) {
      ta.addEventListener('input', () => {
        const saved = myVote(item.id, option.id)?.comment ?? '';
        ta.dataset.dirty = ta.value !== saved ? '1' : '0';
        if (statusEl && ta.dataset.dirty === '1') {
          statusEl.textContent = 'Noch nicht gespeichert';
          statusEl.classList.remove('board-status--ok');
        }
      });
      const save = () => {
        const prev = myVote(item.id, option.id);
        if (ta.value === (prev?.comment ?? '')) {
          ta.dataset.dirty = '0';
          return;
        }
        void saveVote(item.id, option.id, prev?.rating ?? null, ta.value, data, prev, statusEl ?? undefined, ta);
      };
      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          save();
        }
      });
      $<HTMLButtonElement>('[data-comment-save]', root)?.addEventListener('click', save);
    }

    // Entscheidung: genau eine je Element; nochmal tippen nimmt zurück
    $<HTMLButtonElement>('[data-choose]', root)?.addEventListener('click', () => {
      const prev = myChoice(item.id);
      const next = prev?.optionId === option.id ? null : option.id;
      void saveChoice(item.id, next, data, prev);
    });
  }
}

async function saveVote(
  itemId: string,
  optionId: string,
  rating: Rating | null,
  comment: string,
  data: ItemData,
  prev: Vote | undefined,
  statusEl?: HTMLElement,
  ta?: HTMLTextAreaElement,
): Promise<void> {
  if (!me) return;
  const key = voteKey(itemId, optionId);
  if (savingVotes.has(key)) return;
  savingVotes.add(key);
  mutationsInFlight += 1;
  stateRevision += 1;
  const optimistic: Vote = { itemId, optionId, userId: me.id, userName: me.name, rating, comment, updatedAt: new Date().toISOString() };
  upsertVote(optimistic);
  if (ta) ta.dataset.dirty = '0';
  renderItem(data);
  if (statusEl) {
    statusEl.textContent = 'Speichert …';
    statusEl.classList.remove('board-status--ok');
  }
  try {
    const saved = await api<Vote>('/api/module/votes', { method: 'PUT', body: JSON.stringify({ itemId, optionId, rating, comment }) });
    upsertVote({ ...optimistic, ...saved });
    if (statusEl) {
      if (ta?.dataset.dirty === '1') {
        statusEl.textContent = 'Noch nicht gespeichert';
        statusEl.classList.remove('board-status--ok');
      } else {
        statusEl.textContent = 'Gespeichert ✓';
        statusEl.classList.add('board-status--ok');
      }
    }
  } catch (err) {
    // Rücknahme
    if (prev) upsertVote(prev);
    else state.votes = state.votes.filter((v) => !(v.itemId === itemId && v.optionId === optionId && v.userId === me?.id));
    if (ta) {
      ta.dataset.dirty = '1';
    }
    if (statusEl) statusEl.textContent = 'Nicht gespeichert';
    renderItem(data);
    toast(`Konnte nicht speichern (${(err as Error).message}). Bitte nochmal versuchen.`, 'error');
  } finally {
    savingVotes.delete(key);
    mutationsInFlight -= 1;
    renderItem(data);
  }
}

async function saveChoice(itemId: string, optionId: string | null, data: ItemData, prev: Choice | undefined): Promise<void> {
  if (!me) return;
  if (savingChoices.has(itemId)) return;
  savingChoices.add(itemId);
  mutationsInFlight += 1;
  stateRevision += 1;
  setChoice(itemId, optionId);
  renderItem(data);
  try {
    await api<Choice | { removed: true }>('/api/module/choices', { method: 'PUT', body: JSON.stringify({ itemId, optionId }) });
    if (optionId) {
      const title = data.item.options.find((o) => o.id === optionId)?.title ?? optionId;
      toast(`Entschieden: ${title}`);
    } else {
      toast('Entscheidung zurückgenommen.');
    }
  } catch (err) {
    setChoice(itemId, prev?.optionId ?? null);
    renderItem(data);
    toast(`Entscheidung konnte nicht gespeichert werden (${(err as Error).message}).`, 'error');
  } finally {
    savingChoices.delete(itemId);
    mutationsInFlight -= 1;
    renderItem(data);
  }
}

/* ---------- Laden & Polling ---------- */

async function refresh(render: () => void): Promise<void> {
  if (mutationsInFlight > 0) return;
  const revision = stateRevision;
  const sequence = ++refreshSequence;
  try {
    const fresh = await api<State>('/api/module/state');
    if (sequence !== refreshSequence || revision !== stateRevision || mutationsInFlight > 0) return;
    state = fresh;
    render();
  } catch {
    /* Netzfehler beim Polling still ignorieren — nächster Versuch kommt */
  }
}

export async function initBoard(): Promise<void> {
  const page = document.body.dataset.boardPage;
  const raw = document.getElementById('sus-board-data')?.textContent ?? 'null';
  const data = JSON.parse(raw) as IndexData | ItemData | null;

  initPreviews();

  try {
    const res = await api<{ user: BoardUser }>('/api/me');
    me = res.user;
  } catch {
    // 401 → Redirect läuft bereits; andere Fehler: Board bleibt lesbar, aber ohne Stimmen —
    // dann sichtbar sagen, warum Bewerten gerade nicht geht (sonst passiert beim Tippen einfach nichts).
    if (!redirecting) toast('Keine Verbindung zum Server — Bewerten geht gerade nicht. Bitte lade die Seite neu.', 'error');
    return;
  }
  const userEl = $<HTMLElement>('[data-board-user]');
  if (userEl) userEl.textContent = me.name;

  let render: () => void = () => {};
  if (page === 'index' && data && 'items' in data) {
    render = () => renderIndex(data);
  } else if (page === 'item' && data && 'item' in data) {
    render = () => renderItem(data);
    bindItem(data);
  }

  await refresh(render);

  window.setInterval(() => void refresh(render), POLL_MS);
  window.addEventListener('focus', () => void refresh(render));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh(render);
  });
}
