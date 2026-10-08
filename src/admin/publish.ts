/** Veröffentlichen (Rückfrage mit Änderungsübersicht → Build-Fortschritt), Entwurf verwerfen, Vorschau öffnen. */
import { api, ApiError, previewUrl, type Build } from './api';
import { diffDocs } from './diff';
import { h, icon } from './dom';
import { store } from './state';
import { btn, confirmDialog, loading, notice, openDialog, toast } from './ui';
import { describePath } from './where';
import { shortMessage } from './validate';
import { formatDateTime } from './util';

const busy = (b: Build | null | undefined) => Boolean(b && (b.state === 'queued' || b.state === 'running'));

/** Fortschrittsanzeige eines Builds; ruft onDone(build) beim Abschluss */
export function buildProgress(kind: 'live' | 'preview', onDone?: (b: Build) => void): { el: HTMLElement; stop(): void } {
  const bar = h('div', { class: 'ad-progress', role: 'progressbar', 'aria-label': kind === 'live' ? 'Veröffentlichen' : 'Vorschau', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { class: 'ad-progress__bar' }));
  const text = h('p', { class: 'ad-progress__text', 'aria-live': 'polite' });
  const el = h('div', { class: 'ad-buildprog' }, bar, text);
  const started = Date.now();
  let finished = false;
  const update = () => {
    const b = kind === 'live' ? store.live : store.preview;
    if (!b || finished) return;
    const sec = Math.round((Date.now() - (b.startedAt ? new Date(b.startedAt).getTime() : started)) / 1000);
    const pct = b.state === 'ok' ? 100 : b.state === 'queued' ? 5 : Math.min(92, 8 + Math.round((sec / 50) * 84));
    (bar.firstChild as HTMLElement).style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    if (b.state === 'queued') text.textContent = 'Wartet auf den Start …';
    else if (b.state === 'running') text.textContent = `Die Website wird gebaut … ${sec > 0 ? `(${sec} s — dauert meist 10–60 Sekunden)` : ''}`;
    if (!busy(b)) {
      finished = true;
      el.classList.toggle('is-ok', b.state === 'ok');
      el.classList.toggle('is-failed', b.state === 'failed');
      text.textContent = b.state === 'ok' ? 'Fertig.' : 'Fehlgeschlagen.';
      onDone?.(b);
    }
  };
  const onBuild = () => update();
  store.addEventListener('build', onBuild);
  const timer = setInterval(update, 1000);
  update();
  return {
    el,
    stop() {
      store.removeEventListener('build', onBuild);
      clearInterval(timer);
    },
  };
}

