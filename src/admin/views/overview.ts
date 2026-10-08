/** Übersicht: Status (Entwurf/Live/Vorschau), letzte Veröffentlichung, offene Prüfhinweise, Schnellzugriffe. */
import type { Build } from '../api';
import { h, icon, type ICONS } from '../dom';
import { collectLinks, checkHref, knownPaths, mediaUsageMap } from '../scan';
import { store } from '../state';
import { openPublishDialog } from '../publish';
import { badge, btn, card, cardTitle, notice, pageHeader } from '../ui';
import { formatDateTime, plural, relativeTime } from '../util';
import { describePath } from '../where';
import { seoHints } from './pages';

function buildLine(label: string, b: Build | null): HTMLElement {
  let state: HTMLElement = badge('—', 'neutral');
  if (b) {
    if (b.state === 'ok') state = badge('fertig', 'ok');
    else if (b.state === 'failed') state = badge('fehlgeschlagen', 'error');
    else state = badge(b.state === 'queued' ? 'wartet' : 'läuft …', 'info');
  }
  return h(
    'div',
    { class: 'ad-kv' },
    h('dt', null, label),
    h(
      'dd',
      null,
      state,
      b ? h('span', { class: 'ad-help' }, ` Stand ${b.revision ? `Nr. ${b.revision}` : ''}${b.finishedAt ? ` · ${formatDateTime(b.finishedAt)}` : b.startedAt ? ` · gestartet ${relativeTime(b.startedAt)}` : ''}`) : null,
      b?.state === 'failed' && (b.error || b.logTail)
        ? h('details', { class: 'ad-details' }, h('summary', null, 'Details'), b.error ? h('p', null, b.error) : null, b.logTail ? h('pre', { class: 'ad-log' }, b.logTail) : null)
        : null,
    ),
  );
}

function quick(label: string, href: string, ic: keyof typeof ICONS, text: string): HTMLElement {
  return h('a', { class: 'ad-quick', href }, icon(ic), h('span', null, h('strong', null, label), h('small', null, text)));
}

