/** Seitenverwaltung: Liste, neue Seite, duplizieren, aktivieren/deaktivieren, löschen, Seiteneinstellungen (inkl. SEO). */
import type { NavItem, PageDoc, Section } from '../../cms/types';
import { previewUrl } from '../api';
import { allowedOn, sectionDef, SECTION_DEFS } from '../defs';
import { h, icon, domId, setChildren, type Child } from '../dom';
import { renderField, renderFields, refreshErrors } from '../fields';
import { pagePath } from '../rich';
import { flatNav, pageReferences } from '../scan';
import { store } from '../state';
import { badge, btn, card, cardTitle, confirmDialog, editable, emptyState, linkBtn, notice, openDialog, pageHeader, toast } from '../ui';
import { clone, slugify, truncate, uniqueId } from '../util';
import { slugProblem } from '../validate';
import { go, type Route } from '../view';

/* ------------------------------------------------------------------ SEO-Hilfen ------------------- */

export interface LengthRule {
  min: number;
  max: number;
}
export const TITLE_RULE: LengthRule = { min: 30, max: 60 };
export const DESC_RULE: LengthRule = { min: 70, max: 160 };

export function lengthState(n: number, r: LengthRule): { tone: 'ok' | 'warn' | 'error'; text: string } {
  if (n === 0) return { tone: 'error', text: 'fehlt' };
  if (n < r.min) return { tone: 'warn', text: 'eher kurz' };
  if (n > r.max) return { tone: 'warn', text: 'wird bei Google gekürzt' };
  return { tone: 'ok', text: 'gute Länge' };
}

/** Längen-Ampel unter einem Eingabefeld */
export function lengthMeter(get: () => string, rule: LengthRule): { el: HTMLElement; update(): void } {
  const bar = h('span', { class: 'ad-meter__bar' });
  const text = h('span', { class: 'ad-meter__text' });
  const el = h('div', { class: 'ad-meter', 'aria-live': 'polite' }, h('span', { class: 'ad-meter__track', 'aria-hidden': 'true' }, bar), text);
  const update = () => {
    const n = get().length;
    const s = lengthState(n, rule);
    el.className = `ad-meter ad-meter--${s.tone}`;
    bar.style.width = `${Math.min(100, (n / (rule.max * 1.25)) * 100)}%`;
    text.textContent = `${n} Zeichen — ${s.text} (ideal ${rule.min}–${rule.max})`;
  };
  update();
  return { el, update };
}

export function seoHints(p: PageDoc): { tone: 'ok' | 'warn' | 'error'; items: string[] } {
  if (p.seo?.noindex) return { tone: 'ok', items: ['nicht in Suchmaschinen'] };
  const items: string[] = [];
  let tone: 'ok' | 'warn' | 'error' = 'ok';
  const t = lengthState((p.seo?.title ?? '').length, TITLE_RULE);
  const d = lengthState((p.seo?.description ?? '').length, DESC_RULE);
  if (t.tone !== 'ok') items.push(`Titel ${t.text}`);
  if (d.tone !== 'ok') items.push(`Beschreibung ${d.text}`);
  if (t.tone === 'error' || d.tone === 'error') tone = 'error';
  else if (items.length) tone = 'warn';
  return { tone, items };
}

export function pageDisplayPath(p: PageDoc): string {
  if (p.system) return p.id === 'nicht-gefunden' ? '(Fehlerseite)' : '(System)';
  if (p.template === 'menu-category') return `/${p.slug.replace(/\/\*$/, '')}/<kategorie>`;
  return pagePath(p);
}

/** Pfad für die Vorschau einer Seite (Vorlagen: erste Kategorie) */
export function pagePreviewPath(p: PageDoc): string {
  if (p.template === 'menu-category') {
    const parent = p.slug.replace(/\/\*$/, '');
    const own = new Set(store.doc.pages.map((x) => x.slug));
    const cat = store.doc.collections.menu.find((c) => !own.has(`${parent}/${c.slug}`));
    return `/${parent}/${cat?.slug ?? ''}`;
  }
  if (p.system) return '/__seite-nicht-gefunden';
  return pagePath(p);
}

/** Adresse beim Laden (für den Hinweis „Weiterleitung wird angelegt“) */
const initialSlugs = new Map<string, string>();
store.addEventListener('doc', () => {
  initialSlugs.clear();
  for (const p of store.doc.pages) initialSlugs.set(p.id, p.slug);
});

