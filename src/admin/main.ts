/**
 * Admin-Dashboard /admin (docs/CMS-PLAN.md §8): Rahmen (Seitenleiste, Kopfleiste mit Speicherstatus,
 * Vorschau, Veröffentlichen, Entwurf verwerfen), Hash-Router und Start. Bereiche: src/admin/views/*.
 */
import { ApiError } from './api';
import { h, icon, setChildren, type ICONS } from './dom';
import { refreshErrors } from './fields';
import { discardDraft, openPreview, openPublishDialog } from './publish';
import { store } from './state';
import { alertDialog, btn, iconBtn, openDialog, toast } from './ui';
import { formatDateTime, relativeTime } from './util';
import { go, parseHash, type Route, type View } from './view';
import { describePath } from './where';
import { renderOverview } from './views/overview';
import { renderPages, renderPageSettings } from './views/pages';
import { renderEditor, editorPreviewPath } from './views/editor';
import { renderMedia } from './views/media';
import { renderNavigation } from './views/navigation';
import { renderLayout } from './views/layout';
import { renderLinks } from './views/links';
import { renderSeo } from './views/seo';
import { renderSettings } from './views/settings';
import { renderCollection } from './views/collections';
import { renderUsers } from './views/users';
import { renderVersions } from './views/versions';

interface Area {
  id: string;
  label: string;
  icon: keyof typeof ICONS;
  view: View;
  perm?: Parameters<typeof store.can>[0];
  group?: string;
}

const AREAS: Area[] = [
  { id: '', label: 'Übersicht', icon: 'home', view: renderOverview },
  { id: 'seiten', label: 'Seiten', icon: 'pages', view: renderPages },
  { id: 'medien', label: 'Medien', icon: 'image', view: renderMedia },
  { id: 'navigation', label: 'Navigation', icon: 'nav', view: renderNavigation },
  { id: 'layout', label: 'Header & Footer', icon: 'layout', view: renderLayout },
  { id: 'links', label: 'Buttons & Links', icon: 'link', view: renderLinks },
  { id: 'seo', label: 'SEO', icon: 'search', view: renderSeo },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'settings', view: renderSettings },
  { id: 'karte', label: 'Karte', icon: 'menu', view: (r, q) => renderCollection(r, q, 'menu'), group: 'Sammlungen' },
  { id: 'faq', label: 'FAQ', icon: 'help', view: (r, q) => renderCollection(r, q, 'faq'), group: 'Sammlungen' },
  { id: 'stimmen', label: 'Gästestimmen', icon: 'quote', view: (r, q) => renderCollection(r, q, 'testimonials'), group: 'Sammlungen' },
  { id: 'backstube', label: 'Aus der Backstube', icon: 'bread', view: (r, q) => renderCollection(r, q, 'heuteFrisch'), group: 'Sammlungen' },
  { id: 'benutzer', label: 'Benutzer', icon: 'users', view: renderUsers, perm: 'users.manage', group: 'Verwaltung' },
  { id: 'versionen', label: 'Versionen', icon: 'history', view: renderVersions, group: 'Verwaltung' },
];

const app = document.getElementById('ad-app') as HTMLElement;
let viewRoot: HTMLElement;
let cleanup: (() => void) | void;
let navLinks: Map<string, HTMLAnchorElement>;
let titleEl: HTMLElement;
let statusEl: HTMLElement;
let issuesBtn: HTMLButtonElement;
let publishBtn: HTMLButtonElement;
let currentRoute: Route = parseHash();

/* ------------------------------------------------------------------ Rahmen --------------------- */

