/** Bildfeld + Medienwähler (Bibliothek, Suche, Upload per Datei oder Drag & Drop). */
import type { MediaItem } from '../cms/types';
import { api, ApiError, mediaUrl } from './api';
import { add, h, icon } from './dom';
import { store } from './state';
import { btn, openDialog, toast } from './ui';

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';
export const MAX_BYTES = 15 * 1024 * 1024;

export function mediaVersion(m: MediaItem | undefined): string {
  return m ? (m.replacedBy ?? m.file ?? '') : '';
}

export function mediaById(id: string | null | undefined): MediaItem | undefined {
  return id ? store.doc.media.find((m) => m.id === id) : undefined;
}

export function thumb(id: string, w = 320, alt = ''): HTMLImageElement {
  const m = mediaById(id);
  const img = h('img', { src: mediaUrl(id, w, mediaVersion(m)), alt, loading: 'lazy', decoding: 'async', class: 'ad-thumb' });
  img.addEventListener('error', () => img.classList.add('is-broken'), { once: true });
  return img;
}

export function kindLabel(m: MediaItem): string {
  if (m.replacedBy) return 'Ersetzt';
  return m.kind === 'builtin' ? 'Foto' : m.kind === 'placeholder' ? 'Platzhalter' : 'Hochgeladen';
}

/** Datei prüfen (Typ/Größe) — Rückgabe: Fehlermeldung oder null */
export function fileProblem(f: File): string | null {
  if (!ACCEPT.split(',').includes(f.type)) return `„${f.name}“ ist kein unterstütztes Bild (JPEG, PNG, WebP oder AVIF).`;
  if (f.size > MAX_BYTES) return `„${f.name}“ ist größer als 15 MB.`;
  return null;
}

/** Dateien hochladen (nacheinander), Entwurf danach mit dem Server abgleichen. */
export async function uploadFiles(files: File[], opts: { replace?: string; onProgress?: (text: string) => void } = {}): Promise<MediaItem[]> {
  const done: MediaItem[] = [];
  for (const [i, f] of files.entries()) {
    const prob = fileProblem(f);
    if (prob) {
      toast(prob, 'error', 8000);
      continue;
    }
    opts.onProgress?.(`Lade ${files.length > 1 ? `${i + 1} von ${files.length}` : `„${f.name}“`} hoch …`);
    try {
      const alt = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
      const item = await api.uploadMedia(f, { replace: opts.replace, alt: opts.replace ? undefined : alt });
      if (item && item.id) {
        store.addMediaLocal(item);
        done.push(item);
      }
    } catch (e) {
      toast(e instanceof ApiError ? `Hochladen fehlgeschlagen: ${e.message}` : 'Hochladen fehlgeschlagen.', 'error', 8000);
    }
  }
  if (done.length) store.mediaChanged();
  opts.onProgress?.('');
  return done;
}

/** Drop-Zone + Dateiauswahl */
export function dropZone(onFiles: (files: File[]) => void, opts: { multiple?: boolean; label?: string } = {}): HTMLElement {
  const input = h('input', { type: 'file', accept: ACCEPT, multiple: opts.multiple !== false, class: 'sr-only', tabindex: '-1' });
  input.addEventListener('change', () => {
    if (input.files?.length) onFiles([...input.files]);
    input.value = '';
  });
  const pick = btn(opts.label ?? 'Bilder auswählen', { kind: 'secondary', icon: 'upload', onClick: () => input.click() });
  const zone = h(
    'div',
    { class: 'ad-drop' },
    icon('image', 'ad-icon ad-drop__icon'),
    h('p', null, 'Bilder hierher ziehen oder'),
    pick,
    h('p', { class: 'ad-help' }, 'JPEG, PNG, WebP oder AVIF, höchstens 15 MB. Große Fotos werden automatisch verkleinert.'),
    input,
  );
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) onFiles(opts.multiple === false ? files.slice(0, 1) : files);
  });
  return zone;
}

/** Medienwähler-Dialog. Ergebnis: Medien-ID oder null (abgebrochen). */
export async function pickMedia(current?: string | null): Promise<string | null> {
  const d = openDialog({ title: 'Bild wählen', size: 'xl' });
  const search = h('input', { type: 'search', class: 'ad-input', placeholder: 'Suchen (Name oder Beschreibung)', 'aria-label': 'Bilder durchsuchen' });
  const grid = h('div', { class: 'ad-mediagrid ad-mediagrid--pick', role: 'listbox', 'aria-label': 'Bilder' });
  const progress = h('p', { class: 'ad-help', 'aria-live': 'polite' });

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const items = store.doc.media.filter((m) => !q || m.id.includes(q) || m.alt.toLowerCase().includes(q));
    grid.replaceChildren(
      ...items.map((m) => {
        const b = h(
          'button',
          { type: 'button', class: `ad-mediapick${m.id === current ? ' is-current' : ''}`, role: 'option', 'aria-selected': String(m.id === current), title: m.alt },
          thumb(m.id, 320, ''),
          h('span', { class: 'ad-mediapick__name' }, m.alt || m.id),
          m.kind === 'placeholder' && !m.replacedBy ? h('span', { class: 'ad-badge ad-badge--warn ad-mediapick__badge' }, 'Platzhalter') : null,
        );
        b.addEventListener('click', () => d.close(m.id));
        return b;
      }),
    );
    if (!items.length) grid.append(h('p', { class: 'ad-help' }, 'Keine Bilder gefunden.'));
  };
  search.addEventListener('input', render);

  const canUpload = store.can('media.manage') && store.canEdit;
  const zone = canUpload
    ? dropZone(
        async (files) => {
          const items = await uploadFiles(files, { onProgress: (t) => (progress.textContent = t) });
          if (items.length === 1) d.close(items[0].id);
          else render();
        },
        { multiple: true, label: 'Neues Bild hochladen' },
      )
    : null;

  add(d.body, h('div', { class: 'ad-pick-top' }, search), zone ? h('details', { class: 'ad-pick-upload' }, h('summary', null, 'Neues Bild hochladen'), zone, progress) : null, grid);
  d.footer.append(btn('Abbrechen', { kind: 'quiet', onClick: () => d.close(null) }));
  render();
  search.focus();
  const r = await d.closed;
  return typeof r === 'string' ? r : null;
}