/* ------------------------------------------------------------------ Aktionen --------------------- */

function newSection(type: string, page: PageDoc, overrides: Record<string, unknown> = {}): Section {
  const def = sectionDef(type);
  return {
    id: uniqueId(type, page.sections.map((s) => s.id)),
    type,
    visible: true,
    fields: { ...(def?.defaults() ?? {}), ...overrides },
  };
}

export async function newPageDialog(): Promise<void> {
  const d = openDialog({ title: 'Neue Seite anlegen', size: 'md' });
  const titleId = domId();
  const slugId = domId();
  const title = h('input', { id: titleId, class: 'ad-input', type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'z. B. Workshops' });
  const slug = h('input', { id: slugId, class: 'ad-input', type: 'text', maxlength: '80', autocomplete: 'off', spellcheck: 'false' });
  const slugMsg = h('p', { class: 'ad-errors', 'aria-live': 'polite' });
  let slugTouched = false;
  const check = () => {
    const prob = slug.value ? slugProblem(slug.value, store.doc) : 'Bitte eine Adresse angeben.';
    slugMsg.replaceChildren(prob ? h('p', { class: 'ad-err ad-err--error' }, icon('alert'), prob) : h('p', { class: 'ad-help' }, `Die Seite wird unter sauerundsaftig.de/${slug.value} erreichbar sein.`));
    return !prob;
  };
  title.addEventListener('input', () => {
    if (!slugTouched) slug.value = slugify(title.value);
    check();
  });
  slug.addEventListener('input', () => {
    slugTouched = true;
    slug.value = slug.value.toLowerCase().replace(/\s+/g, '-');
    check();
  });
  const generic = Object.values(SECTION_DEFS)
    .filter((def) => def.allowedOn === '*')
    .sort((a, b) => (a.type === 'text' ? -1 : b.type === 'text' ? 1 : a.label.localeCompare(b.label, 'de')));
  const picks = new Set<string>(generic.some((g) => g.type === 'hero') ? ['hero', 'text'] : generic.slice(0, 1).map((g) => g.type));
  const startBox = h(
    'fieldset',
    { class: 'ad-field' },
    h('legend', { class: 'ad-label' }, 'Startinhalt'),
    h('p', { class: 'ad-help' }, 'Womit soll die Seite beginnen? Du kannst später beliebig Sektionen hinzufügen, umsortieren oder löschen.'),
    h(
      'div',
      { class: 'ad-typegrid' },
      ...generic.map((def) => {
        const id = domId();
        const cb = h('input', { id, type: 'checkbox', checked: picks.has(def.type) });
        cb.addEventListener('change', () => (cb.checked ? picks.add(def.type) : picks.delete(def.type)));
        return h('label', { class: 'ad-typecard', for: id }, cb, h('span', null, h('strong', null, def.label), h('small', null, def.description)));
      }),
    ),
  );
  d.body.append(
    h('div', { class: 'ad-field' }, h('label', { class: 'ad-label', for: titleId }, 'Titel der Seite'), h('p', { class: 'ad-help' }, 'So heißt die Seite in der Verwaltung und als Überschrift.'), title),
    h(
      'div',
      { class: 'ad-field' },
      h('label', { class: 'ad-label', for: slugId }, 'Adresse (URL)'),
      h('p', { class: 'ad-help' }, 'Der Teil hinter sauerundsaftig.de/ — wird aus dem Titel vorgeschlagen. Nur Kleinbuchstaben, Ziffern und Bindestriche.'),
      h('div', { class: 'ad-prefixed' }, h('span', { class: 'ad-prefixed__pre', 'aria-hidden': 'true' }, 'sauerundsaftig.de/'), slug),
      slugMsg,
    ),
    generic.length ? startBox : notice('warn', h('p', null, 'Es gibt noch keine Sektionstypen für neue Seiten.')),
    h('p', { class: 'ad-help' }, 'Die Seite geht erst mit dem nächsten „Veröffentlichen“ online. Du kannst sie vorher deaktivieren.'),
  );
  const create = btn('Seite anlegen', { kind: 'primary', icon: 'plus' });
  d.footer.append(btn('Abbrechen', { kind: 'quiet', onClick: () => d.close() }), create);
  title.focus();
  create.addEventListener('click', () => {
    if (!title.value.trim()) {
      title.focus();
      slugMsg.replaceChildren(h('p', { class: 'ad-err ad-err--error' }, icon('alert'), 'Bitte einen Titel angeben.'));
      return;
    }
    if (!check()) {
      slug.focus();
      return;
    }
    const t = title.value.trim();
    const page: PageDoc = {
      id: uniqueId(slugify(t) || 'seite', store.doc.pages.map((p) => p.id)),
      slug: slug.value.replace(/^\/+|\/+$/g, ''),
      title: t,
      status: 'published',
      kind: 'custom',
      breadcrumb: t,
      showBreadcrumbs: false,
      seo: { title: `${t} · ${store.doc.settings.name || 'Sauer & Saftig'}`, description: '' },
      sections: [],
    };
    for (const type of generic.map((g) => g.type).filter((x) => picks.has(x))) {
      const def = sectionDef(type)!;
      const ov: Record<string, unknown> = {};
      if (def.fields.some((f) => f.key === 'title') && !page.sections.length) ov.title = t;
      page.sections.push(newSection(type, page, ov));
    }
    store.doc.pages.push(page);
    store.change({ structural: true });
    d.close();
    toast(`Seite „${t}“ angelegt.`, 'ok');
    go(`#/seiten/${page.id}`);
  });
}

