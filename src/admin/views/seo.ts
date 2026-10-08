/** SEO: Titel und Beschreibung aller Seiten auf einen Blick (direkt bearbeitbar) + Standard-Vorschaubild. */
import { h, domId } from '../dom';
import { renderField, refreshErrors } from '../fields';
import { store } from '../state';
import { badge, card, cardTitle, editable, linkBtn, pageHeader } from '../ui';
import { DESC_RULE, TITLE_RULE, lengthMeter, pageDisplayPath } from './pages';

export function renderSeo(root: HTMLElement): void {
  const ro = !store.canEdit;
  const rows = store.doc.pages
    .filter((p) => !p.system)
    .map((p) => {
      p.seo ??= { title: '', description: '' };
      const pi = store.doc.pages.indexOf(p);
      const tId = domId();
      const dId = domId();
      const t = h('input', { id: tId, class: 'ad-input', type: 'text', value: p.seo.title ?? '' });
      const dsc = h('textarea', { id: dId, class: 'ad-input ad-textarea', rows: '2' });
      dsc.value = p.seo.description ?? '';
      const tm = lengthMeter(() => t.value, TITLE_RULE);
      const dm = lengthMeter(() => dsc.value, DESC_RULE);
      t.addEventListener('input', () => {
        p.seo.title = t.value;
        tm.update();
        store.change({});
      });
      dsc.addEventListener('input', () => {
        p.seo.description = dsc.value;
        dm.update();
        store.change({});
      });
      return h(
        'article',
        { class: 'ad-seorow' },
        h(
          'header',
          { class: 'ad-seorow__head' },
          h('h2', { class: 'ad-h3' }, p.title),
          h('span', { class: 'ad-row__sub' }, pageDisplayPath(p)),
          p.status !== 'published' ? badge('deaktiviert', 'neutral') : null,
          p.seo.noindex ? badge('nicht in Suchmaschinen', 'info') : null,
          linkBtn('Alle SEO-Angaben', `#/seiten/${p.id}/einstellungen`, { kind: 'quiet', small: true }),
        ),
        h(
          'div',
          { class: 'ad-seorow__fields' },
          h('div', { class: 'ad-field' }, h('label', { class: 'ad-sublabel', for: tId }, 'Titel'), t, tm.el, h('div', { class: 'ad-errors', dataset: { errPath: `pages.${pi}.seo.title`, errPrefix: '' } })),
          h('div', { class: 'ad-field' }, h('label', { class: 'ad-sublabel', for: dId }, 'Beschreibung'), dsc, dm.el, h('div', { class: 'ad-errors', dataset: { errPath: `pages.${pi}.seo.description`, errPrefix: '' } })),
        ),
      );
    });
  root.append(
    h(
      'div',
      { class: 'ad-viewpad' },
      pageHeader('SEO', 'So erscheinen die Seiten bei Google und beim Teilen. Ideal: Titel 30–60 Zeichen, Beschreibung 70–160 Zeichen. Grün = gut, Gelb = prüfen, Rot = fehlt.'),
      editable(
        ro,
        card(
          cardTitle('Standard-Vorschaubild', 'Erscheint beim Teilen eines Links (WhatsApp, Facebook …), wenn eine Seite kein eigenes Vorschaubild hat.'),
          renderField({ key: 'ogImage', label: 'Bild', kind: 'media', help: 'Ideal: Querformat, mindestens 1200 × 630 Pixel.' }, store.doc.settings.seoDefaults as unknown as Record<string, unknown>, { path: ['settings', 'seoDefaults'] }),
        ),
        h('div', { class: 'ad-seolist' }, ...rows),
      ),
    ),
  );
  refreshErrors(root);
}