export function renderOverview(root: HTMLElement): () => void {
  const statusBox = h('div');
  const checks = h('div');

  const renderStatus = () => {
    const pm = store.publishedMeta;
    const unpublished = store.dirty || store.hasUnsaved;
    statusBox.replaceChildren(
      card(
        cardTitle('Stand der Website'),
        unpublished
          ? notice(
              'warn',
              h('p', null, h('strong', null, 'Es gibt Änderungen, die noch nicht online sind.'), ' Sieh sie dir mit „Vorschau ansehen“ an und veröffentliche sie, wenn alles passt.'),
              store.can('cms.publish') ? h('p', null, btn('Jetzt veröffentlichen …', { kind: 'accent', small: true, icon: 'send', onClick: () => void openPublishDialog() })) : null,
            )
          : notice('ok', h('p', null, 'Alles veröffentlicht — die Website zeigt den aktuellen Stand.')),
        h(
          'dl',
          { class: 'ad-kvs' },
          h('div', { class: 'ad-kv' }, h('dt', null, 'Zuletzt veröffentlicht'), h('dd', null, pm?.publishedAt ? `${formatDateTime(pm.publishedAt)}${pm.publishedBy ? ` von ${pm.publishedBy}` : ''}` : pm?.updatedAt ? formatDateTime(pm.updatedAt) : '—')),
          h('div', { class: 'ad-kv' }, h('dt', null, 'Entwurf gespeichert'), h('dd', null, store.lastSavedAt ? `${formatDateTime(store.lastSavedAt)}${store.draftMeta.updatedBy ? ` von ${store.draftMeta.updatedBy}` : ''}` : '—')),
          buildLine('Website (live)', store.live),
          buildLine('Vorschau', store.preview),
        ),
      ),
    );
  };

  const renderChecks = () => {
    const doc = store.doc;
    const errors = store.issues.filter((i) => i.level === 'error');
    const warns = store.issues.filter((i) => i.level === 'warning');
    const paths = knownPaths(doc);
    const dead = collectLinks(doc).filter((l) => checkHref(l.href, doc, paths)?.level === 'error' && (l.kind !== 'link' || l.label));
    const usage = mediaUsageMap(doc);
    const placeholdersUsed = doc.media.filter((m) => m.kind === 'placeholder' && !m.replacedBy && usage.has(m.id));
    const testimonialPh = doc.collections.testimonials.filter((t) => t.isPlaceholder).length;
    const pricePh = doc.collections.menu.reduce((n, c) => n + c.items.filter((i) => i.priceIsPlaceholder).length, 0);
    const seoBad = doc.pages.filter((p) => p.status === 'published' && !p.system && seoHints(p).tone !== 'ok');
    const todo: HTMLElement[] = [];
    const item = (n: number, text: string, href: string, tone: 'error' | 'warn' = 'warn') =>
      n ? todo.push(h('li', null, h('span', { class: `ad-dot ad-dot--${tone}`, 'aria-hidden': 'true' }), h('a', { href }, text))) : 0;
    item(dead.length, `${plural(dead.length, 'Link zeigt', 'Links zeigen')} ins Leere`, '#/links?nur=probleme', 'error');
    item(placeholdersUsed.length, `${plural(placeholdersUsed.length, 'Platzhalterbild ist', 'Platzhalterbilder sind')} noch in Verwendung`, '#/medien?filter=platzhalter');
    item(testimonialPh, `${plural(testimonialPh, 'Gästestimme ist', 'Gästestimmen sind')} noch Platzhalter`, '#/stimmen');
    item(pricePh, `${plural(pricePh, 'Preis ist', 'Preise sind')} als vorläufig markiert`, '#/karte');
    item(seoBad.length, `${plural(seoBad.length, 'Seite hat', 'Seiten haben')} SEO-Hinweise`, '#/seo');
    checks.replaceChildren(
      card(
        cardTitle('Prüfhinweise', 'Fehler verhindern das Veröffentlichen; Hinweise sind Empfehlungen.'),
        errors.length
          ? h(
              'ul',
              { class: 'ad-issuelist ad-issuelist--error' },
              ...errors.slice(0, 6).map((i) => {
                const w = describePath(doc, i.path);
                return h('li', null, h('a', { href: w.route }, w.label), h('span', null, i.message));
              }),
              errors.length > 6 ? h('li', null, `… und ${errors.length - 6} weitere (Knopf „Prüfhinweise“ oben)`) : null,
            )
          : notice('ok', h('p', null, `Keine Fehler.${warns.length ? ` ${plural(warns.length, 'Hinweis', 'Hinweise')} — siehe „Prüfhinweise“ oben.` : ''}`)),
        todo.length ? h('div', null, h('h3', { class: 'ad-h3' }, 'Noch zu erledigen'), h('ul', { class: 'ad-todo' }, ...todo)) : null,
      ),
    );
  };

  renderStatus();
  renderChecks();
  const name = store.me.name?.split(' ')[0] || '';
  root.append(
    h(
      'div',
      { class: 'ad-viewpad' },
      pageHeader(`Hallo${name ? ` ${name}` : ''}!`, 'Hier pflegst du die Inhalte von sauerundsaftig.de. Änderungen werden automatisch als Entwurf gespeichert und gehen erst mit „Veröffentlichen“ online.'),
      h('div', { class: 'ad-grid2' }, statusBox, checks),
      card(
        cardTitle('Schnellzugriff'),
        h(
          'div',
          { class: 'ad-quickgrid' },
          quick('Startseite', `#/seiten/${store.doc.pages.find((p) => p.slug === '')?.id ?? 'start'}`, 'home', 'Texte und Bilder ändern'),
          quick('Heute frisch', '#/backstube', 'bread', 'Tafel aus der Backstube'),
          quick('Öffnungszeiten', '#/einstellungen?bereich=zeiten', 'clock', 'Zeiten und Ausnahmen'),
          quick('Karte', '#/karte', 'menu', 'Speisen, Preise, Allergene'),
          quick('Bilder', '#/medien', 'image', 'Fotos hochladen und ersetzen'),
          quick('Neue Seite', '#/seiten?neu=1', 'plus', 'Eine Seite hinzufügen'),
        ),
      ),
    ),
  );
  const onAny = () => {
    renderStatus();
    renderChecks();
  };
  store.addEventListener('build', onAny);
  store.addEventListener('issues', renderChecks);
  store.addEventListener('status', renderStatus);
  return () => {
    store.removeEventListener('build', onAny);
    store.removeEventListener('issues', renderChecks);
    store.removeEventListener('status', renderStatus);
  };
}
