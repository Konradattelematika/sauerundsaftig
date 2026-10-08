/** Wiederverwendbare UI-Bausteine: Dialoge (<dialog>), Rückfragen, Toasts, Buttons, Hinweise. */
import { h, icon, setChildren, type Child, type ICONS } from './dom';

type IconName = keyof typeof ICONS;

export function btn(
  label: Child,
  opts: { kind?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'quiet'; icon?: IconName; onClick?: (e: MouseEvent) => void; small?: boolean; title?: string; type?: 'button' | 'submit'; disabled?: boolean; attrs?: Record<string, string> } = {},
): HTMLButtonElement {
  const b = h(
    'button',
    {
      type: opts.type ?? 'button',
      class: `ad-btn ad-btn--${opts.kind ?? 'secondary'}${opts.small ? ' ad-btn--sm' : ''}`,
      title: opts.title,
      disabled: opts.disabled,
    },
    opts.icon ? icon(opts.icon) : null,
    label,
  );
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) b.setAttribute(k, v);
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

/** Quadratischer Icon-Button mit Beschriftung für Screenreader + Tooltip */
export function iconBtn(name: IconName, label: string, onClick?: (e: MouseEvent) => void, opts: { danger?: boolean; disabled?: boolean; pressed?: boolean } = {}): HTMLButtonElement {
  const b = h(
    'button',
    {
      type: 'button',
      class: `ad-iconbtn${opts.danger ? ' ad-iconbtn--danger' : ''}`,
      'aria-label': label,
      title: label,
      disabled: opts.disabled,
      'aria-pressed': opts.pressed === undefined ? undefined : String(opts.pressed),
    },
    icon(name),
  );
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function linkBtn(label: Child, href: string, opts: { kind?: string; icon?: IconName; newTab?: boolean; small?: boolean } = {}): HTMLAnchorElement {
  return h(
    'a',
    {
      href,
      class: `ad-btn ad-btn--${opts.kind ?? 'secondary'}${opts.small ? ' ad-btn--sm' : ''}`,
      target: opts.newTab ? '_blank' : undefined,
      rel: opts.newTab ? 'noopener' : undefined,
    },
    opts.icon ? icon(opts.icon) : null,
    label,
  );
}

export function badge(text: string, tone: 'ok' | 'warn' | 'error' | 'neutral' | 'info' = 'neutral'): HTMLSpanElement {
  return h('span', { class: `ad-badge ad-badge--${tone}` }, text);
}

export function notice(tone: 'info' | 'warn' | 'error' | 'ok', ...children: Child[]): HTMLDivElement {
  const ic: IconName = tone === 'ok' ? 'check' : tone === 'info' ? 'help' : 'alert';
  return h('div', { class: `ad-notice ad-notice--${tone}`, role: tone === 'error' ? 'alert' : undefined }, icon(ic), h('div', null, ...children));
}

/* ------------------------------------------------------------------ Dialoge ------------------- */

export interface DialogHandle {
  el: HTMLDialogElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  close(result?: unknown): void;
  closed: Promise<unknown>;
  setTitle(t: string): void;
}

/** Modaler Dialog (natives <dialog>: Fokusfalle, Esc, Hintergrund inert). */
export function openDialog(opts: { title: string; wide?: boolean; size?: 'sm' | 'md' | 'lg' | 'xl'; dismissable?: boolean; onClose?: () => void }): DialogHandle {
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const title = h('h2', { id: titleId, class: 'ad-dialog__title' }, opts.title);
  const body = h('div', { class: 'ad-dialog__body' });
  const footer = h('div', { class: 'ad-dialog__footer' });
  const dismissable = opts.dismissable !== false;
  let resolve!: (v: unknown) => void;
  const closed = new Promise<unknown>((r) => (resolve = r));
  let result: unknown;
  const el = h(
    'dialog',
    { class: `ad-dialog ad-dialog--${opts.size ?? (opts.wide ? 'lg' : 'md')}`, 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'ad-dialog__head' },
      title,
      dismissable ? iconBtn('close', 'Schließen', () => handle.close()) : null,
    ),
    body,
    footer,
  );
  el.addEventListener('cancel', (e) => {
    if (!dismissable) e.preventDefault();
  });
  el.addEventListener('close', () => {
    el.remove();
    opts.onClose?.();
    resolve(result);
  });
  if (dismissable) {
    el.addEventListener('mousedown', (e) => {
      if (e.target === el) {
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) handle.close();
      }
    });
  }
  const handle: DialogHandle = {
    el,
    body,
    footer,
    closed,
    close(r?: unknown) {
      result = r;
      if (el.open) el.close();
      else {
        el.remove();
        resolve(result);
      }
    },
    setTitle(t: string) {
      title.textContent = t;
    },
  };
  document.body.appendChild(el);
  el.showModal();
  return handle;
}