export function duplicatePage(src: PageDoc): void {
  const copy = clone(src);
  copy.id = uniqueId(`${src.id}-kopie`, store.doc.pages.map((p) => p.id));
  const base = `${src.slug.replace(/\/\*$/, '') || 'start'}-kopie`;
  let s = base;
  for (let i = 2; store.doc.pages.some((p) => p.slug === s); i++) s = `${base}-${i}`;
  copy.slug = s;
  copy.title = `${src.title} (Kopie)`;
  copy.kind = 'custom';
  delete copy.system;
  delete copy.template;
  copy.status = 'disabled';
  const before = copy.sections.length;
  copy.sections = copy.sections.filter((sec) => {
    const def = sectionDef(sec.type);
    return def && allowedOn(def, copy);
  });
  const dropped = before - copy.sections.length;
  const idx = store.doc.pages.findIndex((p) => p.id === src.id);
  store.doc.pages.splice(idx + 1, 0, copy);
  store.change({ structural: true });
  toast(
    `Kopie angelegt (deaktiviert)${dropped ? ` — ${dropped} seitenspezifische Sektion${dropped === 1 ? '' : 'en'} konnte${dropped === 1 ? '' : 'n'} nicht übernommen werden` : ''}.`,
    'ok',
    7000,
  );
  go(`#/seiten/${copy.id}/einstellungen`);
}

export function canToggle(p: PageDoc): boolean {
  return !p.system && p.slug !== '';
}

export function togglePage(p: PageDoc): void {
  p.status = p.status === 'published' ? 'disabled' : 'published';
  store.change({ structural: true });
  toast(p.status === 'published' ? `„${p.title}“ ist wieder aktiv (nach dem Veröffentlichen online).` : `„${p.title}“ ist deaktiviert (nach dem Veröffentlichen offline).`, 'info');
}

export async function deletePage(p: PageDoc): Promise<boolean> {
  if (p.kind !== 'custom') return false;
  const refs = pageReferences(store.doc, p.id);
  const navRefs = (['main', 'footer', 'legal', 'social'] as const).flatMap((k) => flatNav(store.doc.navigation[k]).filter((n) => n.href === `page:${p.id}` || n.href.startsWith(`page:${p.id}#`)));
  const removeNavId = domId();
  const removeNav = h('input', { id: removeNavId, type: 'checkbox', checked: true });
  const ok = await confirmDialog({
    title: `Seite „${p.title}“ löschen?`,
    message: h(
      'div',
      null,
      h('p', null, `Die Seite ${pagePath(p)} und ihr Inhalt werden aus dem Entwurf entfernt. Mit „Entwurf verwerfen“ oder unter „Versionen“ lässt sich das rückgängig machen.`),
      refs.length
        ? notice(
            'warn',
            h('p', null, `${refs.length} Link${refs.length === 1 ? ' zeigt' : 's zeigen'} auf diese Seite und funktionieren danach nicht mehr:`),
            h('ul', { class: 'ad-issuelist' }, ...refs.slice(0, 10).map((r) => h('li', null, r.loc.label, r.label ? ` („${truncate(r.label, 40)}“)` : ''))),
          )
        : h('p', { class: 'ad-help' }, 'Keine anderen Stellen verlinken auf diese Seite.'),
      navRefs.length ? h('label', { class: 'ad-check', for: removeNavId }, removeNav, ` Die ${navRefs.length} Menüpunkt${navRefs.length === 1 ? '' : 'e'} in der Navigation mitlöschen`) : null,
    ),
    confirm: 'Seite löschen',
    danger: true,
  });
  if (!ok) return false;
  store.doc.pages = store.doc.pages.filter((x) => x.id !== p.id);
  if (navRefs.length && removeNav.checked) {
    const strip = (items: NavItem[]): NavItem[] =>
      items.filter((n) => !navRefs.includes(n)).map((n) => (n.children ? { ...n, children: strip(n.children) } : n));
    for (const k of ['main', 'footer', 'legal', 'social'] as const) store.doc.navigation[k] = strip(store.doc.navigation[k]);
  }
  store.change({ structural: true });
  toast(`Seite „${p.title}“ gelöscht.`, 'ok');
  return true;
}