export async function openPublishDialog(): Promise<void> {
  if (!store.can('cms.publish')) {
    toast('Zum Veröffentlichen fehlt dir die Berechtigung.', 'error');
    return;
  }
  const d = openDialog({ title: 'Änderungen veröffentlichen', size: 'lg' });
  d.body.append(loading('Speichere und vergleiche mit der Website …'));
  const saved = await store.flush();
  let published = null;
  try {
    published = await api.published();
  } catch {
    published = null;
  }
  d.body.replaceChildren();
  if (!saved) {
    d.body.append(notice('error', h('p', null, 'Der Entwurf ist noch nicht gespeichert: ', store.statusMessage || 'bitte Prüfhinweise beheben.')));
    d.footer.append(btn('Schließen', { kind: 'primary', onClick: () => d.close() }));
    return;
  }
  await store.validate();
  const errors = store.issues.filter((i) => i.level === 'error');
  const warnings = store.issues.filter((i) => i.level === 'warning');

  if (busy(store.live)) {
    d.body.append(notice('info', h('p', null, 'Gerade läuft schon eine Veröffentlichung. Bitte warte, bis sie fertig ist.')));
  }

  if (published) {
    const groups = diffDocs(published, store.doc);
    if (!groups.length) d.body.append(notice('ok', h('p', null, 'Der Entwurf entspricht schon dem veröffentlichten Stand — es gibt nichts zu veröffentlichen.')));
    else
      d.body.append(
        h('p', { class: 'ad-lead' }, 'Diese Änderungen gehen online:'),
        h(
          'div',
          { class: 'ad-changes' },
          ...groups.map((g) =>
            h('section', { class: 'ad-changes__group' }, h('h3', { class: 'ad-h3' }, g.area), h('ul', null, ...g.items.slice(0, 12).map((i) => h('li', null, i)), g.items.length > 12 ? h('li', null, `… und ${g.items.length - 12} weitere`) : null)),
          ),
        ),
      );
  } else {
    d.body.append(h('p', { class: 'ad-lead' }, 'Alle gespeicherten Änderungen des Entwurfs gehen online.'));
  }

  if (errors.length) {
    d.body.append(
      notice(
        'error',
        h('p', null, h('strong', null, `${errors.length} Fehler`), ' verhindern das Veröffentlichen:'),
        h('ul', { class: 'ad-issuelist' }, ...errors.slice(0, 8).map((i) => {
          const w = describePath(store.doc, i.path);
          return h('li', null, h('a', { href: w.route, onclick: () => d.close() }, w.label), ': ', shortMessage(i.message));
        })),
      ),
    );
  } else if (warnings.length) {
    d.body.append(notice('warn', h('p', null, `${warnings.length} Hinweis${warnings.length === 1 ? '' : 'e'} (z. B. fehlende SEO-Beschreibungen) — Veröffentlichen ist trotzdem möglich.`)));
  }
  d.body.append(h('p', { class: 'ad-help' }, 'Vor dem Veröffentlichen wird der bisherige Stand als Version gesichert — du kannst ihn unter „Versionen“ jederzeit zurückholen.'));

  const go = btn('Jetzt veröffentlichen', { kind: 'accent', icon: 'send', disabled: errors.length > 0 || busy(store.live) });
  d.footer.append(btn('Abbrechen', { kind: 'quiet', onClick: () => d.close() }), go);
  go.focus();
  go.addEventListener('click', async () => {
    d.footer.replaceChildren();
    d.body.replaceChildren(loading('Starte …'));
    let build: Build;
    try {
      build = await store.publish();
    } catch (e) {
      d.body.replaceChildren(notice('error', h('p', null, e instanceof ApiError ? e.message : 'Veröffentlichen fehlgeschlagen.')));
      d.footer.append(btn('Schließen', { kind: 'primary', onClick: () => d.close() }));
      return;
    }
    void build;
    d.setTitle('Wird veröffentlicht …');
    const hint = h('p', { class: 'ad-help' }, 'Du kannst dieses Fenster schließen — die Veröffentlichung läuft weiter. Bis sie fertig ist, bleibt die bisherige Version online.');
    const prog = buildProgress('live', async (b) => {
      prog.stop();
      d.footer.replaceChildren();
      if (b.state === 'ok') {
        d.setTitle('Veröffentlicht');
        hint.replaceWith(notice('ok', h('p', null, 'Die Website zeigt jetzt den neuen Stand.')));
        d.footer.append(btn('Schließen', { kind: 'quiet', onClick: () => d.close() }), h('a', { class: 'ad-btn ad-btn--primary', href: '/', target: '_blank', rel: 'noopener' }, icon('external'), 'Website ansehen'));
        await refreshMeta();
      } else {
        d.setTitle('Veröffentlichen fehlgeschlagen');
        hint.replaceWith(
          notice(
            'error',
            h('p', null, 'Die neue Version konnte nicht gebaut werden. ', h('strong', null, 'Die bisherige Version bleibt online.'), ' Dein Entwurf ist gespeichert.'),
            b.error ? h('p', null, b.error) : null,
            b.logTail ? h('details', null, h('summary', null, 'Technische Details (für Konrad)'), h('pre', { class: 'ad-log' }, b.logTail)) : null,
          ),
        );
        d.footer.append(btn('Schließen', { kind: 'primary', onClick: () => d.close() }));
      }
    });
    d.body.replaceChildren(prog.el, hint);
    d.footer.append(btn('Im Hintergrund weiterlaufen lassen', { kind: 'quiet', onClick: () => d.close() }));
    d.closed.then(() => {
      if (busy(store.live)) {
        const watch = () => {
          if (busy(store.live)) return;
          store.removeEventListener('build', watch);
          if (store.live?.state === 'ok') {
            toast('Veröffentlicht — die Website zeigt jetzt den neuen Stand.', 'ok', 8000);
            void refreshMeta();
          } else toast('Veröffentlichen fehlgeschlagen — die bisherige Version bleibt online.', 'error', 10000);
        };
        store.addEventListener('build', watch);
      }
    });
  });
}

