/** Buttons & Links: alle Links/Linkziele der Website auf einen Blick, Schnellbearbeitung, Warnung bei toten Zielen. */
import type { LinkValue } from '../../cms/types';
import { h, domId } from '../dom';
import { targetPicker } from '../linkfield';
import { checkHref, collectLinks, describeHref, knownPaths, type LinkUse } from '../scan';
import { store } from '../state';
import { badge, btn, emptyState, pageHeader } from '../ui';
import { truncate } from '../util';
import { fillTokens } from '../rich';
import type { Route } from '../view';

export function renderLinks(root: HTMLElement, route: Route): () => void {
  let onlyProblems = route.query.get('nur') === 'probleme';
  const search = h('input', { type: 'search', class: 'ad-input', placeholder: 'Suchen (Text, Ziel, Seite) …', 'aria-label': 'Links durchsuchen' });
  const probId = domId();
  const prob = h('input', { id: probId, type: 'checkbox', checked: onlyProblems });
  prob.addEventListener('change', () => {
    onlyProblems = prob.checked;
    render();
  });
  const summary = h('p', { class: 'ad-help', 'aria-live': 'polite' });
  const table = h('div', { class: 'ad-table ad-table--links', role: 'table', 'aria-label': 'Links' });
  let openKey: string | null = null;

  const keyOf = (l: LinkUse) => `${l.loc.path.join('.')}|${l.kind}|${l.label ?? ''}|${l.href}`;

  const render = () => {
    const doc = store.doc;
    const paths = knownPaths(doc);
    const all = collectLinks(doc).filter((l) => !(l.kind === 'link' && !l.label && !l.href));
    const q = search.value.trim().toLowerCase();
    const rows = all
      .map((l) => ({ l, check: checkHref(l.href, doc, paths) }))
      .filter(({ l, check }) => (!onlyProblems || check) && (!q || `${l.label ?? ''} ${l.href} ${describeHref(l.href, doc)} ${l.loc.label}`.toLowerCase().includes(q)));
    const errors = all.filter((l) => checkHref(l.href, doc, paths)?.level === 'error').length;
    summary.textContent = `${all.length} Links insgesamt${errors ? ` · ${errors} mit Fehler` : ' · keine toten Ziele'}.`;
    table.replaceChildren(
      h(
        'div',
        { class: 'ad-row ad-row--head', role: 'row' },
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Text'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Ziel'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Wo'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, h('span', { class: 'sr-only' }, 'Aktionen')),
      ),
      ...rows.map(({ l, check }) => {
        const key = keyOf(l);
        const editor = h('div', { class: 'ad-row__editor', hidden: openKey !== key });
        const editBtn =
          l.kind === 'rich'
            ? h('a', { class: 'ad-btn ad-btn--quiet ad-btn--sm', href: l.loc.route }, 'Im Text ändern')
            : btn(openKey === key ? 'Schließen' : 'Ändern', { kind: 'quiet', small: true, icon: 'edit', disabled: !store.canEdit, attrs: { 'aria-expanded': String(openKey === key) } });
        if (editBtn instanceof HTMLButtonElement) {
          editBtn.addEventListener('click', () => {
            openKey = openKey === key ? null : key;
            render();
          });
        }
        if (openKey === key && l.kind !== 'rich') {
          const status = h('p', { class: 'ad-help' });
          if (l.kind === 'link') {
            const link = l.parent[l.key] as unknown as LinkValue;
            const id = domId();
            const label = h('input', { id, class: 'ad-input', type: 'text', value: link.label ?? '' });
            label.addEventListener('input', () => {
              link.label = label.value;
              store.change({});
            });
            editor.append(h('div', { class: 'ad-sub' }, h('label', { class: 'ad-sublabel', for: id }, 'Text'), label));
            editor.append(h('div', { class: 'ad-sub' }, h('span', { class: 'ad-sublabel' }, 'Ziel'), targetPicker(link.href ?? '', (v) => { link.href = v; store.change({}); })));
          } else {
            editor.append(targetPicker(String(l.parent[l.key] ?? ''), (v) => { l.parent[l.key] = v; store.change({}); }));
          }
          editor.append(status, h('div', { class: 'ad-btnrow' }, btn('Fertig', { kind: 'primary', small: true, onClick: () => { openKey = null; render(); } }), h('a', { href: l.loc.route, class: 'ad-btn ad-btn--quiet ad-btn--sm' }, 'An der Stelle bearbeiten →')));
        }
        return h(
          'div',
          { class: `ad-row${check?.level === 'error' ? ' is-error' : ''}`, role: 'row' },
          h('div', { class: 'ad-cell ad-cell--main', role: 'cell' }, h('span', { class: 'ad-row__title' }, l.label ? truncate(fillTokens(l.label, store.doc.settings), 50) : '(ohne Text)'), l.kind === 'rich' ? h('span', { class: 'ad-row__sub' }, 'Link im Fließtext') : null),
          h(
            'div',
            { class: 'ad-cell', role: 'cell' },
            h('span', null, describeHref(l.href, store.doc)),
            check ? h('span', { class: 'ad-row__sub' }, badge(check.level === 'error' ? 'Fehler' : 'Hinweis', check.level === 'error' ? 'error' : 'warn'), ` ${check.message}`) : null,
          ),
          h('div', { class: 'ad-cell', role: 'cell' }, h('a', { href: l.loc.route, class: 'ad-row__where' }, l.loc.label)),
          h('div', { class: 'ad-cell ad-cell--actions', role: 'cell' }, editBtn),
          editor,
        );
      }),
    );
    if (!rows.length) table.append(emptyState(onlyProblems ? 'Keine Probleme gefunden — alle Links haben gültige Ziele.' : 'Keine Links gefunden.'));
  };
  search.addEventListener('input', render);
  render();
  root.append(
    h(
      'div',
      { class: 'ad-viewpad' },
      pageHeader('Buttons & Links', 'Alle Buttons, Menüpunkte und Links der Website. Ziele, die ins Leere zeigen, sind rot markiert. „Ändern“ bearbeitet Text und Ziel direkt hier.'),
      h('div', { class: 'ad-toolbar' }, h('label', { class: 'ad-check', for: probId }, prob, ' Nur Probleme zeigen'), search),
      summary,
      table,
    ),
  );
  const onIssues = () => {
    if (!table.contains(document.activeElement)) render();
  };
  store.addEventListener('issues', onIssues);
  return () => store.removeEventListener('issues', onIssues);
}
