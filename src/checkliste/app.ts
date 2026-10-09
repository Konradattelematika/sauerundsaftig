/**
 * Checklisten-App (Client). Lädt /api/me + /api/checklist, rendert Übersicht, Filter und Punkte,
 * schreibt optimistisch per POST/PATCH und pollt alle 30 s sowie bei Fenster-Fokus.
 * Offene Eingaben bleiben beim Neuzeichnen erhalten: Kommentar-Formulare sind je Punkt persistente
 * Knoten, Fokus und Cursor werden nach jedem Render wiederhergestellt.
 */
import * as api from './api';
import { h, icon, ICONS, richText, setChildren, type Child } from './dom';
import {
  countdown,
  defaultFilters,
  displayUser,
  filtersToSearch,
  formatGoLive,
  formatShort,
  groupItems,
  isOpenComment,
  isValidDate,
  OWNER_LABEL,
  parseFilters,
  PHASE_LABEL,
  progress,
  ROLE_LABEL,
  safeHref,
  sortComments,
  STATUS_LABEL,
} from './logic';
import type { Comment, CommentKind, Filters, Item, NewItemInput, Owner, Phase, Priority, Status, User } from './types';

const POLL_MS = 30_000;
const FOCUS_THROTTLE_MS = 5_000;

// ---------- Zustand ----------

let me: User;
let items: Item[] = [];
let comments: Comment[] = [];
let filters: Filters;
let goLiveAt = '';
/** Punkte, die trotz Filter sichtbar bleiben (gerade geändert/angelegt) — bis zum nächsten Filterwechsel. */
const keep = new Set<string>();
/** Vom Nutzer gesetzter Auf/Zu-Zustand des Kommentarbereichs. */
const commentsOpen = new Map<string, boolean>();
/** Persistente Kommentar-Formulare je Punkt (Entwürfe überleben jedes Neuzeichnen). */
const commentForms = new Map<string, HTMLFormElement>();
const cards = new Map<string, HTMLElement>();
const cardSig = new Map<string, string>();
let structureKey = '';
let inflight = 0;
let mutationSeq = 0;
let lastFetch = 0;
let offline = false;
let tmpCounter = 0;

// ---------- DOM-Anker ----------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const mainEl = $('cl-main');
const listEl = $('cl-list');
const countEl = $('cl-count');
const toastEl = $('cl-toast');
const srEl = $('cl-sr');
const filterForm = $<HTMLFormElement>('cl-filters');
const newForm = $<HTMLFormElement>('cl-new');
const newOpenBtn = $<HTMLButtonElement>('cl-new-open');

// ---------- Klassen (Variante A) ----------

const badgeBase = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em]';
const smallBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-card px-3 font-mono text-sm text-ink underline decoration-ink/30 ' +
  'underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:bg-bg-alt hover:decoration-ink';
const linkCls = 'text-ink underline decoration-ink/40 underline-offset-2 break-words hover:decoration-ink';

// ---------- Toast & Ansagen ----------

let toastTimer: number | undefined;
function toast(message: string, tone: 'error' | 'info' = 'error'): void {
  window.clearTimeout(toastTimer);
  toastEl.replaceChildren(
    h(
      'p',
      {
        class:
          'cl-toast-in flex max-w-xl items-start gap-2 rounded-card px-4 py-3 font-mono text-sm shadow-lg ' +
          (tone === 'error' ? 'bg-ink text-bg' : 'bg-paper text-ink ring-1 ring-ink/15'),
      },
      tone === 'error' ? icon(ICONS.alert, 'mt-0.5 size-4 shrink-0 text-accent') : icon(ICONS.check, 'mt-0.5 size-4 shrink-0 text-open'),
      message,
    ),
  );
  toastTimer = window.setTimeout(() => toastEl.replaceChildren(), 6000);
}
function announce(message: string): void {
  srEl.textContent = '';
  window.setTimeout(() => (srEl.textContent = message), 30);
}
const SAVE_ERROR = 'Das hat leider nicht geklappt – bitte versuch es gleich noch einmal.';

// ---------- Übersicht ----------

