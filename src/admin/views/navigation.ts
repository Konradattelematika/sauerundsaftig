/** Navigation: Hauptmenü (mit Untermenüs), Button im Kopf, Footer-Links, Rechtliches, Social Media. */
import { NAV_CTA_DEF, NAV_DEFS } from '../defs';
import { h } from '../dom';
import { renderField, refreshErrors } from '../fields';
import { store } from '../state';
import { card, cardTitle, editable, pageHeader } from '../ui';

export function renderNavigation(root: HTMLElement): void {
  const nav = store.doc.navigation as unknown as Record<string, unknown>;
  const ro = !store.canEdit;
  const cards = NAV_DEFS.map((n) => card(cardTitle(n.def.label, n.intro), renderField({ ...n.def, label: 'Einträge' }, nav, { path: ['navigation'] })));
  cards.splice(1, 0, card(cardTitle('Button im Kopf', NAV_CTA_DEF.help), renderField({ ...NAV_CTA_DEF, help: undefined, label: 'Button' }, nav, { path: ['navigation'] })));
  root.append(
    h(
      'div',
      { class: 'ad-viewpad ad-viewpad--narrow' },
      pageHeader('Navigation', 'Menüs im Kopf und Fuß der Website. Reihenfolge per Pfeilen oder Ziehen am Griff ändern. Ziele, die auf eine Seite zeigen, passen sich automatisch an, wenn sich deren Adresse ändert.'),
      editable(ro, ...cards),
    ),
  );
  refreshErrors(root);
}