/** Rückfrage. Ergebnis true = bestätigt. */
export async function confirmDialog(opts: {
  title: string;
  message?: Child;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}): Promise<boolean> {
  const d = openDialog({ title: opts.title, size: 'sm' });
  if (opts.message !== undefined) setChildren(d.body, typeof opts.message === 'string' ? h('p', null, opts.message) : opts.message);
  const ok = btn(opts.confirm ?? 'OK', { kind: opts.danger ? 'danger' : 'primary', onClick: () => d.close(true) });
  d.footer.append(btn(opts.cancel ?? 'Abbrechen', { kind: 'quiet', onClick: () => d.close(false) }), ok);
  ok.focus();
  return (await d.closed) === true;
}

export async function alertDialog(title: string, message: Child): Promise<void> {
  const d = openDialog({ title, size: 'sm' });
  setChildren(d.body, typeof message === 'string' ? h('p', null, message) : message);
  const ok = btn('Verstanden', { kind: 'primary', onClick: () => d.close() });
  d.footer.append(ok);
  ok.focus();
  await d.closed;
}

/* ------------------------------------------------------------------ Toasts -------------------- */

let toastRoot: HTMLElement | null = null;
export function toast(message: string, tone: 'info' | 'ok' | 'error' = 'info', ms = 5000): void {
  if (!toastRoot) {
    toastRoot = h('div', { class: 'ad-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastRoot);
  }
  const t = h('div', { class: `ad-toast ad-toast--${tone}` }, icon(tone === 'error' ? 'alert' : tone === 'ok' ? 'check' : 'help'), h('span', null, message));
  toastRoot.appendChild(t);
  setTimeout(() => {
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ------------------------------------------------------------------ Diverses ------------------ */

export function pageHeader(title: string, intro?: Child, actions?: Child): HTMLElement {
  return h(
    'header',
    { class: 'ad-viewhead' },
    h('div', { class: 'ad-viewhead__text' }, h('h1', { class: 'ad-h1', tabindex: '-1' }, title), intro ? h('p', { class: 'ad-lead' }, intro) : null),
    actions ? h('div', { class: 'ad-viewhead__actions' }, actions) : null,
  );
}

export function card(...children: Child[]): HTMLElement {
  return h('section', { class: 'ad-card' }, ...children);
}

export function cardTitle(title: string, intro?: Child): HTMLElement {
  return h('div', { class: 'ad-card__head' }, h('h2', { class: 'ad-h2' }, title), intro ? h('p', { class: 'ad-help' }, intro) : null);
}

export function emptyState(text: string, action?: Child): HTMLElement {
  return h('div', { class: 'ad-empty' }, h('p', null, text), action ?? null);
}

export function loading(text = 'Lade …'): HTMLElement {
  return h('div', { class: 'ad-loading', role: 'status' }, h('span', { class: 'ad-spinner', 'aria-hidden': 'true' }), text);
}

/** Bearbeitungsbereich: ohne Bearbeitungsrecht werden alle Eingaben gesperrt */
export function editable(readOnly: boolean, ...children: Child[]): HTMLFieldSetElement {
  return h('fieldset', { class: 'ad-editable', disabled: readOnly }, ...children);
}
