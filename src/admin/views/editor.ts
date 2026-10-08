/**
 * Seiteneditor: links Sektionsliste, Mitte Live-Vorschau (iframe, Vorschau-Build mit Editor-Brücke),
 * rechts Formular der gewählten Sektion. Brücken-Protokoll (docs/CMS-PLAN.md §8):
 *   iframe → Admin  { type:'sus-cms:ready' } · { type:'sus-cms:select', field:'<sektion>:<pfad>', section }
 *   Admin → iframe  { type:'sus-cms:set', field, kind, value, html?, src?, href? } · { type:'sus-cms:focus', section }
 * Text-/Bild-/Link-Änderungen erscheinen sofort; Strukturänderungen lösen nach dem Speichern einen
 * Vorschau-Build aus, danach lädt das iframe neu (Scrollposition bleibt).
 */
import type { PageDoc, Section } from '../../cms/types';
import { editorUrl, ensurePreviewCookie } from '../api';
import { allowedSectionTypes, sectionDef, sectionDefaults } from '../defs';
import { add, h, icon, domId } from '../dom';
import { focusFieldPath, refreshErrors, renderFields } from '../fields';
import { store, type LiveMsg } from '../state';
import { badge, btn, confirmDialog, emptyState, iconBtn, linkBtn, notice, openDialog, toast } from '../ui';
import { clone, isPlainObject, moveItem, truncate, uniqueId } from '../util';
import type { Route } from '../view';
import { pagePreviewPath, pageDisplayPath } from './pages';

const DEVICES = [
  { id: 'mobile', label: 'Handy', width: 390, icon: 'smartphone' as const },
  { id: 'tablet', label: 'Tablet', width: 768, icon: 'tablet' as const },
  { id: 'desktop', label: 'Desktop', width: 1280, icon: 'monitor' as const },
];
const LAZY_PREVIEW_MS = 15_000;

/**
 * Adressen, unter denen eine Seite in einem fertigen Build liegt (ungefähr: Stand beim Laden bzw. beim
 * letzten erfolgreichen Vorschau-Build). Neue oder umbenannte Seiten zeigt das iframe erst nach dem
 * nächsten Vorschau-Build — vorher käme nur die 404-Seite.
 */
const builtSlugs = new Map<string, string>();
/** Vorschau-Cookie in dieser Sitzung schon gesetzt? (gilt 12 h) */
let previewCookieSet = false;
const rememberBuilt = () => {
  builtSlugs.clear();
  for (const p of store.doc.pages) if (p.status === 'published') builtSlugs.set(p.id, p.slug);
};
store.addEventListener('doc', rememberBuilt);
store.addEventListener('build', (e) => {
  const prev = (e as CustomEvent<{ prevPreview?: { state: string } | null }>).detail?.prevPreview;
  if (prev && (prev.state === 'queued' || prev.state === 'running') && store.preview?.state === 'ok') rememberBuilt();
});

/** Vorschaupfad, falls die Route eine Seite betrifft (für „Vorschau ansehen“ in der Kopfleiste) */
export function editorPreviewPath(route: Route): string | null {
  if (route.segs[0] !== 'seiten' || !route.segs[1]) return null;
  const p = store.doc.pages.find((x) => x.id === route.segs[1]);
  return p ? pagePreviewPath(p) : null;
}

function sectionSummary(s: Section): string {
  const f = isPlainObject(s.fields) ? s.fields : {};
  for (const k of ['title', 'heading', 'headline', 'name', 'eyebrow', 'quote', 'text', 'intro', 'body']) {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) return truncate(v.replace(/[*[\]]/g, ''), 60);
  }
  const def = sectionDef(s.type);
  const firstText = def?.fields.find((d) => (d.kind === 'text' || d.kind === 'textarea') && typeof f[d.key] === 'string' && (f[d.key] as string).trim());
  return firstText ? truncate(String(f[firstText.key]), 60) : '';
}