function renderSummary(): void {
  const p = progress(items);
  for (const phase of ['vor', 'nach'] as const) {
    const { done, total } = p[phase];
    const pct = total ? Math.round((done / total) * 100) : 0;
    $(`cl-prog-${phase}-text`).textContent = `${done} von ${total} erledigt`;
    const bar = $(`cl-prog-${phase}`);
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuetext', `${done} von ${total} erledigt`);
    (bar.querySelector('[data-bar]') as HTMLElement).style.width = `${pct}%`;
  }
  const blocker = $('cl-blocker');
  blocker.replaceChildren(
    p.openBlockers
      ? h(
          'span',
          { class: 'inline-flex items-center gap-2 text-closed' },
          icon(ICONS.alert),
          `${p.openBlockers} ${p.openBlockers === 1 ? 'offener Blocker' : 'offene Blocker'}`,
        )
      : h('span', { class: 'inline-flex items-center gap-2 text-open' }, icon(ICONS.check), 'Keine offenen Blocker'),
  );
}

function renderCountdown(): void {
  const c = countdown(goLiveAt);
  $('cl-countdown').textContent = c.live ? c.text : `${c.text} bis zum Go-Live`;
  $('cl-golive-date').textContent = formatGoLive(goLiveAt);
}

function renderCategoriesDatalist(): void {
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))];
  $('cl-categories').replaceChildren(...cats.map((c) => h('option', { value: c })));
}

// ---------- Karten ----------

function commentsFor(itemId: string): Comment[] {
  return sortComments(comments.filter((c) => c.itemId === itemId));
}

function isCommentsOpen(item: Item, list: Comment[]): boolean {
  return commentsOpen.get(item.id) ?? list.some(isOpenComment);
}

function badges(item: Item): Child[] {
  const out: Child[] = [];
  if (item.priority === 'blocker')
    out.push(h('span', { class: `${badgeBase} bg-closed text-white` }, icon(ICONS.alert, 'size-3'), 'Blocker'));
  if (item.priority === 'wichtig')
    out.push(h('span', { class: `${badgeBase} border border-accent-ink/50 text-accent-ink` }, 'Wichtig'));
  out.push(h('span', { class: `${badgeBase} bg-secondary/10 text-secondary` }, `Für: ${OWNER_LABEL[item.owner]}`));
  if (item.assignee) out.push(h('span', { class: `${badgeBase} bg-bg-alt text-ink-soft` }, `Zuständig: ${item.assignee}`));
  if (item.status === 'verworfen') out.push(h('span', { class: `${badgeBase} bg-ink/10 text-ink-soft` }, 'Verworfen'));
  return out;
}

const STATUS_PRESSED: Record<Exclude<Status, 'verworfen'>, string> = {
  offen: 'bg-ink text-bg',
  in_arbeit: 'bg-secondary text-white',
  erledigt: 'bg-open text-white',
};

function statusControl(item: Item): HTMLElement {
  const pending = item.id.startsWith('tmp-');
  const group = h(
    'div',
    {
      role: 'group',
      'aria-label': `Status von „${item.title}"`,
      class: 'grid min-w-0 flex-1 grid-cols-3 overflow-hidden rounded-card border-2 border-ink/15 bg-paper sm:max-w-md',
    },
    (['offen', 'in_arbeit', 'erledigt'] as const).map((s, i) => {
      const pressed = item.status === s;
      return h(
        'button',
        {
          type: 'button',
          id: `st-${item.id}-${s}`,
          'aria-pressed': pressed ? 'true' : 'false',
          disabled: pending,
          'data-action': 'status',
          'data-id': item.id,
          'data-status': s,
          class:
            'inline-flex min-h-11 items-center justify-center gap-1 px-1 font-mono text-[13px] leading-tight transition-colors ' +
            'duration-[var(--dur-fast)] focus-visible:relative focus-visible:z-10 sm:text-sm ' +
            (i ? 'border-l-2 border-ink/15 ' : '') +
            (pressed ? STATUS_PRESSED[s] : 'text-ink hover:bg-bg-alt'),
        },
        pressed && s === 'erledigt' ? icon(ICONS.check, 'size-3.5 shrink-0') : null,
        STATUS_LABEL[s],
      );
    }),
  );

  const discarded = item.status === 'verworfen';
  const menu = h(
    'details',
    { class: 'cl-menu relative shrink-0' },
    h(
      'summary',
      {
        id: `mn-${item.id}`,
        class:
          'grid size-11 cursor-pointer place-items-center rounded-card border-2 border-ink/15 bg-paper text-ink transition-colors hover:border-ink',
        'aria-label': 'Weitere Aktionen',
        title: 'Weitere Aktionen',
      },
      icon(ICONS.more, 'size-5'),
    ),
    h(
      'div',
      { class: 'absolute right-0 z-20 mt-2 w-60 rounded-card border border-ink/15 bg-paper p-1.5 shadow-xl' },
      h(
        'button',
        {
          type: 'button',
          class: 'flex min-h-11 w-full items-center rounded-card px-3 text-left text-sm hover:bg-bg-alt',
          disabled: pending,
          'data-action': 'status',
          'data-id': item.id,
          'data-status': discarded ? 'offen' : 'verworfen',
        },
        discarded ? 'Wieder aufnehmen (Offen)' : 'Verwerfen – wird nicht gemacht',
      ),
    ),
  );
  return h('div', { class: 'flex items-center gap-2' }, group, menu);
}