function buildShell(): void {
  navLinks = new Map();
  const groups: (string | undefined)[] = [];
  for (const a of AREAS) if (!groups.includes(a.group)) groups.push(a.group);
  const nav = h(
    'nav',
    { class: 'ad-nav', 'aria-label': 'Bereiche' },
    ...groups.map((g) =>
      h(
        'div',
        { class: 'ad-nav__group' },
        g ? h('p', { class: 'ad-nav__heading' }, g) : null,
        h(
          'ul',
          null,
          ...AREAS.filter((a) => a.group === g && (!a.perm || store.can(a.perm))).map((a) => {
            const link = h('a', { href: `#/${a.id}`, class: 'ad-nav__link', title: a.label }, icon(a.icon), h('span', { class: 'ad-nav__text' }, a.label));
            link.addEventListener('click', () => app.classList.remove('is-menu-open'));
            navLinks.set(a.id, link);
            return h('li', null, link);
          }),
        ),
      ),
    ),
  );
  const side = h(
    'aside',
    { class: 'ad-side', id: 'ad-side', 'aria-label': 'Seitenleiste' },
    h(
      'div',
      { class: 'ad-side__brand' },
      h('a', { href: '#/', class: 'ad-side__logo', 'aria-label': 'Übersicht' }, h('img', { src: '/brand/logo-lockup-ink-640.png', alt: 'Sauer & Saftig', width: '72', height: '52' })),
      h('span', { class: 'ad-side__app' }, 'Inhalte'),
    ),
    nav,
    h(
      'div',
      { class: 'ad-side__foot' },
      h('p', { class: 'ad-side__user' }, icon('users'), h('span', null, store.me.name || store.me.id, h('small', null, roleLabel(store.me.role)))),
      h('a', { href: '/passwort', class: 'ad-side__link' }, icon('key'), h('span', { class: 'ad-nav__text' }, 'Passwort ändern')),
      h('a', { href: '/logout', class: 'ad-side__link' }, icon('logout'), h('span', { class: 'ad-nav__text' }, 'Abmelden')),
    ),
  );

  titleEl = h('p', { class: 'ad-top__title' });
  statusEl = h('div', { class: 'ad-status', role: 'status', 'aria-live': 'polite' });
  issuesBtn = btn('', { kind: 'quiet', small: true, icon: 'alert', onClick: () => openIssues() });
  issuesBtn.classList.add('ad-top__issues');
  const previewBtn = btn(h('span', { class: 'ad-hide-sm' }, 'Vorschau ansehen'), {
    kind: 'secondary',
    small: true,
    icon: 'eye',
    title: 'Entwurf in neuem Tab ansehen (nur für angemeldete Personen sichtbar)',
    onClick: () => void openPreview(currentPreviewPath()),
  });
  previewBtn.setAttribute('aria-label', 'Vorschau ansehen');
  publishBtn = btn('Veröffentlichen', { kind: 'accent', small: true, icon: 'send', onClick: () => void openPublishDialog() });
  const more = h(
    'details',
    { class: 'ad-more' },
    h('summary', { class: 'ad-iconbtn', 'aria-label': 'Weitere Aktionen', title: 'Weitere Aktionen' }, icon('more')),
    h(
      'div',
      { class: 'ad-more__menu', role: 'menu' },
      store.canEdit
        ? h('button', { type: 'button', class: 'ad-more__item', role: 'menuitem', onclick: () => { more.open = false; void discardDraft(); } }, icon('trash'), 'Entwurf verwerfen')
        : null,
      h('a', { href: '/', class: 'ad-more__item', role: 'menuitem', target: '_blank', rel: 'noopener' }, icon('external'), 'Website öffnen'),
      h('a', { href: '#/versionen', class: 'ad-more__item', role: 'menuitem', onclick: () => (more.open = false) }, icon('history'), 'Versionen'),
      h('a', { href: '/passwort', class: 'ad-more__item', role: 'menuitem' }, icon('key'), 'Passwort ändern'),
      h('a', { href: '/logout', class: 'ad-more__item', role: 'menuitem' }, icon('logout'), 'Abmelden'),
    ),
  );
  document.addEventListener('click', (e) => {
    if (more.open && !more.contains(e.target as Node)) more.open = false;
  });
  more.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      more.open = false;
      more.querySelector('summary')?.focus();
    }
  });

  const top = h(
    'header',
    { class: 'ad-top' },
    iconBtn('nav', 'Menü öffnen', () => {
      app.classList.toggle('is-menu-open');
      if (app.classList.contains('is-menu-open')) side.querySelector<HTMLElement>('a')?.focus();
    }),
    iconBtn('sidebar', 'Seitenleiste ein-/ausklappen', () => {
      app.classList.toggle('is-rail');
      localStorage.setItem('sus-admin-rail', app.classList.contains('is-rail') ? '1' : '0');
    }),
    titleEl,
    statusEl,
    h('div', { class: 'ad-top__actions' }, issuesBtn, previewBtn, store.can('cms.publish') ? publishBtn : null, more),
  );
  top.children[0].classList.add('ad-top__menu');
  top.children[1].classList.add('ad-top__rail');

  viewRoot = h('main', { id: 'ad-view', class: 'ad-view', tabindex: '-1' });
  const scrim = h('div', { class: 'ad-scrim', 'aria-hidden': 'true' });
  scrim.addEventListener('click', () => app.classList.remove('is-menu-open'));
  setChildren(app, side, h('div', { class: 'ad-main' }, top, viewRoot), scrim);
  if (localStorage.getItem('sus-admin-rail') === '1') app.classList.add('is-rail');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.classList.contains('is-menu-open')) app.classList.remove('is-menu-open');
  });
}

