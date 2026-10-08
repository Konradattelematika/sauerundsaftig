/** Medienbibliothek: Raster, Upload (Datei/Drag & Drop), Alt-Text, Ersetzen, Löschen mit Verwendungsnachweis. */
import type { MediaItem } from '../../cms/types';
import { api, ApiError, mediaUrl } from '../api';
import { add, h, domId } from '../dom';
import { dropZone, kindLabel, mediaVersion, thumb, uploadFiles, ACCEPT } from '../mediafield';
import { mediaUsageMap, type Loc } from '../scan';
import { store } from '../state';
import { badge, btn, emptyState, notice, openDialog, pageHeader, toast, confirmDialog } from '../ui';
import { formatDateTime, plural, truncate } from '../util';
import type { Route } from '../view';

type Filter = 'alle' | 'fotos' | 'platzhalter' | 'hochgeladen' | 'unbenutzt';
const FILTERS: [Filter, string][] = [
  ['alle', 'Alle'],
  ['fotos', 'Fotos'],
  ['platzhalter', 'Platzhalter'],
  ['hochgeladen', 'Hochgeladen'],
  ['unbenutzt', 'Nicht verwendet'],
];

function usageList(locs: Loc[], onNavigate?: () => void): HTMLElement {
  if (!locs.length) return h('p', { class: 'ad-help' }, 'Wird derzeit nirgends verwendet.');
  return h('ul', { class: 'ad-uselist' }, ...locs.map((l) => h('li', null, h('a', { href: l.route, onclick: () => onNavigate?.() }, l.label))));
}