/* ------------------------------------------------------------------ Liste ----------------------- */

export function renderPages(root: HTMLElement, route?: Route): () => void {
  const canEdit = store.canEdit;
  const list = h('div', { class: 'ad-table ad-table--pages', role: 'table', 'aria-label': 'Seiten' });
  const render = () => {
    const rows = store.doc.pages.map((p) => {
      const seo = seoHints(p);
      const issues = store.issues.filter((i) => i.level === 'error' && i.path.startsWith(`pages.${store.doc.pages.indexOf(p)}.`)).length;
      const more = h(
        'details',
        { class: 'ad-more ad-more--row' },
        h('summary', { class: 'ad-iconbtn', 'aria-label': `Weitere Aktionen für „${p.title}“`, title: 'Weitere Aktionen' }, icon('more')),
        h(
          'div',
          { class: 'ad-more__menu', role: 'menu' },
          h('a', { class: 'ad-more__item', role: 'menuitem', href: `#/seiten/${p.id}/einstellungen` }, icon('settings'), 'Einstellungen & SEO'),
          h('a', { class: 'ad-more__item', role: 'menuitem', href: previewUrl(pagePreviewPath(p)), target: '_blank', rel: 'noopener' }, icon('external'), 'Vorschau öffnen'),
          canEdit && !p.system && !p.template
            ? h('button', { type: 'button', class: 'ad-more__item', role: 'menuitem', onclick: () => duplicatePage(p) }, icon('copy'), 'Duplizieren')
            : null,
          canEdit && canToggle(p)
            ? h('button', { type: 'button', class: 'ad-more__item', role: 'menuitem', onclick: () => { togglePage(p); render(); } }, icon(p.status === 'published' ? 'eyeOff' : 'eye'), p.status === 'published' ? 'Deaktivieren' : 'Aktivieren')
            : null,
          canEdit && p.kind === 'custom'
            ? h('button', { type: 'button', class: 'ad-more__item ad-more__item--danger', role: 'menuitem', onclick: async () => { if (await deletePage(p)) render(); } }, icon('trash'), 'Löschen')
            : null,
        ),
      );
      return h(
        'div',
        { class: `ad-row${p.status !== 'published' ? ' is-muted' : ''}`, role: 'row' },
        h(
          'div',
          { class: 'ad-cell ad-cell--main', role: 'cell' },
          h('a', { href: `#/seiten/${p.id}`, class: 'ad-row__title' }, p.title),
          h('span', { class: 'ad-row__sub' }, pageDisplayPath(p)),
        ),
        h(
          'div',
          { class: 'ad-cell', role: 'cell' },
          p.status === 'published' ? badge('Aktiv', 'ok') : badge('Deaktiviert', 'neutral'),
          p.kind === 'custom' ? badge('Eigene Seite', 'info') : null,
          issues ? badge(`${issues} Fehler`, 'error') : null,
        ),
        h(
          'div',
          { class: 'ad-cell ad-cell--seo', role: 'cell' },
          h('span', { class: `ad-dot ad-dot--${seo.tone}`, 'aria-hidden': 'true' }),
          h('span', null, seo.items.length ? seo.items.join(' · ') : 'SEO in Ordnung'),
        ),
        h('div', { class: 'ad-cell ad-cell--actions', role: 'cell' }, linkBtn('Bearbeiten', `#/seiten/${p.id}`, { kind: 'secondary', small: true, icon: 'edit' }), more),
      );
    });
    list.replaceChildren(
      h(
        'div',
        { class: 'ad-row ad-row--head', role: 'row' },
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Seite & Adresse'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Status'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'SEO'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, h('span', { class: 'sr-only' }, 'Aktionen')),
      ),
      ...rows,
    );
    if (!rows.length) list.append(emptyState('Noch keine Seiten.'));
  };
  render();
  root.append(
    h(
      'div',
      { class: 'ad-viewpad' },
      pageHeader(
        'Seiten',
        'Alle Seiten der Website. „Bearbeiten“ öffnet den Seiteneditor mit Live-Vorschau; Adresse, Titel und SEO findest du unter „Einstellungen & SEO“.',
        canEdit ? btn('Neue Seite', { kind: 'primary', icon: 'plus', onClick: () => void newPageDialog() }) : null,
      ),
      list,
    ),
  );
  // Nach Prüfungen nur neu aufbauen, wenn sich Fehlerzahlen geändert haben (Fokus bleibt sonst erhalten)
  const signature = () => store.doc.pages.map((_, i) => store.issues.filter((x) => x.level === 'error' && x.path.startsWith(`pages.${i}.`)).length).join(',');
  let lastSig = signature();
  const onIssues = () => {
    const sig = signature();
    if (sig !== lastSig) {
      lastSig = sig;
      render();
    }
  };
  store.addEventListener('issues', onIssues);
  if (route?.query.get('neu') === '1' && canEdit) {
    history.replaceState(null, '', '#/seiten');
    void newPageDialog();
  }
  return () => store.removeEventListener('issues', onIssues);
}