function commentItem(c: Comment): HTMLElement {
  const pending = c.id.startsWith('tmp-');
  const kindLabel = c.kind === 'frage' ? 'Frage' : c.kind === 'antwort' ? 'Antwort' : 'Feedback';
  const kindCls =
    c.kind === 'frage'
      ? 'bg-accent/15 text-accent-ink'
      : c.kind === 'antwort'
        ? 'bg-secondary/10 text-secondary'
        : 'bg-primary/10 text-primary-deep';
  const canResolve = me.role === 'team' && c.kind !== 'antwort' && !pending;
  return h(
    'li',
    { class: `py-3 ${c.resolved ? 'opacity-65' : ''}` },
    h(
      'div',
      { class: 'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm' },
      h('strong', { class: 'font-semibold text-ink' }, c.userName || displayUser(c.userId)),
      h('span', { class: 'font-mono text-xs text-ink-soft' }, ROLE_LABEL[c.role] ?? c.role),
      h('span', { class: 'font-mono text-xs text-ink-soft tabular' }, pending ? 'wird gesendet …' : formatShort(c.createdAt)),
      h('span', { class: `${badgeBase} ${kindCls}` }, kindLabel),
      c.resolved ? h('span', { class: `${badgeBase} bg-open/10 text-open` }, icon(ICONS.check, 'size-3'), 'Eingebaut') : null,
    ),
    h('p', { class: 'mt-1 whitespace-pre-line break-words text-base text-ink' }, richText(c.text, linkCls)),
    canResolve
      ? h(
          'button',
          {
            type: 'button',
            id: `rs-${c.id}`,
            class: `${smallBtn} -ml-3 mt-1 text-ink-soft`,
            'data-action': 'resolve',
            'data-id': c.id,
          },
          c.resolved ? 'Wieder als offen markieren' : 'Als eingebaut markieren',
        )
      : null,
  );
}

function getCommentForm(item: Item): HTMLFormElement {
  let form = commentForms.get(item.id);
  if (form) return form;
  const kinds: [CommentKind, string][] = [['feedback', 'Feedback'], ['frage', 'Frage']];
  if (me.role === 'team') kinds.push(['antwort', 'Antwort']);
  const taId = `cm-${item.id}`;
  form = h(
    'form',
    { class: 'mt-3 space-y-2', 'data-item': item.id, novalidate: true },
    h('label', { for: taId, class: 'sr-only' }, `Dein Feedback zu „${item.title}"`),
    h('textarea', {
      id: taId,
      name: 'text',
      rows: 2,
      maxlength: 4000,
      placeholder: 'Dein Feedback zu diesem Punkt …',
      class:
        'block w-full rounded-card border-2 border-ink/15 bg-bg px-3 py-2.5 text-base text-ink placeholder:text-ink-soft/75 ' +
        'transition-colors hover:border-ink/40 focus:border-ink',
    }),
    h(
      'div',
      { class: 'flex flex-wrap items-center justify-between gap-2' },
      h(
        'fieldset',
        { class: 'flex flex-wrap items-center gap-2' },
        h('legend', { class: 'sr-only' }, 'Art des Kommentars'),
        kinds.map(([value, label], i) =>
          h(
            'label',
            { class: 'cl-chip cl-chip--sm' },
            h('input', { type: 'radio', name: `kind-${item.id}`, value, checked: i === 0 }),
            label,
          ),
        ),
      ),
      h(
        'button',
        {
          type: 'submit',
          class:
            'ml-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-card bg-ink px-5 font-mono text-sm text-bg ' +
            'transition-colors duration-[var(--dur-fast)] hover:bg-primary-deep active:translate-y-px',
        },
        'Senden',
      ),
    ),
  );
  commentForms.set(item.id, form);
  return form;
}