export function renderEditor(root: HTMLElement, route: Route): () => void {
  const page = store.doc.pages.find((p) => p.id === route.segs[1]);
  if (!page) {
    root.append(h('div', { class: 'ad-viewpad' }, h('h1', { class: 'ad-h1' }, 'Seite nicht gefunden'), emptyState('Diese Seite gibt es nicht (mehr).', linkBtn('Zur Seitenliste', '#/seiten'))));
    return () => {};
  }
  const pi = () => store.doc.pages.indexOf(page);
  const ro = !store.canEdit;
  let selectedId: string | null = route.query.get('sektion') ?? page.sections[0]?.id ?? null;
  if (selectedId && !page.sections.some((s) => s.id === selectedId)) selectedId = page.sections[0]?.id ?? null;
  const disposers: (() => void)[] = [];
  const on = (type: string, fn: EventListener) => {
    store.addEventListener(type, fn);
    disposers.push(() => store.removeEventListener(type, fn));
  };

  /* ---------------------------------------------------------------- Kopf ---------------------- */
  const pageSel = h(
    'select',
    { class: 'ad-input ad-input--sm', 'aria-label': 'Andere Seite bearbeiten' },
    ...store.doc.pages.map((p) => h('option', { value: p.id, selected: p.id === page.id }, `${p.title}${p.status !== 'published' ? ' (deaktiviert)' : ''}`)),
  );
  pageSel.addEventListener('change', () => (location.hash = `#/seiten/${pageSel.value}`));
  let device = localStorage.getItem('sus-admin-device') ?? (window.innerWidth >= 1500 ? 'desktop' : 'mobile');
  const deviceBtns = DEVICES.map((d) => {
    const b = iconBtn(d.icon, `Vorschau: ${d.label} (${d.width} px)`, () => {
      device = d.id;
      localStorage.setItem('sus-admin-device', device);
      deviceBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(DEVICES[i].id === device)));
      layoutFrame();
    }, { pressed: d.id === device });
    return b;
  });
  const previewState = h('span', { class: 'ad-pstate', role: 'status', 'aria-live': 'polite' });
  const tabs = ['Sektionen', 'Vorschau', 'Bearbeiten'].map((t, i) =>
    h('button', { type: 'button', role: 'tab', class: 'ad-etab', 'aria-selected': String(i === 2), dataset: { pane: String(i) } }, t),
  );
  const tabBar = h('div', { class: 'ad-etabs', role: 'tablist', 'aria-label': 'Ansicht' }, ...tabs);
  const showPane = (i: number) => {
    tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
    cols.dataset.pane = String(i);
    if (i === 1) layoutFrame();
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => showPane(i)));

  const bar = h(
    'div',
    { class: 'ad-editor__bar' },
    h('div', { class: 'ad-editor__page' }, pageSel, h('span', { class: 'ad-editor__path' }, pageDisplayPath(page)), page.status !== 'published' ? badge('deaktiviert', 'neutral') : null),
    tabBar,
    h('div', { class: 'ad-editor__tools' }, previewState, h('div', { class: 'ad-seg', role: 'group', 'aria-label': 'Vorschaubreite' }, ...deviceBtns), iconBtn('refresh', 'Vorschau neu laden', () => reloadFrame(true)), linkBtn(h('span', { class: 'ad-hide-md' }, 'Einstellungen & SEO'), `#/seiten/${page.id}/einstellungen`, { small: true, icon: 'settings', kind: 'quiet' })),
  );

  /* ---------------------------------------------------------------- Sektionsliste ------------- */
  const secList = h('ol', { class: 'ad-seclist', 'aria-label': 'Sektionen der Seite' });
  const secSr = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  let dragFrom = -1;

  const structural = (msg?: string) => {
    store.change({ structural: true });
    renderSections();
    if (msg) secSr.textContent = msg;
  };

  const renderSections = () => {
    secList.replaceChildren(
      ...page.sections.map((s, i) => {
        const def = sectionDef(s.type);
        const sel = s.id === selectedId;
        const main = h(
          'button',
          { type: 'button', class: 'ad-sec__main', 'aria-current': sel ? 'true' : undefined, title: `${def?.label ?? s.type}${sectionSummary(s) ? `: ${sectionSummary(s)}` : ''}` },
          h('span', { class: 'ad-sec__type' }, def?.label ?? s.type),
          h('span', { class: 'ad-sec__sum' }, sectionSummary(s) || (def ? def.description : 'Unbekannter Typ')),
        );
        main.addEventListener('click', () => {
          select(s.id);
          if (cols.dataset.pane === '0') showPane(2);
        });
        const more = h(
          'details',
          { class: 'ad-more ad-more--row' },
          h('summary', { class: 'ad-iconbtn', 'aria-label': `Weitere Aktionen für ${def?.label ?? s.type}`, title: 'Weitere Aktionen' }, icon('more')),
          h(
            'div',
            { class: 'ad-more__menu', role: 'menu' },
            h('button', { type: 'button', class: 'ad-more__item', role: 'menuitem', disabled: ro, onclick: () => duplicateSection(i) }, icon('copy'), 'Duplizieren'),
            h('button', { type: 'button', class: 'ad-more__item', role: 'menuitem', disabled: ro, onclick: () => addSectionDialog(i) }, icon('plus'), 'Neue Sektion darunter'),
            h('button', { type: 'button', class: 'ad-more__item ad-more__item--danger', role: 'menuitem', disabled: ro, onclick: () => void deleteSection(i) }, icon('trash'), 'Löschen'),
          ),
        );
        const grip = h('span', { class: 'ad-item__grip', title: 'Ziehen zum Sortieren', 'aria-hidden': 'true' }, icon('grip'));
        const li = h(
          'li',
          { class: `ad-sec${sel ? ' is-selected' : ''}${s.visible === false ? ' is-hidden' : ''}`, dataset: { id: s.id } },
          ro ? null : grip,
          main,
          h('span', { class: 'ad-sec__err', dataset: { index: String(i) } }),
          h(
            'div',
            { class: 'ad-sec__tools' },
            iconBtn(s.visible === false ? 'eyeOff' : 'eye', s.visible === false ? `${def?.label ?? s.type} einblenden` : `${def?.label ?? s.type} ausblenden`, () => {
              s.visible = s.visible === false;
              structural(s.visible ? 'Sektion eingeblendet.' : 'Sektion ausgeblendet.');
              if (s.id === selectedId) renderForm();
            }, { pressed: s.visible === false, disabled: ro }),
            iconBtn('up', 'Nach oben', () => {
              moveItem(page.sections, i, i - 1);
              structural(`Nach oben verschoben, jetzt Position ${i}.`);
              (secList.children[i - 1]?.querySelectorAll('.ad-sec__tools button')[1] as HTMLElement | undefined)?.focus();
            }, { disabled: ro || i === 0 }),
            iconBtn('down', 'Nach unten', () => {
              moveItem(page.sections, i, i + 1);
              structural(`Nach unten verschoben, jetzt Position ${i + 2}.`);
              (secList.children[i + 1]?.querySelectorAll('.ad-sec__tools button')[2] as HTMLElement | undefined)?.focus();
            }, { disabled: ro || i === page.sections.length - 1 }),
            more,
          ),
        );
        if (!ro) {
          grip.addEventListener('mousedown', () => li.setAttribute('draggable', 'true'));
          li.addEventListener('dragstart', (e) => {
            if (li.getAttribute('draggable') !== 'true') return e.preventDefault();
            dragFrom = i;
            li.classList.add('is-dragging');
            e.dataTransfer?.setData('text/plain', s.id);
          });
          li.addEventListener('dragend', () => {
            li.removeAttribute('draggable');
            li.classList.remove('is-dragging');
            secList.querySelectorAll('.is-drop-before,.is-drop-after').forEach((x) => x.classList.remove('is-drop-before', 'is-drop-after'));
          });
          li.addEventListener('dragover', (e) => {
            if (dragFrom < 0) return;
            e.preventDefault();
            const r = li.getBoundingClientRect();
            const after = e.clientY > r.top + r.height / 2;
            li.classList.toggle('is-drop-after', after);
            li.classList.toggle('is-drop-before', !after);
          });
          li.addEventListener('dragleave', () => li.classList.remove('is-drop-before', 'is-drop-after'));
          li.addEventListener('drop', (e) => {
            if (dragFrom < 0) return;
            e.preventDefault();
            const r = li.getBoundingClientRect();
            let to = e.clientY > r.top + r.height / 2 ? i + 1 : i;
            if (dragFrom < to) to -= 1;
            const from = dragFrom;
            dragFrom = -1;
            if (from !== to) {
              moveItem(page.sections, from, to);
              structural(`Sektion auf Position ${to + 1} verschoben.`);
            } else renderSections();
          });
        }
        return li;
      }),
    );
    if (!page.sections.length) secList.append(h('li', { class: 'ad-help ad-seclist__empty' }, 'Diese Seite hat noch keine Sektionen.'));
    updateSectionErrors();
  };

  /** Fehlerzahl je Sektion (ohne die Liste neu aufzubauen — Fokus bleibt erhalten) */
  const updateSectionErrors = () => {
    secList.querySelectorAll<HTMLElement>('.ad-sec__err').forEach((slot) => {
      const n = store.issues.filter((x) => x.level === 'error' && x.path.startsWith(`pages.${pi()}.sections.${slot.dataset.index}.`)).length;
      slot.replaceChildren(n ? h('span', { class: 'ad-badge ad-badge--error', title: `${n} Fehler in dieser Sektion` }, icon('alert'), String(n)) : '');
    });
  };

  const duplicateSection = (i: number) => {
    const src = page.sections[i];
    const copy = clone(src);
    copy.id = uniqueId(src.type, page.sections.map((s) => s.id));
    page.sections.splice(i + 1, 0, copy);
    selectedId = copy.id;
    structural('Sektion dupliziert.');
    renderForm();
  };

  const deleteSection = async (i: number) => {
    const s = page.sections[i];
    const def = sectionDef(s.type);
    const ok = await confirmDialog({
      title: 'Sektion löschen?',
      message: `„${def?.label ?? s.type}${sectionSummary(s) ? `: ${sectionSummary(s)}` : ''}“ wird von der Seite entfernt. Tipp: Mit dem Auge kannst du eine Sektion auch nur ausblenden.`,
      confirm: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    page.sections.splice(i, 1);
    if (selectedId === s.id) selectedId = page.sections[Math.min(i, page.sections.length - 1)]?.id ?? null;
    structural('Sektion gelöscht.');
    renderForm();
  };

  const addSectionDialog = (afterIndex?: number) => {
    const types = allowedSectionTypes(page);
    const d = openDialog({ title: 'Sektion hinzufügen', size: 'lg' });
    if (!types.length) {
      add(d.body, notice('info', h('p', null, 'Für diese Seite gibt es keine weiteren Sektionstypen.')));
      d.footer.append(btn('Schließen', { kind: 'primary', onClick: () => d.close() }));
      return;
    }
    const idx = afterIndex ?? (selectedId ? page.sections.findIndex((s) => s.id === selectedId) : page.sections.length - 1);
    const posName = `pos-${domId()}`;
    const after = h('input', { type: 'radio', name: posName, value: 'after', checked: idx >= 0 && idx < page.sections.length - 1 });
    const end = h('input', { type: 'radio', name: posName, value: 'end', checked: !(idx >= 0 && idx < page.sections.length - 1) });
    add(d.body,
      idx >= 0 && idx < page.sections.length - 1
        ? h(
            'fieldset',
            { class: 'ad-field' },
            h('legend', { class: 'ad-label' }, 'Wo einfügen?'),
            h('div', { class: 'ad-checks' }, h('label', { class: 'ad-check' }, after, ` Nach „${sectionDef(page.sections[idx].type)?.label ?? page.sections[idx].type}“`), h('label', { class: 'ad-check' }, end, ' Am Ende der Seite')),
          )
        : null,
      h(
        'div',
        { class: 'ad-typegrid ad-typegrid--pick' },
        ...types.map((def) =>
          h(
            'button',
            {
              type: 'button',
              class: 'ad-typecard',
              onclick: () => {
                const s: Section = { id: uniqueId(def.type, page.sections.map((x) => x.id)), type: def.type, visible: true, fields: sectionDefaults(def) };
                const at = after.checked && idx >= 0 ? idx + 1 : page.sections.length;
                page.sections.splice(at, 0, s);
                selectedId = s.id;
                d.close();
                structural(`Sektion „${def.label}“ hinzugefügt.`);
                renderForm();
                showPane(2);
                toast(`„${def.label}“ hinzugefügt — die Vorschau aktualisiert sich gleich.`, 'ok');
              },
            },
            h('strong', null, def.label),
            h('small', null, def.description),
          ),
        ),
      ),
    );
    d.footer.append(btn('Abbrechen', { kind: 'quiet', onClick: () => d.close() }));
  };

  const addBtn = btn('Sektion hinzufügen', { kind: 'secondary', icon: 'plus', small: true, disabled: ro, onClick: () => addSectionDialog() });
  const secPane = h(
    'section',
    { class: 'ad-editor__sections ad-pane', 'aria-labelledby': 'ad-sec-h' },
    h('div', { class: 'ad-pane__head' }, h('h2', { id: 'ad-sec-h', class: 'ad-h3' }, 'Sektionen'), h('span', { class: 'ad-help' }, 'Reihenfolge = Reihenfolge auf der Seite')),
    secList,
    h('div', { class: 'ad-pane__foot' }, addBtn),
    secSr,
  );

  /* ---------------------------------------------------------------- Formular ------------------ */
  const formPane = h('section', { class: 'ad-editor__form ad-pane', 'aria-label': 'Sektion bearbeiten' });
  const renderForm = () => {
    formPane.replaceChildren();
    const si = page.sections.findIndex((s) => s.id === selectedId);
    const s = page.sections[si];
    if (!s) {
      formPane.append(h('div', { class: 'ad-pane__pad' }, emptyState('Wähle links eine Sektion — oder klicke in der Vorschau auf einen Text oder ein Bild.')));
      return;
    }
    const def = sectionDef(s.type);
    s.fields ??= {};
    formPane.append(
      h(
        'div',
        { class: 'ad-pane__head ad-pane__head--form' },
        h('div', null, h('p', { class: 'ad-eyebrow' }, `Sektion ${si + 1} von ${page.sections.length}`), h('h2', { class: 'ad-h2' }, def?.label ?? s.type)),
        s.visible === false ? badge('ausgeblendet', 'neutral') : null,
      ),
      h(
        'div',
        { class: 'ad-pane__pad' },
        def ? h('p', { class: 'ad-help' }, def.description) : null,
        s.visible === false ? notice('info', h('p', null, 'Diese Sektion ist ausgeblendet und erscheint nicht auf der Website (und nicht in der Vorschau).')) : null,
        def
          ? h('fieldset', { class: 'ad-editable', disabled: ro }, renderFields(def.fields, s.fields as Record<string, unknown>, { path: ['pages', pi(), 'sections', si, 'fields'], live: { section: s.id, prefix: '' } }))
          : notice('warn', h('p', null, `Für den Sektionstyp „${s.type}“ gibt es noch kein Formular. Inhalt bleibt unverändert erhalten.`)),
      ),
    );
    refreshErrors(formPane);
  };

  /* ---------------------------------------------------------------- Vorschau-iframe ------------ */
  const iframe = h('iframe', { class: 'ad-frame', title: `Live-Vorschau: ${page.title}`, src: 'about:blank' });
  const scaler = h('div', { class: 'ad-frame-scale' }, iframe);
  const overlay = h('div', { class: 'ad-frame-overlay', hidden: true });
  const blocker = h('div', { class: 'ad-frame-blocker', hidden: true, role: 'status' });
  const wrap = h('div', { class: 'ad-frame-wrap' }, scaler, overlay, blocker);
  const previewPane = h('section', { class: 'ad-editor__preview ad-pane', 'aria-label': 'Live-Vorschau' }, wrap);
  let ready = false;
  let pendingScroll: number | null = null;
  /** Live-Änderungen seit dem letzten Vorschau-Build (nach dem Neuladen erneut anwenden) */
  const liveSince = new Map<string, { msg: LiveMsg; at: number }>();
  /** Einträge entfernen, die der fertige Vorschau-Build schon enthält */
  const pruneLive = () => {
    for (const [k, v] of liveSince) if (v.at <= store.previewRequestedAt) liveSince.delete(k);
  };

  const layoutFrame = () => {
    const d = DEVICES.find((x) => x.id === device) ?? DEVICES[2];
    const availW = wrap.clientWidth - 24;
    const availH = wrap.clientHeight - 24;
    if (availW <= 0) return;
    const scale = Math.min(1, availW / d.width);
    iframe.style.width = `${d.width}px`;
    iframe.style.height = `${Math.max(400, availH / scale)}px`;
    iframe.style.transform = `scale(${scale})`;
    scaler.style.width = `${d.width * scale}px`;
    scaler.style.height = `${Math.max(400, availH)}px`;
    scaler.dataset.device = d.id;
  };
  const ro2 = new ResizeObserver(() => layoutFrame());
  ro2.observe(wrap);
  disposers.push(() => ro2.disconnect());

  const post = (msg: Record<string, unknown>) => {
    if (!ready || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(msg, location.origin);
  };

  let frameLoaded = false;
  const frameState = (): 'ok' | 'disabled' | 'pending' => {
    if (page.status !== 'published' && !page.system) return 'disabled';
    if (!page.system && page.template !== 'menu-category' && builtSlugs.get(page.id) !== page.slug && !store.previewCurrent) return 'pending';
    return 'ok';
  };
  const loadFrame = async () => {
    ready = false;
    frameLoaded = true;
    // erst Vorschau-Modus einschalten (Cookie), dann die Seite im Editor-Modus laden (ohne Vorschau-Leiste)
    if (!previewCookieSet) {
      await ensurePreviewCookie();
      previewCookieSet = true;
    }
    iframe.src = editorUrl(pagePreviewPath(page));
  };
  /** iframe laden — oder erklären, warum es (noch) nichts zu sehen gibt */
  const syncFrame = () => {
    const st = frameState();
    scaler.hidden = st !== 'ok';
    blocker.hidden = st === 'ok';
    if (st === 'disabled')
      blocker.replaceChildren(
        h('p', null, h('strong', null, 'Diese Seite ist deaktiviert.')),
        h('p', null, 'Deaktivierte Seiten werden nicht gebaut, deshalb kann die Vorschau sie nicht zeigen. Du kannst trotzdem alles bearbeiten.'),
        linkBtn('Seite aktivieren …', `#/seiten/${page.id}/einstellungen`, { small: true, icon: 'settings' }),
      );
    else if (st === 'pending')
      blocker.replaceChildren(h('span', { class: 'ad-spinner', 'aria-hidden': 'true' }), h('p', null, 'Die Vorschau dieser Seite wird gerade erstellt — das dauert meist 10 bis 60 Sekunden.'));
    else if (!frameLoaded) void loadFrame();
  };
  const reloadFrame = (manual = false) => {
    try {
      pendingScroll = iframe.contentWindow?.scrollY ?? null;
    } catch {
      pendingScroll = null;
    }
    ready = false;
    if (manual) pruneLive();
    try {
      iframe.contentWindow?.location.reload();
    } catch {
      void loadFrame();
    }
  };
  iframe.addEventListener('load', () => {
    if (pendingScroll !== null) {
      const y = pendingScroll;
      pendingScroll = null;
      try {
        iframe.contentWindow?.scrollTo(0, y);
      } catch {
        /* fremde Seite */
      }
    }
  });

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow || e.origin !== location.origin) return;
    const data = e.data as { type?: string; field?: string; section?: string };
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'sus-cms:ready') {
      ready = true;
      for (const { msg } of liveSince.values()) post({ type: 'sus-cms:set', ...msg });
      if (selectedId) post({ type: 'sus-cms:focus', section: selectedId, scroll: false });
    } else if (data.type === 'sus-cms:select') {
      const sid = data.section ?? (data.field ? data.field.split(':')[0] : '');
      if (!sid || !page.sections.some((s) => s.id === sid)) return;
      const fieldPath = data.field && data.field.includes(':') ? data.field.slice(data.field.indexOf(':') + 1) : '';
      if (sid !== selectedId) select(sid, false);
      if (cols.dataset.pane === '1') showPane(2);
      if (fieldPath) requestAnimationFrame(() => focusFieldPath(formPane, fieldPath));
    }
  };
  window.addEventListener('message', onMessage);
  disposers.push(() => window.removeEventListener('message', onMessage));

  on('live', (e) => {
    const m = (e as CustomEvent<LiveMsg>).detail;
    const sid = m.field.slice(0, m.field.indexOf(':'));
    if (!page.sections.some((x) => x.id === sid)) return;
    liveSince.set(m.field, { msg: m, at: Date.now() });
    post({ type: 'sus-cms:set', ...m });
  });

  /* ---------------------------------------------------------------- Vorschau-Builds ----------- */
  let lazyTimer: ReturnType<typeof setTimeout> | undefined;
  const busy = () => store.preview && (store.preview.state === 'queued' || store.preview.state === 'running');
  const renderPreviewState = () => {
    const p = store.preview;
    let text = 'Vorschau aktuell';
    let tone = 'ok';
    if (busy()) {
      text = 'Vorschau wird aktualisiert …';
      tone = 'busy';
    } else if (p?.state === 'failed') {
      text = 'Vorschau-Build fehlgeschlagen';
      tone = 'error';
    } else if (store.hasUnsaved || !p || p.revision < store.revision) {
      text = store.structuralPending ? 'Änderungen erscheinen nach dem Speichern' : 'Texte live — Vorschau folgt';
      tone = 'warn';
    }
    previewState.className = `ad-pstate ad-pstate--${tone}`;
    previewState.replaceChildren(h('span', { class: 'ad-dot', 'aria-hidden': 'true' }), text);
    overlay.hidden = !(busy() && store.previewReloadWanted) || !blocker.hidden;
    overlay.replaceChildren(h('span', { class: 'ad-spinner', 'aria-hidden': 'true' }), 'Vorschau wird neu gebaut …');
  };
  const requestPreview = async () => {
    clearTimeout(lazyTimer);
    await store.requestPreview();
    renderPreviewState();
  };
  on('saved', () => {
    if (store.structuralPending) void requestPreview();
    else {
      clearTimeout(lazyTimer);
      lazyTimer = setTimeout(() => void requestPreview(), LAZY_PREVIEW_MS);
    }
    renderPreviewState();
  });
  on('status', () => renderPreviewState());
  on('build', (e) => {
    const prev = (e as CustomEvent<{ prevPreview?: { state: string } | null }>).detail?.prevPreview;
    const p = store.preview;
    const wasBusy = prev && (prev.state === 'queued' || prev.state === 'running');
    if (wasBusy && p && p.state === 'ok') {
      if (!frameLoaded) {
        store.previewReloadWanted = false;
        syncFrame();
      } else if (store.previewReloadWanted) {
        store.previewReloadWanted = false;
        pruneLive();
        reloadFrame();
      }
    } else if (wasBusy && p?.state === 'failed') {
      store.previewReloadWanted = false;
      toast('Die Vorschau konnte nicht neu gebaut werden. Deine Änderungen sind gespeichert; Details unter „Übersicht“.', 'error', 9000);
    }
    renderPreviewState();
  });
  on('issues', () => updateSectionErrors());
  on('change', (e) => {
    // Strukturänderung (z. B. Listeneintrag verschoben): Pfade alter Live-Änderungen stimmen nicht mehr
    if ((e as CustomEvent<{ structural?: boolean }>).detail?.structural) liveSince.clear();
    // Beschriftungen in der Sektionsliste nachziehen (z. B. Überschrift geändert)
    const s = page.sections.find((x) => x.id === selectedId);
    const el = s ? secList.querySelector<HTMLElement>(`.ad-sec[data-id="${CSS.escape(s.id)}"] .ad-sec__sum`) : null;
    if (el && s) el.textContent = sectionSummary(s) || sectionDef(s.type)?.description || '';
  });
  disposers.push(() => clearTimeout(lazyTimer));

  /* ---------------------------------------------------------------- Auswahl ------------------- */
  function select(id: string, scrollPreview = true) {
    selectedId = id;
    history.replaceState(null, '', `#/seiten/${page!.id}?sektion=${encodeURIComponent(id)}`);
    secList.querySelectorAll('.ad-sec').forEach((li) => {
      const on = (li as HTMLElement).dataset.id === id;
      li.classList.toggle('is-selected', on);
      li.querySelector('.ad-sec__main')?.toggleAttribute('aria-current', on);
      if (on) li.querySelector('.ad-sec__main')?.setAttribute('aria-current', 'true');
    });
    renderForm();
    if (scrollPreview) post({ type: 'sus-cms:focus', section: id });
  }

  const cols = h('div', { class: 'ad-editor__cols', dataset: { pane: '2' } }, secPane, previewPane, formPane);
  root.append(h('div', { class: 'ad-editor' }, bar, cols));
  renderSections();
  renderForm();
  layoutFrame();

  // Vorschau-Build des Entwurfs sicherstellen (Seite neu, Struktur geändert oder noch nie gebaut)
  if (!store.previewCurrent) {
    store.previewReloadWanted = true;
    void requestPreview();
  }
  syncFrame();
  renderPreviewState();

  const field = route.query.get('feld');
  if (field) requestAnimationFrame(() => focusFieldPath(formPane, field));

  return () => {
    for (const d of disposers) d();
  };
}