function roleLabel(role: string): string {
  return role === 'admin' || role === 'team' || role === 'inhaberin' ? 'Admin' : role === 'redaktion' ? 'Redaktion' : role;
}

function currentPreviewPath(): string {
  return editorPreviewPath(currentRoute) ?? '/';
}

/* ------------------------------------------------------------------ Status --------------------- */

function renderStatus(): void {
  const s = store.status;
  let tone = 'ok';
  let text = 'Gespeichert';
  let ic: keyof typeof ICONS = 'check';
  let extra: HTMLElement | null = null;
  if (!store.canEdit) {
    tone = 'neutral';
    text = 'Nur ansehen';
    ic = 'eye';
  } else if (s === 'pending') {
    tone = 'warn';
    text = 'Ungespeicherte Änderungen';
    ic = 'edit';
  } else if (s === 'saving') {
    tone = 'neutral';
    text = 'Speichert …';
    ic = 'refresh';
  } else if (s === 'error') {
    tone = 'error';
    text = 'Speichern fehlgeschlagen';
    ic = 'alert';
    extra = btn('Erneut versuchen', { kind: 'quiet', small: true, onClick: () => void store.save() });
  } else if (s === 'invalid') {
    tone = 'error';
    text = 'Nicht gespeichert — Fehler prüfen';
    ic = 'alert';
  } else if (s === 'conflict') {
    tone = 'error';
    text = 'Konflikt — bitte entscheiden';
    ic = 'alert';
    extra = btn('Lösen', { kind: 'quiet', small: true, onClick: () => conflictDialog() });
  }
  const sub =
    store.canEdit && s === 'saved'
      ? store.dirty
        ? 'Entwurf · noch nicht veröffentlicht'
        : 'Alles veröffentlicht'
      : '';
  statusEl.className = `ad-status ad-status--${tone}`;
  statusEl.title = store.statusMessage || (store.lastSavedAt ? `Zuletzt gespeichert: ${formatDateTime(store.lastSavedAt)}` : '');
  setChildren(statusEl, icon(ic), h('span', { class: 'ad-status__text' }, text, sub ? h('small', null, sub) : null), extra);
  // Veröffentlichen-Knopf
  const liveBusy = store.live && (store.live.state === 'queued' || store.live.state === 'running');
  publishBtn.disabled = Boolean(liveBusy);
  setChildren(publishBtn, icon(liveBusy ? 'refresh' : 'send'), liveBusy ? 'Wird veröffentlicht …' : 'Veröffentlichen');
  publishBtn.classList.toggle('has-dot', store.dirty || store.hasUnsaved);
  publishBtn.title = store.dirty || store.hasUnsaved ? 'Es gibt Änderungen, die noch nicht online sind' : 'Alles ist veröffentlicht';
}