function commentsSection(item: Item, list: Comment[]): HTMLElement {
  const openCount = list.filter(isOpenComment).length;
  const expanded = isCommentsOpen(item, list);
  const panelId = `cp-${item.id}`;
  const label = list.length ? `Feedback & Fragen (${list.length})` : 'Feedback geben';
  return h(
    'div',
    { class: 'mt-4 border-t border-ink/10 pt-2' },
    h(
      'button',
      {
        type: 'button',
        id: `tg-${item.id}`,
        'aria-expanded': expanded ? 'true' : 'false',
        'aria-controls': panelId,
        'data-action': 'toggle',
        'data-id': item.id,
        class:
          '-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-card px-2 text-left font-mono text-sm text-ink ' +
          'transition-colors hover:bg-bg-alt',
      },
      icon(ICONS.message),
      h('span', { class: 'min-w-0 flex-1' }, label),
      openCount
        ? h('span', { class: `${badgeBase} bg-accent text-white` }, `${openCount} offen`)
        : null,
      icon(ICONS.chevron, `size-4 shrink-0 transition-transform duration-[var(--dur-fast)] ${expanded ? 'rotate-180' : ''}`),
    ),
    h(
      'div',
      { id: panelId, hidden: !expanded },
      list.length
        ? h('ul', { class: 'divide-y divide-ink/10', 'aria-label': 'Kommentare' }, list.map(commentItem))
        : h('p', { class: 'py-2 text-sm text-ink-soft' }, 'Noch kein Feedback. Schreib einfach, was dir auffällt – wir bauen es ein.'),
      getCommentForm(item),
    ),
  );
}

function cardSignature(item: Item, list: Comment[]): string {
  return JSON.stringify([item, list, isCommentsOpen(item, list)]);
}

function fillCard(card: HTMLElement, item: Item, list: Comment[]): void {
  const href = safeHref(item.link);
  const done = item.status === 'erledigt';
  const discarded = item.status === 'verworfen';
  const openBlocker = item.priority === 'blocker' && !done && !discarded;
  card.className =
    'rounded-card border bg-paper p-4 shadow-[0_1px_0_rgb(36_27_20/0.04)] md:p-5 ' +
    (openBlocker ? 'border-closed/40 border-l-4 border-l-closed ' : 'border-ink/10 ') +
    (done || discarded ? 'bg-paper/60 ' : '');
  const changed =
    item.updatedBy && item.updatedBy !== 'seed' && !item.id.startsWith('tmp-')
      ? h(
          'p',
          { class: 'mt-3 font-mono text-xs text-ink-soft' },
          `Zuletzt geändert von ${displayUser(item.updatedBy)} · ${formatShort(item.updatedAt)}`,
        )
      : null;
  setChildren(
    card,
    h('div', { class: 'flex flex-wrap items-center gap-1.5' }, badges(item)),
    h(
      'h4',
      {
        class:
          'mt-2 flex items-start gap-2 font-display text-xl leading-snug md:text-[1.4rem] ' +
          (discarded ? 'text-ink-soft line-through decoration-1' : done ? 'text-ink-soft' : 'text-ink'),
      },
      done ? icon(ICONS.check, 'mt-1.5 size-5 shrink-0 text-open') : null,
      h('span', { class: 'min-w-0 break-words' }, item.title),
    ),
    item.description
      ? h('p', { class: 'mt-2 whitespace-pre-line break-words text-base leading-relaxed text-ink-soft' }, richText(item.description, linkCls))
      : null,
    href
      ? h(
          'a',
          { href, target: '_blank', rel: 'noopener noreferrer', class: 'link-ul mt-2 inline-flex min-h-11 items-center gap-1.5 font-mono text-sm text-ink' },
          'Ansehen',
          icon(ICONS.external, 'arrow-icon size-4'),
          h('span', { class: 'sr-only' }, ' (öffnet in neuem Tab)'),
        )
      : null,
    h('div', { class: 'mt-3' }, statusControl(item)),
    changed,
    commentsSection(item, list),
  );
}

// ---------- Liste ----------

function captureFocus(): { id: string; sel: [number, number] | null } | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !el.id || !listEl.contains(el)) return null;
  const sel =
    el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
      ? ([el.selectionStart ?? 0, el.selectionEnd ?? 0] as [number, number])
      : null;
  return { id: el.id, sel };
}

