/** Header & Footer: Logo/Öffnungsstatus, Footer-Texte, Leiste unten am Handy. */
import { FOOTER_DEFS, HEADER_DEFS, STICKY_DEF } from '../defs';
import { h } from '../dom';
import { renderField, renderFields, refreshErrors } from '../fields';
import { store } from '../state';
import { card, cardTitle, editable, pageHeader } from '../ui';

export function renderLayout(root: HTMLElement): void {
  const layout = store.doc.layout;
  const ro = !store.canEdit;
  root.append(
    h(
      'div',
      { class: 'ad-viewpad ad-viewpad--narrow' },
      pageHeader('Header & Footer', 'Was auf jeder Seite oben (Kopf), unten (Fuß) und am Handy in der Leiste am unteren Rand steht. Die Menüpunkte selbst pflegst du unter „Navigation“.'),
      editable(
        ro,
        card(cardTitle('Kopf der Website (Header)'), renderFields(HEADER_DEFS, layout.header as unknown as Record<string, unknown>, { path: ['layout', 'header'] }), h('p', { class: 'ad-help' }, h('a', { href: '#/navigation' }, 'Menüpunkte und Button im Kopf bearbeiten →'))),
        card(cardTitle('Fuß der Website (Footer)'), renderFields(FOOTER_DEFS, layout.footer as unknown as Record<string, unknown>, { path: ['layout', 'footer'] }), h('p', { class: 'ad-help' }, 'Öffnungszeiten und Adresse im Footer kommen aus den ', h('a', { href: '#/einstellungen' }, 'Einstellungen'), '.')),
        card(
          cardTitle('Leiste unten am Handy', 'Feste Schnellzugriffe am unteren Bildschirmrand — nur auf dem Handy sichtbar, höchstens 4 Einträge.'),
          renderField({ ...STICKY_DEF, help: undefined }, layout.stickyBar as unknown as Record<string, unknown>, { path: ['layout', 'stickyBar'] }),
        ),
      ),
    ),
  );
  refreshErrors(root);
}