function renderIssuesBtn(): void {
  const errors = store.issues.filter((i) => i.level === 'error').length;
  const warns = store.issues.length - errors;
  issuesBtn.hidden = store.issues.length === 0;
  setChildren(issuesBtn, icon('alert'), h('span', { class: 'ad-hide-sm' }, 'Prüfhinweise '), h('span', { class: `ad-count${errors ? ' is-error' : ''}` }, String(errors || warns)));
  issuesBtn.setAttribute('aria-label', `Prüfhinweise: ${errors} Fehler, ${warns} Hinweise`);
  issuesBtn.classList.toggle('is-error', errors > 0);
}

function openIssues(): void {
  const d = openDialog({ title: 'Prüfhinweise', size: 'lg' });
  const errors = store.issues.filter((i) => i.level === 'error');
  const warns = store.issues.filter((i) => i.level === 'warning');
  const list = (title: string, items: typeof store.issues, tone: string) =>
    items.length
      ? h(
          'section',
          { class: 'ad-issues' },
          h('h3', { class: 'ad-h3' }, title),
          h(
            'ul',
            { class: `ad-issuelist ad-issuelist--${tone}` },
            ...items.map((i) => {
              const w = describePath(store.doc, i.path);
              return h('li', null, h('a', { href: w.route, onclick: () => d.close() }, w.label), h('span', null, i.message));
            }),
          ),
        )
      : null;
  d.body.append(
    h('p', { class: 'ad-help' }, 'Fehler verhindern das Veröffentlichen. Hinweise sind Empfehlungen (z. B. für Google). Klick auf eine Stelle springt dorthin.'),
    list(`Fehler (${errors.length})`, errors, 'error'),
    list(`Hinweise (${warns.length})`, warns, 'warn'),
  );
  d.footer.append(btn('Schließen', { kind: 'primary', onClick: () => d.close() }));
}

let conflictOpen = false;
async function conflictDialog(): Promise<void> {
  if (conflictOpen) return;
  conflictOpen = true;
  const d = openDialog({ title: 'Der Entwurf wurde woanders geändert', size: 'md', dismissable: false });
  d.body.append(
    h('p', null, 'Während du gearbeitet hast, wurde der Entwurf an anderer Stelle gespeichert — vielleicht in einem zweiten Tab oder von einer anderen Person.'),
    h('p', null, 'Wie möchtest du weitermachen?'),
    h(
      'ul',
      { class: 'ad-choices' },
      h('li', null, h('strong', null, 'Neu laden: '), 'Du siehst den neuesten Stand. Deine Änderungen der letzten Sekunden gehen verloren.'),
      h('li', null, h('strong', null, 'Meine Fassung behalten: '), 'Dein Stand wird gespeichert und überschreibt die anderen Änderungen.'),
    ),
  );
  d.footer.append(
    btn('Neu laden', {
      kind: 'secondary',
      onClick: async () => {
        d.close();
        await store.reload();
        toast('Neuester Stand geladen.', 'info');
      },
    }),
    btn('Meine Fassung behalten', {
      kind: 'primary',
      onClick: async () => {
        d.close();
        const ok = await store.overwriteAfterConflict();
        toast(ok ? 'Deine Fassung wurde gespeichert.' : 'Speichern fehlgeschlagen.', ok ? 'ok' : 'error');
      },
    }),
  );
  await d.closed;
  conflictOpen = false;
}

/* ------------------------------------------------------------------ Router --------------------- */

