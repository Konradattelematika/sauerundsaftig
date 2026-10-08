/** Sammlungen: Karte (Kategorien + Einträge), FAQ, Gästestimmen, Aus der Backstube (Heute frisch). */
import { COLLECTION_DEFS, type AdminFieldDef } from '../defs';
import { h } from '../dom';
import { renderField, renderFields, refreshErrors } from '../fields';
import { store } from '../state';
import { btn, card, editable, emptyState, notice, pageHeader, toast } from '../ui';
import type { Route } from '../view';

const PAGE_FOR: Record<string, string[]> = {
  menu: ['karte', 'karte-kategorie'],
  faq: ['faq'],
  testimonials: ['start'],
  heuteFrisch: ['start'],
};

/** Hinweis, wo die Sammlung erscheint */
function whereShown(name: string): HTMLElement | null {
  const pages = (PAGE_FOR[name] ?? []).map((id) => store.doc.pages.find((p) => p.id === id)).filter((p) => p !== undefined);
  if (!pages.length) return null;
  return h(
    'p',
    { class: 'ad-help' },
    'Erscheint auf: ',
    ...pages.flatMap((p, i) => [i ? ', ' : '', h('a', { href: `#/seiten/${p.id}` }, p.title)]),
  );
}

export function renderCollection(root: HTMLElement, _route: Route, name: string): void {
  const def = COLLECTION_DEFS[name];
  const ro = !store.canEdit;
  if (!def) {
    root.append(h('div', { class: 'ad-viewpad' }, pageHeader(name), emptyState('Für diese Sammlung gibt es noch keine Definition.')));
    return;
  }
  const cols = store.doc.collections as Record<string, unknown>;
  let body: HTMLElement;
  if (def.shape === 'list') {
    if (!Array.isArray(cols[name])) cols[name] = [];
    const fields = name === 'menu' ? def.fields.filter((f) => f.key !== 'order') : def.fields;
    const listDef: AdminFieldDef = {
      key: name,
      label: name === 'menu' ? 'Kategorien' : 'Einträge',
      kind: 'list',
      itemLabel: def.itemLabel,
      itemIds: name !== 'menu',
      of: fields,
    };
    body = renderField(listDef, cols, {
      path: ['collections'],
      onChange: () => {
        if (name === 'menu') {
          // Reihenfolge der Kategorien = Position in der Liste
          (cols.menu as { order?: number }[]).forEach((c, i) => (c.order = (i + 1) * 10));
        }
      },
    });
  } else {
    if (typeof cols[name] !== 'object' || cols[name] === null) cols[name] = {};
    const obj = cols[name] as Record<string, unknown>;
    const fieldsBox = renderFields(def.fields, obj, { path: ['collections', name] });
    const extra =
      name === 'heuteFrisch' && !ro
        ? btn('Stand auf heute setzen', {
            kind: 'secondary',
            small: true,
            icon: 'clock',
            onClick: () => {
              const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
              obj.date = today;
              const input = fieldsBox.querySelector<HTMLInputElement>('[data-field-key="date"] input');
              if (input) input.value = today;
              store.change({ structural: true });
              toast('Datum auf heute gesetzt.', 'ok', 2500);
            },
          })
        : null;
    body = h('div', null, extra ? h('div', { class: 'ad-btnrow' }, extra) : null, fieldsBox);
  }
  root.append(
    h(
      'div',
      { class: 'ad-viewpad ad-viewpad--narrow' },
      pageHeader(def.label, def.description),
      whereShown(name),
      name === 'menu' ? notice('info', h('p', null, 'Jede Kategorie bekommt automatisch eine eigene Seite unter /karte/<adresse>. Reihenfolge der Kategorien = Reihenfolge auf der Website.')) : null,
      editable(ro, card(body)),
    ),
  );
  refreshErrors(root);
}