/** Status nach dem Veröffentlichen (dirty, publishedMeta) holen, ohne lokale Änderungen anzutasten */
export async function refreshMeta(): Promise<void> {
  try {
    const st = await api.state();
    store.publishedMeta = st.publishedMeta ?? store.publishedMeta;
    store.dirty = Boolean(st.dirty) || store.hasUnsaved;
    store.live = st.live ?? store.live;
    store.online = st.online ?? store.online;
    store.dispatchEvent(new CustomEvent('status'));
    store.dispatchEvent(new CustomEvent('build'));
  } catch {
    /* egal */
  }
}

export async function discardDraft(): Promise<void> {
  const when = store.publishedMeta?.publishedAt ? ` vom ${formatDateTime(store.publishedMeta.publishedAt)}` : '';
  const ok = await confirmDialog({
    title: 'Entwurf verwerfen?',
    message: h(
      'div',
      null,
      h('p', null, `Alle Änderungen seit der letzten Veröffentlichung gehen verloren. Der Entwurf wird auf den veröffentlichten Stand${when} zurückgesetzt.`),
      h('p', { class: 'ad-help' }, 'Hochgeladene Bilder bleiben in der Medienbibliothek.'),
    ),
    confirm: 'Entwurf verwerfen',
    danger: true,
  });
  if (!ok) return;
  try {
    await store.discard();
    toast('Entwurf verworfen — alles entspricht wieder der Website.', 'ok');
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Verwerfen fehlgeschlagen.', 'error');
  }
}

/** „Vorschau ansehen“: speichern, Vorschau-Build sicherstellen, Seite im Vorschau-Modus in neuem Tab öffnen */
export async function openPreview(path = '/'): Promise<void> {
  // Fenster sofort öffnen (sonst blockiert der Browser das Popup nach dem Warten)
  const w = window.open('', '_blank');
  if (w) {
    try {
      w.document.title = 'Vorschau wird vorbereitet …';
      const p = w.document.createElement('p');
      p.textContent = 'Die Vorschau wird vorbereitet … einen Moment bitte.';
      p.setAttribute('style', 'font: 18px/1.5 system-ui, sans-serif; padding: 2rem; color: #241b14; background: #f7f2e8');
      w.document.body.appendChild(p);
    } catch {
      /* fremdes Dokument — egal */
    }
  }
  const target = previewUrl(path);
  const done = () => {
    if (w && !w.closed) w.location.href = target;
    else window.open(target, '_blank', 'noopener');
  };
  await store.flush();
  if (store.previewCurrent) return done();
  const b = await store.requestPreview();
  if (!b) return done();
  if (!busy(store.preview)) return done();
  toast('Vorschau wird erstellt — der Tab öffnet sich, sobald sie fertig ist.', 'info', 6000);
  const watch = () => {
    if (busy(store.preview)) return;
    store.removeEventListener('build', watch);
    if (store.preview?.state === 'failed') toast('Die Vorschau konnte nicht erstellt werden — es wird der letzte Stand gezeigt.', 'error', 8000);
    done();
  };
  store.addEventListener('build', watch);
}