function restoreFocus(f: ReturnType<typeof captureFocus>): void {
  if (!f) return;
  const el = document.getElementById(f.id);
  if (!el || document.activeElement === el) return;
  el.focus({ preventScroll: true });
  if (f.sel && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) {
    try {
      el.setSelectionRange(f.sel[0], f.sel[1]);
    } catch {
      /* nicht jeder Input-Typ kennt Selektion */
    }
  }
}

function renderList(): void {
  const focus = captureFocus();
  const groups = groupItems(items, filters, keep);
  const visibleIds = new Set<string>();

  // Karten aktualisieren (nur bei geänderter Signatur neu befüllen)
  for (const g of groups)
    for (const c of g.categories)
      for (const item of c.items) {
        visibleIds.add(item.id);
        const list = commentsFor(item.id);
        const sig = cardSignature(item, list);
        let card = cards.get(item.id);
        if (!card) {
          card = h('article', { id: `punkt-${item.id}`, 'aria-labelledby': `t-${item.id}` });
          cards.set(item.id, card);
        }
        if (cardSig.get(item.id) !== sig) {
          fillCard(card, item, list);
          card.querySelector('h4')?.setAttribute('id', `t-${item.id}`);
          cardSig.set(item.id, sig);
        }
      }
  // Karten entfernter Punkte vergessen
  for (const id of [...cards.keys()]) if (!items.some((i) => i.id === id)) {
    cards.delete(id);
    cardSig.delete(id);
    commentForms.delete(id);
  }

  // Gerüst nur neu bauen, wenn sich Reihenfolge/Gruppen geändert haben
  const key = JSON.stringify(groups.map((g) => [g.phase, g.categories.map((c) => [c.category, c.items.map((i) => i.id)])]));
  if (key !== structureKey || !listEl.querySelector('[data-structure]')) {
    structureKey = key;
    if (!groups.length) {
      listEl.replaceChildren(emptyState());
    } else {
      listEl.replaceChildren(
        h(
          'div',
          { 'data-structure': '', class: 'space-y-12' },
          groups.map((g) =>
            h(
              'section',
              { 'aria-labelledby': `ph-${g.phase}` },
              h(
                'h2',
                { id: `ph-${g.phase}`, class: 'flex items-baseline gap-3 font-display text-3xl md:text-4xl' },
                PHASE_LABEL[g.phase],
                h('span', { class: 'font-mono text-sm font-normal tracking-normal text-ink-soft' }, `${g.count}`),
              ),
              h('span', { class: 'tz-rule mt-3 block h-1.5 w-16 rounded-full', 'aria-hidden': 'true' }),
              g.categories.map((c) =>
                h(
                  'div',
                  { class: 'mt-8' },
                  h('h3', { class: 'font-mono text-xs uppercase tracking-[0.22em] text-ink-soft' }, c.category),
                  h('ul', { class: 'mt-3 space-y-3' }, c.items.map((i) => h('li', null, cards.get(i.id)!))),
                ),
              ),
            ),
          ),
        ),
      );
    }
  }
  restoreFocus(focus);
  renderCount(groups.reduce((n, g) => n + g.count, 0), visibleIds);
}

function emptyState(): HTMLElement {
  const allDone = filters.status === 'offen';
  return h(
    'div',
    { class: 'rounded-card border border-dashed border-ink/25 bg-paper/60 p-8 text-center' },
    h('p', { class: 'font-display text-2xl' }, allDone ? 'Hier ist alles erledigt.' : 'Keine Punkte in dieser Ansicht.'),
    h('p', { class: 'mt-2 text-ink-soft' }, 'Mit den Filtern kannst du dir andere Punkte anzeigen lassen.'),
    h(
      'button',
      { type: 'button', class: `${smallBtn} mt-3`, 'data-action': 'show-all' },
      'Alle Punkte anzeigen',
    ),
  );
}

function renderCount(n: number, visibleIds: ReadonlySet<string>): void {
  const withFeedback = new Set(comments.filter((c) => isOpenComment(c) && visibleIds.has(c.itemId)).map((c) => c.itemId));
  countEl.textContent =
    `${n} ${n === 1 ? 'Punkt' : 'Punkte'}` + (withFeedback.size ? ` · ${withFeedback.size} mit offenem Feedback` : '');
}

function renderAll(): void {
  renderSummary();
  renderCategoriesDatalist();
  renderList();
}