function route(): void {
  const r = parseHash();
  currentRoute = r;
  const areaId = r.segs[0] ?? '';
  let area = AREAS.find((a) => a.id === areaId);
  if (!area || (area.perm && !store.can(area.perm))) area = AREAS[0];
  const isEditor = area.id === 'seiten' && r.segs.length >= 2 && r.segs[2] !== 'einstellungen';
  const isPageSettings = area.id === 'seiten' && r.segs[2] === 'einstellungen';
  for (const [id, link] of navLinks) {
    if (id === area.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  app.classList.toggle('is-editor', isEditor);
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  viewRoot.replaceChildren();
  viewRoot.scrollTop = 0;
  window.scrollTo(0, 0);
  const page = isEditor || isPageSettings ? store.doc.pages.find((p) => p.id === r.segs[1]) : undefined;
  titleEl.textContent = page ? `${isEditor ? 'Seite bearbeiten' : 'Seiteneinstellungen'}: ${page.title}` : area.label;
  document.title = `${page ? page.title : area.label} · Inhalte · Sauer & Saftig`;
  try {
    if (isEditor) cleanup = renderEditor(viewRoot, r);
    else if (isPageSettings) cleanup = renderPageSettings(viewRoot, r);
    else cleanup = area.view(viewRoot, r);
  } catch (e) {
    console.error(e);
    viewRoot.replaceChildren(h('div', { class: 'ad-viewpad' }, h('h1', { class: 'ad-h1' }, 'Hoppla'), h('p', null, 'Dieser Bereich konnte nicht angezeigt werden. Bitte lade die Seite neu.'), h('pre', { class: 'ad-log' }, String(e))));
  }
  refreshErrors(viewRoot);
  const h1 = viewRoot.querySelector<HTMLElement>('h1');
  if (document.activeElement === document.body || document.activeElement?.closest('.ad-side')) h1?.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ Start ---------------------- */

async function start(): Promise<void> {
  try {
    await store.load();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    setChildren(
      app,
      h(
        'div',
        { class: 'ad-boot ad-boot--error' },
        h('h1', { class: 'ad-h1' }, 'Das Dashboard konnte nicht geladen werden'),
        h('p', null, e instanceof ApiError && e.status === 403 ? 'Dein Zugang hat keine Berechtigung für die Inhaltsverwaltung.' : 'Der Server antwortet gerade nicht wie erwartet. Bitte versuche es in einer Minute noch einmal.'),
        h('p', { class: 'ad-help' }, e instanceof Error ? e.message : String(e)),
        h('p', null, h('a', { href: '/admin', class: 'ad-btn ad-btn--primary' }, 'Neu laden'), ' ', h('a', { href: '/logout', class: 'ad-btn ad-btn--quiet' }, 'Abmelden')),
      ),
    );
    return;
  }
  buildShell();
  store.addEventListener('status', renderStatus);
  store.addEventListener('build', renderStatus);
  store.addEventListener('issues', () => {
    renderIssuesBtn();
    refreshErrors(viewRoot);
  });
  store.addEventListener('conflict', () => void conflictDialog());
  store.addEventListener('doc', () => route());
  store.addEventListener('build-error', (e) => toast(String((e as CustomEvent).detail), 'error'));
  renderStatus();
  renderIssuesBtn();
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => {
    if (store.hasUnsaved || store.status === 'saving') {
      void store.save();
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void store.flush().then((ok) => toast(ok ? 'Gespeichert.' : store.statusMessage || 'Nicht gespeichert.', ok ? 'ok' : 'error', 2500));
    }
  });
  setInterval(() => {
    if (store.status === 'saved' && store.lastSavedAt) statusEl.title = `Zuletzt gespeichert ${relativeTime(store.lastSavedAt)}`;
  }, 30_000);
  route();
  if (!store.canEdit) toast('Du kannst die Inhalte ansehen, aber nicht ändern.', 'info', 7000);
  if (store.revision === 0 && !store.doc.pages.length) void alertDialog('Noch keine Inhalte', 'Der Inhaltsstand ist leer. Bitte Konrad Bescheid geben.');
}

void start();
void go;