export function renderMedia(root: HTMLElement, route: Route): () => void {
  const canManage = store.can('media.manage') && store.canEdit;
  let filter: Filter = (FILTERS.find(([f]) => f === route.query.get('filter'))?.[0] ?? 'alle') as Filter;
  const search = h('input', { type: 'search', class: 'ad-input', placeholder: 'Suchen …', 'aria-label': 'Bilder durchsuchen' });
  const grid = h('div', { class: 'ad-mediagrid' });
  const progress = h('p', { class: 'ad-help', 'aria-live': 'polite' });
  const chips = h(
    'div',
    { class: 'ad-chips', role: 'radiogroup', 'aria-label': 'Filter' },
    ...FILTERS.map(([f, label]) => {
      const id = domId();
      const r = h('input', { id, type: 'radio', name: 'media-filter', value: f, checked: f === filter });
      r.addEventListener('change', () => {
        filter = f;
        render();
      });
      return h('label', { class: 'ad-chipradio', for: id }, r, label);
    }),
  );

  const render = () => {
    const usage = mediaUsageMap(store.doc);
    const q = search.value.trim().toLowerCase();
    const items = store.doc.media.filter((m) => {
      if (q && !m.id.includes(q) && !m.alt.toLowerCase().includes(q)) return false;
      if (filter === 'fotos') return m.kind === 'builtin' || Boolean(m.replacedBy);
      if (filter === 'platzhalter') return m.kind === 'placeholder' && !m.replacedBy;
      if (filter === 'hochgeladen') return m.kind === 'upload';
      if (filter === 'unbenutzt') return !usage.has(m.id);
      return true;
    });
    grid.replaceChildren(
      ...items.map((m) => {
        const n = usage.get(m.id)?.length ?? 0;
        const b = h(
          'button',
          { type: 'button', class: 'ad-mediacard', 'aria-label': `${m.alt || m.id} — Details` },
          h('span', { class: 'ad-mediacard__img' }, thumb(m.id, 320, '')),
          h('span', { class: 'ad-mediacard__alt' }, truncate(m.alt || '(ohne Beschreibung)', 80)),
          h(
            'span',
            { class: 'ad-mediacard__meta' },
            badge(kindLabel(m), m.kind === 'placeholder' && !m.replacedBy ? 'warn' : m.kind === 'upload' ? 'info' : 'neutral'),
            h('span', { class: 'ad-help' }, n ? `${n}× verwendet` : 'nicht verwendet'),
          ),
        );
        b.addEventListener('click', () => openDetail(m));
        return b;
      }),
    );
    if (!items.length) grid.append(emptyState('Keine Bilder für diesen Filter.'));
  };
  search.addEventListener('input', render);

  const openDetail = (m: MediaItem) => {
    const d = openDialog({ title: 'Bild', size: 'lg' });
    const usage = mediaUsageMap(store.doc).get(m.id) ?? [];
    const altId = domId();
    const alt = h('textarea', { id: altId, class: 'ad-input ad-textarea', rows: '3', disabled: !store.canEdit });
    alt.value = m.alt;
    alt.addEventListener('input', () => {
      m.alt = alt.value;
      store.change({});
    });
    const img = h('img', { src: mediaUrl(m.id, 1280, mediaVersion(m)), alt: '', class: 'ad-mediadetail__img' });
    const replaceInput = h('input', { type: 'file', accept: ACCEPT, class: 'sr-only', tabindex: '-1' });
    replaceInput.addEventListener('change', async () => {
      const f = replaceInput.files?.[0];
      replaceInput.value = '';
      if (!f) return;
      await store.flush();
      const res = await uploadFiles([f], { replace: m.id, onProgress: (t) => (progress.textContent = t) });
      if (res.length) {
        const fresh = store.doc.media.find((x) => x.id === m.id);
        img.src = mediaUrl(m.id, 1280, `${mediaVersion(fresh)}-${Date.now()}`);
        toast('Bild ersetzt — es erscheint überall, wo es verwendet wird.', 'ok');
        render();
      }
    });
    const progress = h('p', { class: 'ad-help', 'aria-live': 'polite' });
    d.body.append(
      h(
        'div',
        { class: 'ad-mediadetail' },
        h('div', { class: 'ad-mediadetail__preview' }, img),
        h(
          'div',
          { class: 'ad-mediadetail__info' },
          h(
            'div',
            { class: 'ad-field' },
            h('label', { class: 'ad-label', for: altId }, 'Bildbeschreibung (Alt-Text)'),
            h('p', { class: 'ad-help' }, 'Was ist auf dem Bild zu sehen? Wichtig für blinde Menschen und Suchmaschinen. Gilt überall, wo das Bild verwendet wird (außer dort ist eine eigene Beschreibung eingetragen).'),
            alt,
          ),
          h(
            'dl',
            { class: 'ad-kvs ad-kvs--compact' },
            h('div', { class: 'ad-kv' }, h('dt', null, 'Art'), h('dd', null, kindLabel(m))),
            h('div', { class: 'ad-kv' }, h('dt', null, 'Kennung'), h('dd', null, h('code', null, m.id))),
            m.width && m.height ? h('div', { class: 'ad-kv' }, h('dt', null, 'Größe'), h('dd', null, `${m.width} × ${m.height} px`)) : null,
            m.createdAt ? h('div', { class: 'ad-kv' }, h('dt', null, 'Hochgeladen'), h('dd', null, `${formatDateTime(m.createdAt)}${m.createdBy ? ` von ${m.createdBy}` : ''}`)) : null,
          ),
          h('h3', { class: 'ad-h3' }, `Wo verwendet (${usage.length})`),
          usageList(usage, () => d.close()),
          m.kind === 'placeholder' && !m.replacedBy ? notice('warn', h('p', null, 'Das ist ein Platzhalterbild. Mit „Ersetzen“ lädst du ein echtes Foto hoch — es erscheint dann an allen Stellen.')) : null,
          progress,
          replaceInput,
        ),
      ),
    );
    const del =
      canManage && m.kind === 'upload'
        ? btn('Löschen', {
            kind: 'danger',
            icon: 'trash',
            onClick: async () => {
              const uses = mediaUsageMap(store.doc).get(m.id) ?? [];
              if (uses.length) {
                await confirmDialog({
                  title: 'Bild wird noch verwendet',
                  message: h('div', null, h('p', null, `Das Bild ist an ${plural(uses.length, 'Stelle', 'Stellen')} eingesetzt. Ersetze es dort zuerst durch ein anderes Bild:`), usageList(uses)),
                  confirm: 'OK',
                  cancel: 'Schließen',
                });
                return;
              }
              const ok = await confirmDialog({ title: 'Bild löschen?', message: 'Das Bild wird aus der Medienbibliothek entfernt.', confirm: 'Löschen', danger: true });
              if (!ok) return;
              await store.flush();
              try {
                await api.deleteMedia(m.id);
                store.mediaChanged(m.id);
                d.close();
                toast('Bild gelöscht.', 'ok');
                render();
              } catch (e) {
                if (e instanceof ApiError && e.status === 409) {
                  toast('Das Bild wird laut Server noch verwendet — bitte erst ersetzen.', 'error', 8000);
                } else toast(e instanceof ApiError ? e.message : 'Löschen fehlgeschlagen.', 'error');
              }
            },
          })
        : null;
    add(d.footer, 
      del ?? h('span'),
      canManage ? btn(m.kind === 'upload' ? 'Datei ersetzen' : 'Durch eigenes Foto ersetzen', { kind: 'secondary', icon: 'upload', onClick: () => replaceInput.click() }) : null,
      btn('Fertig', { kind: 'primary', onClick: () => d.close() }),
    );
    d.closed.then(() => render());
  };

  render();
  root.append(
    h(
      'div',
      { class: 'ad-viewpad' },
      pageHeader('Medien', 'Alle Bilder der Website. Klick auf ein Bild zeigt, wo es verwendet wird; dort kannst du die Beschreibung ändern oder das Bild ersetzen.'),
      canManage
        ? h(
            'div',
            { class: 'ad-card' },
            dropZone(async (files) => {
              const items = await uploadFiles(files, { onProgress: (t) => (progress.textContent = t) });
              if (items.length) {
                toast(`${plural(items.length, 'Bild', 'Bilder')} hochgeladen. Tipp: Beschreibung (Alt-Text) prüfen.`, 'ok', 7000);
                filter = 'hochgeladen';
                (chips.querySelector('input[value="hochgeladen"]') as HTMLInputElement).checked = true;
                render();
              }
            }),
            progress,
          )
        : null,
      h('div', { class: 'ad-toolbar' }, chips, search),
      grid,
    ),
  );
  const onMedia = () => render();
  store.addEventListener('media', onMedia);
  store.addEventListener('doc', onMedia);
  return () => {
    store.removeEventListener('media', onMedia);
    store.removeEventListener('doc', onMedia);
  };
}