// ---------- Daten laden / Polling ----------

async function refresh(force = false): Promise<void> {
  if (!force && Date.now() - lastFetch < FOCUS_THROTTLE_MS) return;
  if (inflight > 0) return; // nach dem Speichern wird ohnehin neu geladen
  lastFetch = Date.now();
  const seq = mutationSeq;
  try {
    const data = await api.getChecklist();
    if (seq !== mutationSeq || inflight > 0) return; // zwischenzeitlich lokal geändert → nicht überschreiben
    // noch nicht bestätigte (tmp-)Einträge behalten
    items = [...data.items, ...items.filter((i) => i.id.startsWith('tmp-'))];
    comments = [...data.comments, ...comments.filter((c) => c.id.startsWith('tmp-'))];
    if (offline) toast('Verbindung ist wieder da.', 'info');
    offline = false;
    renderAll();
  } catch (e) {
    if (e instanceof api.ApiError && e.status === 401) return;
    if (!offline) toast('Keine Verbindung zum Server – ich versuche es gleich wieder.');
    offline = true;
  }
}

/** Schreibaufruf mit optimistischem Zustand; bei Fehler zurückrollen. */
async function mutate<T>(apply: () => void, call: () => Promise<T>, onOk: (res: T) => void, rollback: () => void): Promise<boolean> {
  mutationSeq++;
  inflight++;
  apply();
  renderAll();
  try {
    const res = await call();
    onOk(res);
    return true;
  } catch (e) {
    rollback();
    if (!(e instanceof api.ApiError && e.status === 401)) toast(SAVE_ERROR);
    return false;
  } finally {
    inflight--;
    renderAll();
  }
}

function replaceItem(id: string, next: Item): void {
  items = items.map((i) => (i.id === id ? next : i));
}

// ---------- Aktionen ----------

async function setStatus(id: string, status: Status): Promise<void> {
  const item = items.find((i) => i.id === id);
  if (!item || item.status === status) return;
  const prev = item;
  keep.add(id);
  const ok = await mutate(
    () => replaceItem(id, { ...prev, status, updatedAt: new Date().toISOString(), updatedBy: me.id }),
    () => api.patchItem(id, { status }),
    (res) => replaceItem(id, res),
    () => replaceItem(id, prev),
  );
  if (ok) announce(`„${prev.title}": ${STATUS_LABEL[status]}`);
}

async function sendComment(form: HTMLFormElement): Promise<void> {
  const itemId = form.dataset.item!;
  const ta = form.elements.namedItem('text') as HTMLTextAreaElement;
  const text = ta.value.trim();
  if (!text) {
    ta.focus();
    toast('Schreib zuerst etwas in das Feld.', 'info');
    return;
  }
  const kindInput = form.querySelector<HTMLInputElement>('input[type=radio]:checked');
  const kind = (kindInput?.value ?? 'feedback') as CommentKind;
  const tmp: Comment = {
    id: `tmp-c${++tmpCounter}`,
    itemId,
    userId: me.id,
    userName: me.name,
    role: me.role,
    text,
    kind,
    resolved: false,
    createdAt: new Date().toISOString(),
  };
  ta.value = '';
  commentsOpen.set(itemId, true);
  keep.add(itemId);
  const ok = await mutate(
    () => (comments = [...comments, tmp]),
    () => api.createComment(itemId, text, kind),
    (res) => (comments = comments.map((c) => (c.id === tmp.id ? res : c))),
    () => (comments = comments.filter((c) => c.id !== tmp.id)),
  );
  if (ok) announce('Danke! Dein Kommentar ist gespeichert.');
  else if (!ta.value) ta.value = text; // Entwurf zurückgeben
}

async function toggleResolved(id: string): Promise<void> {
  const c = comments.find((x) => x.id === id);
  if (!c) return;
  const prev = c;
  await mutate(
    () => (comments = comments.map((x) => (x.id === id ? { ...x, resolved: !x.resolved } : x))),
    () => api.patchComment(id, !prev.resolved),
    (res) => (comments = comments.map((x) => (x.id === id ? res : x))),
    () => (comments = comments.map((x) => (x.id === id ? prev : x))),
  );
}

function toggleComments(id: string): void {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  commentsOpen.set(id, !isCommentsOpen(item, commentsFor(id)));
  renderList();
  if (commentsOpen.get(id)) {
    const list = commentsFor(id);
    if (!list.length) document.getElementById(`cm-${id}`)?.focus({ preventScroll: false });
  }
}