/* ------------------------------------------------------------------ Seiteneinstellungen ----------- */

export function renderPageSettings(root: HTMLElement, route: Route): void {
  const page = store.doc.pages.find((p) => p.id === route.segs[1]);
  if (!page) {
    root.append(h('div', { class: 'ad-viewpad' }, pageHeader('Seite nicht gefunden'), emptyState('Diese Seite gibt es nicht (mehr).', linkBtn('Zur Seitenliste', '#/seiten'))));
    return;
  }
  const pi = store.doc.pages.indexOf(page);
  const ro = !store.canEdit;
  const base = ['pages', pi];

  // Titel & Status
  const titleField = renderField({ key: 'title', label: 'Titel der Seite', kind: 'text', required: true, maxLength: 80, help: 'Name in der Seitenverwaltung und in Brotkrumen.' }, page as unknown as Record<string, unknown>, { path: base });

  // Adresse
  const slugId = domId();
  const slugEditable = !page.system && page.template !== 'menu-category' && page.slug !== '';
  const slugInput = h('input', { id: slugId, class: 'ad-input', type: 'text', value: page.slug.replace(/\/\*$/, ''), spellcheck: 'false', autocomplete: 'off', readonly: !slugEditable });
  const slugMsg = h('div', { 'aria-live': 'polite' });
  const slugCheck = () => {
    const initial = initialSlugs.get(page.id) ?? page.slug;
    const prob = slugEditable ? slugProblem(slugInput.value, store.doc, page.id) : null;
    setChildren(slugMsg, 
      prob ? h('p', { class: 'ad-err ad-err--error' }, icon('alert'), prob) : null,
      !prob && slugEditable && slugInput.value !== initial
        ? notice('info', h('p', null, `Neue Adresse: /${slugInput.value}. Beim Veröffentlichen wird automatisch eine Weiterleitung von /${initial} auf /${slugInput.value} angelegt — alte Links und Google-Einträge funktionieren weiter. Links innerhalb der Website passen sich von selbst an.`))
        : null,
    );
    return !prob;
  };
  slugInput.addEventListener('input', () => {
    slugInput.value = slugInput.value.toLowerCase().replace(/\s+/g, '-');
    if (slugCheck()) {
      page.slug = slugInput.value;
      store.change({ structural: true });
    }
  });
  slugCheck();
  const slugField = h(
    'div',
    { class: 'ad-field' },
    h('label', { class: 'ad-label', for: slugId }, 'Adresse (URL)'),
    h(
      'p',
      { class: 'ad-help' },
      slugEditable
        ? 'Der Teil hinter sauerundsaftig.de/. Nur Kleinbuchstaben, Ziffern, Bindestriche und /.'
        : page.slug === ''
          ? 'Die Startseite liegt immer unter sauerundsaftig.de/.'
          : page.template
            ? 'Vorlage: für jede Karten-Kategorie entsteht eine eigene Seite. Die Adressen legst du bei der Kategorie fest (Bereich „Karte“).'
            : 'Systemseite — Adresse ist fest.',
    ),
    h('div', { class: 'ad-prefixed' }, h('span', { class: 'ad-prefixed__pre', 'aria-hidden': 'true' }, 'sauerundsaftig.de/'), slugInput, page.template ? h('span', { class: 'ad-prefixed__pre' }, '/<kategorie>') : null),
    slugMsg,
    h('div', { class: 'ad-errors', dataset: { errPath: [...base, 'slug'].join('.'), errPrefix: '' } }),
  );

  const statusId = domId();
  const status = h('input', { id: statusId, type: 'checkbox', class: 'ad-switch__input', role: 'switch', checked: page.status === 'published', disabled: !canToggle(page) });
  status.addEventListener('change', () => {
    page.status = status.checked ? 'published' : 'disabled';
    store.change({ structural: true });
  });
  const statusField = h(
    'div',
    { class: 'ad-field ad-field--boolean' },
    h('label', { class: 'ad-switch', for: statusId }, status, h('span', { class: 'ad-switch__track', 'aria-hidden': 'true' }), h('span', { class: 'ad-switch__label' }, 'Seite ist aktiv (nach dem Veröffentlichen öffentlich erreichbar)')),
    !canToggle(page) ? h('p', { class: 'ad-help ad-help--indent' }, 'Diese Seite kann nicht deaktiviert werden.') : null,
  );

  // Brotkrumen
  const crumbs = renderFields(
    [
      { key: 'showBreadcrumbs', label: 'Brotkrumen-Navigation anzeigen („Start › Karte › Kuchen“)', kind: 'boolean' },
      { key: 'breadcrumb', label: 'Beschriftung in den Brotkrumen', kind: 'text', maxLength: 40, help: 'Leer = Titel der Seite.' },
    ],
    page as unknown as Record<string, unknown>,
    { path: base },
  );

  // SEO
  page.seo ??= { title: '', description: '' };
  const seo = page.seo as unknown as Record<string, unknown>;
  const seoPath = [...base, 'seo'];
  const snippetTitle = h('span', { class: 'ad-snippet__title' });
  const snippetUrl = h('span', { class: 'ad-snippet__url' });
  const snippetDesc = h('span', { class: 'ad-snippet__desc' });
  const updateSnippet = () => {
    const site = (store.doc.settings.siteUrl || 'https://sauerundsaftig.de').replace(/\/$/, '');
    snippetTitle.textContent = truncate(String(seo.title || page.title), 62);
    snippetUrl.textContent = `${site.replace(/^https?:\/\//, '')}${pageDisplayPath(page) === '/' ? '' : ` › ${pageDisplayPath(page).replace(/^\//, '').replaceAll('/', ' › ')}`}`;
    snippetDesc.textContent = truncate(String(seo.description || '(keine Beschreibung — Google wählt selbst einen Textausschnitt)'), 160);
  };
  const seoTitleId = domId();
  const seoTitle = h('input', { id: seoTitleId, class: 'ad-input', type: 'text', value: String(seo.title ?? ''), autocomplete: 'off' });
  const titleMeter = lengthMeter(() => seoTitle.value, TITLE_RULE);
  seoTitle.addEventListener('input', () => {
    seo.title = seoTitle.value;
    titleMeter.update();
    updateSnippet();
    store.change({});
  });
  const seoDescId = domId();
  const seoDesc = h('textarea', { id: seoDescId, class: 'ad-input ad-textarea', rows: '3' });
  seoDesc.value = String(seo.description ?? '');
  const descMeter = lengthMeter(() => seoDesc.value, DESC_RULE);
  seoDesc.addEventListener('input', () => {
    seo.description = seoDesc.value;
    descMeter.update();
    updateSnippet();
    store.change({});
  });
  updateSnippet();
  const seoTop = h(
    'div',
    { class: 'ad-fields' },
    h(
      'div',
      { class: 'ad-field' },
      h('label', { class: 'ad-label', for: seoTitleId }, 'Titel für Suchmaschinen und Browser-Tab'),
      h('p', { class: 'ad-help' }, page.template ? '{kategorie} wird durch den Namen der Kategorie ersetzt.' : 'Erscheint als blaue Überschrift bei Google.'),
      seoTitle,
      titleMeter.el,
      h('div', { class: 'ad-errors', dataset: { errPath: [...seoPath, 'title'].join('.'), errPrefix: '' } }),
    ),
    h(
      'div',
      { class: 'ad-field' },
      h('label', { class: 'ad-label', for: seoDescId }, 'Beschreibung für Suchmaschinen'),
      h('p', { class: 'ad-help' }, 'Ein bis zwei Sätze, die Lust auf die Seite machen. Erscheint unter dem Titel bei Google.'),
      seoDesc,
      descMeter.el,
      h('div', { class: 'ad-errors', dataset: { errPath: [...seoPath, 'description'].join('.'), errPrefix: '' } }),
    ),
    h('figure', { class: 'ad-snippet', 'aria-label': 'So ungefähr sieht die Seite bei Google aus' }, h('figcaption', { class: 'ad-sublabel' }, 'Vorschau bei Google (ungefähr)'), snippetUrl, snippetTitle, snippetDesc),
  );
  const seoMore = renderFields(
    [
      { key: 'ogTitle', label: 'Titel beim Teilen (WhatsApp, Facebook …)', kind: 'text', maxLength: 90, help: 'Leer = Titel für Suchmaschinen.' },
      { key: 'ogDescription', label: 'Beschreibung beim Teilen', kind: 'textarea', maxLength: 200, help: 'Leer = Beschreibung für Suchmaschinen.' },
      { key: 'ogImage', label: 'Vorschaubild beim Teilen', kind: 'media', help: 'Leer = Standard-Vorschaubild (Bereich SEO). Ideal: Querformat.' },
      { key: 'canonical', label: 'Kanonische Adresse (nur für Fachleute)', kind: 'text', input: 'url', help: 'Leer lassen = automatisch. Nur ausfüllen, wenn dieselben Inhalte unter einer anderen Adresse die „Hauptversion“ sind.' },
      { key: 'noindex', label: 'Nicht in Suchmaschinen anzeigen (noindex)', kind: 'boolean', help: 'Die Seite bleibt erreichbar, erscheint aber nicht bei Google und nicht in der Sitemap.' },
    ],
    seo,
    { path: seoPath },
  );

  const danger: Child[] = [];
  if (!ro && !page.system && !page.template)
    danger.push(btn('Seite duplizieren', { kind: 'secondary', icon: 'copy', onClick: () => duplicatePage(page) }));
  if (!ro && page.kind === 'custom')
    danger.push(btn('Seite löschen', { kind: 'danger', icon: 'trash', onClick: async () => { if (await deletePage(page)) go('#/seiten'); } }));

  root.append(
    h(
      'div',
      { class: 'ad-viewpad ad-viewpad--narrow' },
      h('p', { class: 'ad-crumbs' }, h('a', { href: '#/seiten' }, 'Seiten'), ' › ', page.title),
      pageHeader(
        `Einstellungen: ${page.title}`,
        'Titel, Adresse, Sichtbarkeit und alles, was Suchmaschinen und geteilte Links von dieser Seite zeigen.',
        h('div', { class: 'ad-btnrow' }, linkBtn('Inhalt bearbeiten', `#/seiten/${page.id}`, { kind: 'primary', icon: 'edit', small: true }), linkBtn('Vorschau', previewUrl(pagePreviewPath(page)), { icon: 'external', small: true, newTab: true })),
      ),
      editable(
        ro,
        card(cardTitle('Allgemein'), h('div', { class: 'ad-fields' }, titleField, slugField, statusField)),
        card(cardTitle('Brotkrumen', 'Kleine Pfadangabe oben auf der Seite, z. B. „Start › Karte › Kuchen“.'), crumbs),
        card(cardTitle('Suchmaschinen & Teilen (SEO)'), seoTop, seoMore),
        danger.length ? card(cardTitle('Seite duplizieren oder löschen'), h('div', { class: 'ad-btnrow' }, ...danger)) : null,
      ),
    ),
  );
  refreshErrors(root);
}
