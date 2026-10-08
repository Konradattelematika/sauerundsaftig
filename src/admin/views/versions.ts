/** Versionen: veröffentlichte Stände, „Als Entwurf wiederherstellen" mit Rückfrage. */
import { api, ApiError, type VersionInfo } from '../api';
import { h } from '../dom';
import { store } from '../state';
import { badge, btn, card, confirmDialog, emptyState, loading, notice, pageHeader, toast } from '../ui';
import { formatDateTime } from '../util';

export function renderVersions(root: HTMLElement): void {
  const list = h('div', { class: 'ad-table ad-table--versions', role: 'table', 'aria-label': 'Versionen' }, loading('Lade Versionen …'));
  const load = async () => {
    let versions: VersionInfo[];
    try {
      versions = await api.versions();
    } catch (e) {
      list.replaceChildren(notice('error', h('p', null, e instanceof ApiError ? e.message : 'Versionen konnten nicht geladen werden.')));
      return;
    }
    versions.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || b.revision - a.revision);
    const currentRev = store.publishedMeta?.revision;
    list.replaceChildren(
      h(
        'div',
        { class: 'ad-row ad-row--head', role: 'row' },
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Veröffentlicht'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Von'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Stand'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, h('span', { class: 'sr-only' }, 'Aktionen')),
      ),
      ...versions.map((v, i) =>
        h(
          'div',
          { class: 'ad-row', role: 'row' },
          h('div', { class: 'ad-cell ad-cell--main', role: 'cell' }, h('span', { class: 'ad-row__title' }, formatDateTime(v.publishedAt)), i === 0 || v.revision === currentRev ? badge('aktuell online', 'ok') : null),
          h('div', { class: 'ad-cell', role: 'cell' }, v.publishedBy ?? '—'),
          h('div', { class: 'ad-cell', role: 'cell' }, `Nr. ${v.revision}`),
          h(
            'div',
            { class: 'ad-cell ad-cell--actions', role: 'cell' },
            store.canEdit
              ? btn('Als Entwurf wiederherstellen', {
                  kind: 'quiet',
                  small: true,
                  icon: 'history',
                  onClick: async () => {
                    const ok = await confirmDialog({
                      title: 'Diese Version wiederherstellen?',
                      message: h(
                        'div',
                        null,
                        h('p', null, `Der Entwurf wird durch den Stand vom ${formatDateTime(v.publishedAt)} ersetzt. Deine aktuellen, nicht veröffentlichten Änderungen gehen dabei verloren.`),
                        h('p', null, 'Online ändert sich erst etwas, wenn du danach „Veröffentlichen" klickst.'),
                      ),
                      confirm: 'Wiederherstellen',
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await store.flush();
                      await api.restore(v.id);
                      await store.reload();
                      toast('Version als Entwurf wiederhergestellt. Prüfe sie in der Vorschau und veröffentliche sie dann.', 'ok', 8000);
                    } catch (e) {
                      toast(e instanceof ApiError ? e.message : 'Wiederherstellen fehlgeschlagen.', 'error');
                    }
                  },
                })
              : null,
          ),
        ),
      ),
    );
    if (!versions.length) list.append(emptyState('Noch keine Versionen — sie entstehen bei jedem Veröffentlichen.'));
  };
  root.append(
    h(
      'div',
      { class: 'ad-viewpad ad-viewpad--narrow' },
      pageHeader('Versionen', 'Bei jedem Veröffentlichen wird der bisherige Stand gesichert (die letzten 100). Du kannst jede Version als Entwurf zurückholen, prüfen und erneut veröffentlichen.'),
      card(list),
    ),
  );
  void load();
}