// ---------- Neuer Punkt ----------

function setNewFormOpen(open: boolean): void {
  newForm.hidden = !open;
  newOpenBtn.setAttribute('aria-expanded', String(open));
  if (open) (newForm.elements.namedItem('title') as HTMLInputElement).focus();
}

function setRadio(form: HTMLFormElement, name: string, value: string): void {
  const input = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function resetNewForm(): void {
  newForm.reset();
  setRadio(newForm, 'phase', countdown(goLiveAt).live ? 'nach' : 'vor');
  setRadio(newForm, 'owner', me.role === 'inhaberin' ? 'beide' : 'team');
  setRadio(newForm, 'priority', 'normal');
  const title = newForm.elements.namedItem('title') as HTMLInputElement;
  title.removeAttribute('aria-invalid');
  newForm.querySelector('[data-error]')?.remove();
}

function radioValue(form: HTMLFormElement, name: string): string {
  return form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
}

async function submitNewItem(): Promise<void> {
  const title = newForm.elements.namedItem('title') as HTMLInputElement;
  const description = newForm.elements.namedItem('description') as HTMLTextAreaElement;
  const category = newForm.elements.namedItem('category') as HTMLInputElement;
  newForm.querySelector('[data-error]')?.remove();
  if (!title.value.trim()) {
    title.setAttribute('aria-invalid', 'true');
    title.setAttribute('aria-describedby', 'np-title-error');
    title.insertAdjacentElement(
      'afterend',
      h('p', { id: 'np-title-error', 'data-error': '', class: 'mt-1.5 font-mono text-sm text-closed' }, 'Bitte gib dem Punkt einen Titel.'),
    );
    title.focus();
    return;
  }
  title.removeAttribute('aria-invalid');
  title.removeAttribute('aria-describedby');
  const input: NewItemInput = {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    phase: radioValue(newForm, 'phase') as Phase,
    owner: radioValue(newForm, 'owner') as Owner,
    priority: radioValue(newForm, 'priority') as Priority,
    category: category.value.trim() || undefined,
  };
  const draft = { title: title.value, description: description.value, category: category.value };
  const now = new Date().toISOString();
  const tmp: Item = {
    id: `tmp-i${++tmpCounter}`,
    title: input.title,
    description: input.description ?? '',
    phase: input.phase,
    owner: input.owner,
    status: 'offen',
    priority: input.priority ?? 'normal',
    category: input.category ?? 'Sonstiges',
    createdAt: now,
    updatedAt: now,
    updatedBy: me.id,
  };
  keep.add(tmp.id);
  resetNewForm();
  setNewFormOpen(false);
  let created: Item | null = null;
  const ok = await mutate(
    () => (items = [...items, tmp]),
    () => api.createItem(input),
    (res) => {
      created = res;
      keep.add(res.id);
      replaceItem(tmp.id, res);
    },
    () => (items = items.filter((i) => i.id !== tmp.id)),
  );
  keep.delete(tmp.id);
  if (ok && created) {
    const card = document.getElementById(`punkt-${(created as Item).id}`);
    card?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    card?.classList.add('cl-flash');
    toast('Neuer Punkt angelegt.', 'info');
  } else if (!ok) {
    setNewFormOpen(true);
    title.value = draft.title;
    description.value = draft.description;
    category.value = draft.category;
    setRadio(newForm, 'phase', input.phase);
    setRadio(newForm, 'owner', input.owner);
    setRadio(newForm, 'priority', input.priority ?? 'normal');
  }
}

// ---------- Filter ----------

function syncFilterInputs(): void {
  for (const name of ['fuer', 'phase', 'status'] as const) setRadio(filterForm, name, filters[name]);
}

function onFilterChange(): void {
  filters = {
    fuer: radioValue(filterForm, 'fuer') as Filters['fuer'],
    phase: radioValue(filterForm, 'phase') as Filters['phase'],
    status: radioValue(filterForm, 'status') as Filters['status'],
  };
  keep.clear();
  history.replaceState(null, '', location.pathname + filtersToSearch(filters) + location.hash);
  renderList();
}

// ---------- Ereignisse ----------

function bindEvents(): void {
  filterForm.addEventListener('change', onFilterChange);
  filterForm.addEventListener('submit', (e) => e.preventDefault());

  listEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const { action, id = '' } = btn.dataset;
    if (action === 'status') {
      btn.closest('details')?.removeAttribute('open');
      void setStatus(id, btn.dataset.status as Status);
    } else if (action === 'toggle') toggleComments(id);
    else if (action === 'resolve') void toggleResolved(id);
    else if (action === 'show-all') {
      filters = { fuer: 'alle', phase: 'alle', status: 'alle' };
      syncFilterInputs();
      onFilterChange();
    }
  });

  listEl.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.dataset.item) return;
    e.preventDefault();
    void sendComment(form);
  });
  // Strg/Cmd+Enter sendet Kommentare
  listEl.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && t instanceof HTMLTextAreaElement && t.form?.dataset.item) {
      e.preventDefault();
      t.form.requestSubmit();
    }
  });

  // Menüs schließen bei Klick daneben / Escape
  document.addEventListener('click', (e) => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details.cl-menu[open]'))
      if (!d.contains(e.target as Node)) d.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details.cl-menu[open]')) {
      d.open = false;
      d.querySelector('summary')?.focus();
    }
  });

  newOpenBtn.addEventListener('click', () => setNewFormOpen(newForm.hidden));
  $('cl-new-cancel').addEventListener('click', () => {
    resetNewForm();
    setNewFormOpen(false);
    newOpenBtn.focus();
  });
  newForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitNewItem();
  });

  window.setInterval(() => {
    if (!document.hidden) void refresh(true);
  }, POLL_MS);
  window.addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  window.setInterval(renderCountdown, 30_000);
}

// ---------- Start ----------

function greet(): void {
  const user = $('cl-user');
  user.textContent = me.name;
  user.title = `Angemeldet als ${me.name}`;
  $('cl-hello').textContent =
    me.role === 'inhaberin'
      ? `Hallo ${me.name}! Hier siehst du, was rund um den Start der Website noch ansteht – und wo wir dich brauchen. Zu jedem Punkt kannst du direkt Feedback geben oder eine Frage stellen.`
      : `Hallo ${me.name}! Alles, was vor und nach dem Go-Live zu tun ist. Feedback von Josie erscheint direkt am jeweiligen Punkt.`;
}

function fatal(message: string): void {
  listEl.replaceChildren(
    h(
      'div',
      { class: 'rounded-card border border-closed/40 bg-paper p-6' },
      h('p', { class: 'font-display text-2xl' }, 'Die Checkliste konnte nicht geladen werden.'),
      h('p', { class: 'mt-2 text-ink-soft' }, message),
      h('button', { type: 'button', class: `${smallBtn} mt-3` }, 'Neu laden'),
    ),
  );
  listEl.querySelector('button')?.addEventListener('click', () => location.reload());
}

async function init(): Promise<void> {
  const buildGoLive = mainEl.dataset.golive;
  goLiveAt = isValidDate(buildGoLive) ? buildGoLive : '2026-10-19T16:00:00+02:00';
  renderCountdown();
  void api.getGoLive().then((iso) => {
    if (isValidDate(iso)) {
      goLiveAt = iso;
      renderCountdown();
    }
  });

  try {
    me = await api.getMe();
  } catch (e) {
    if (!(e instanceof api.ApiError && e.status === 401)) fatal('Bitte prüf deine Verbindung und lade die Seite neu.');
    return;
  }
  filters = parseFilters(location.search, me.role);
  syncFilterInputs();
  greet();
  resetNewForm();

  try {
    const data = await api.getChecklist();
    items = data.items;
    comments = data.comments;
    lastFetch = Date.now();
  } catch (e) {
    if (!(e instanceof api.ApiError && e.status === 401)) fatal('Bitte prüf deine Verbindung und lade die Seite neu.');
    return;
  }
  renderAll();
  bindEvents();

  // Direkter Sprung auf einen Punkt (#punkt-<id>) — auch wenn der Filter ihn ausblenden würde
  const hashId = location.hash.startsWith('#punkt-') ? decodeURIComponent(location.hash.slice(7)) : '';
  if (hashId && items.some((i) => i.id === hashId)) {
    keep.add(hashId);
    commentsOpen.set(hashId, true);
    renderList();
    const card = document.getElementById(`punkt-${hashId}`);
    card?.scrollIntoView({ block: 'start' });
    card?.classList.add('cl-flash');
  }
}

// Startwert, damit Filter-Typen vor dem Login-Check definiert sind
filters = defaultFilters('team');
void init();
