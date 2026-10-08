/** Einstellungen: Stammdaten (ersetzen src/data/site.json) inkl. Öffnungszeiten-Editor mit Ausnahmen. */
import type { Settings, WeekKey } from '../../cms/types';
import { SETTINGS_GROUPS, WEEKDAYS } from '../defs';
import { h, domId, icon } from '../dom';
import { renderFields, refreshErrors } from '../fields';
import { store } from '../state';
import { btn, card, cardTitle, confirmDialog, editable, iconBtn, pageHeader } from '../ui';
import { formatDate, getAt, isPlainObject } from '../util';
import type { Route } from '../view';

type Span = [string, string];

function spanEditor(spans: Span[], path: string, onChange: () => void, label: string): HTMLElement {
  const box = h('div', { class: 'ad-spans' });
  const render = () => {
    box.replaceChildren(
      ...spans.map((sp, i) => {
        const fromId = domId();
        const toId = domId();
        const from = h('input', { id: fromId, class: 'ad-input ad-input--time', type: 'time', value: sp[0] ?? '', step: '900' });
        const to = h('input', { id: toId, class: 'ad-input ad-input--time', type: 'time', value: sp[1] ?? '', step: '900' });
        from.addEventListener('change', () => {
          sp[0] = from.value;
          onChange();
        });
        to.addEventListener('change', () => {
          sp[1] = to.value;
          onChange();
        });
        return h(
          'div',
          { class: 'ad-span' },
          h('label', { class: 'sr-only', for: fromId }, `${label}: Zeitspanne ${i + 1} von`),
          from,
          h('span', { 'aria-hidden': 'true' }, '–'),
          h('label', { class: 'sr-only', for: toId }, `${label}: Zeitspanne ${i + 1} bis`),
          to,
          h('span', null, 'Uhr'),
          iconBtn('close', `${label}: Zeitspanne ${i + 1} entfernen`, () => {
            spans.splice(i, 1);
            render();
            onChange();
          }),
          h('div', { class: 'ad-errors', dataset: { errPath: `${path}.${i}`, errPrefix: '1' } }),
        );
      }),
      spans.length < 4
        ? btn(spans.length ? 'Weitere Zeitspanne' : 'Öffnungszeit hinzufügen', {
            kind: 'quiet',
            small: true,
            icon: 'plus',
            onClick: () => {
              const last = spans.at(-1);
              spans.push(last ? [last[1], '18:00'] : ['08:00', '16:00']);
              render();
              onChange();
              (box.querySelectorAll('input[type=time]')[spans.length * 2 - 2] as HTMLInputElement | undefined)?.focus();
            },
          })
        : null,
    );
    refreshErrors(box);
  };
  render();
  return box;
}

function hoursEditor(settings: Settings): HTMLElement {
  const oh = settings.openingHours;
  oh.week ??= {} as Record<WeekKey, Span[]>;
  const changed = () => store.change({ structural: true });
  const week = h(
    'div',
    { class: 'ad-week' },
    ...WEEKDAYS.map((d) => {
      oh.week[d.key] ??= [];
      const spans = oh.week[d.key] as Span[];
      const openId = domId();
      const open = h('input', { id: openId, type: 'checkbox', class: 'ad-switch__input', role: 'switch', checked: spans.length > 0 });
      const body = h('div', { class: 'ad-day__spans' });
      const renderBody = () => body.replaceChildren(spans.length ? spanEditor(spans, `settings.openingHours.week.${d.key}`, changed, d.label) : h('span', { class: 'ad-day__closed' }, 'Ruhetag'));
      open.addEventListener('change', () => {
        if (open.checked && !spans.length) spans.push(['08:00', '16:00']);
        if (!open.checked) spans.splice(0, spans.length);
        renderBody();
        changed();
      });
      renderBody();
      return h(
        'div',
        { class: 'ad-day' },
        h('label', { class: 'ad-switch ad-day__name', for: openId }, open, h('span', { class: 'ad-switch__track', 'aria-hidden': 'true' }), h('span', { class: 'ad-switch__label' }, d.label)),
        body,
      );
    }),
  );

  const exBox = h('div', { class: 'ad-exceptions' });
  const today = new Date().toISOString().slice(0, 10);
  const renderEx = () => {
    const list = oh.exceptions;
    exBox.replaceChildren(
      ...list.map((ex, i) => {
        ex.hours ??= [];
        const dateId = domId();
        const labelId = domId();
        const date = h('input', { id: dateId, class: 'ad-input', type: 'date', value: ex.date ?? '' });
        const label = h('input', { id: labelId, class: 'ad-input', type: 'text', value: ex.label ?? '', maxlength: '60', placeholder: 'z. B. Heiligabend oder Betriebsurlaub' });
        date.addEventListener('change', () => {
          ex.date = date.value;
          list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
          renderEx();
          changed();
        });
        label.addEventListener('input', () => {
          ex.label = label.value;
          store.change({});
        });
        const closedId = domId();
        const closed = h('input', { id: closedId, type: 'checkbox', checked: ex.hours.length === 0 });
        const spansBox = h('div');
        const renderSpans = () => spansBox.replaceChildren(ex.hours.length ? spanEditor(ex.hours as Span[], `settings.openingHours.exceptions.${i}.hours`, changed, `Ausnahme ${ex.label || i + 1}`) : h('span', { class: 'ad-day__closed' }, 'Geschlossen'));
        closed.addEventListener('change', () => {
          if (closed.checked) ex.hours.splice(0, ex.hours.length);
          else ex.hours.push(['10:00', '14:00']);
          renderSpans();
          changed();
        });
        renderSpans();
        const past = ex.date && ex.date < today;
        return h(
          'div',
          { class: `ad-exception${past ? ' is-past' : ''}` },
          h(
            'div',
            { class: 'ad-exception__top' },
            h('div', { class: 'ad-sub' }, h('label', { class: 'ad-sublabel', for: dateId }, 'Datum'), date),
            h('div', { class: 'ad-sub ad-grow' }, h('label', { class: 'ad-sublabel', for: labelId }, 'Anlass'), label),
            iconBtn('trash', `Ausnahme ${ex.label || formatDate(ex.date)} entfernen`, () => {
              list.splice(i, 1);
              renderEx();
              changed();
            }, { danger: true }),
          ),
          h('label', { class: 'ad-check', for: closedId }, closed, ' Ganzer Tag geschlossen'),
          spansBox,
          past ? h('p', { class: 'ad-help' }, 'Liegt in der Vergangenheit.') : null,
          h('div', { class: 'ad-errors', dataset: { errPath: `settings.openingHours.exceptions.${i}`, errPrefix: '1' } }),
        );
      }),
      list.length ? null : h('p', { class: 'ad-help' }, 'Keine Ausnahmen eingetragen.'),
      h(
        'div',
        { class: 'ad-btnrow' },
        btn('Ausnahme hinzufügen', {
          kind: 'secondary',
          small: true,
          icon: 'plus',
          onClick: () => {
            list.push({ date: '', label: '', hours: [] });
            renderEx();
            changed();
            (exBox.querySelectorAll('input[type=date]')[list.length - 1] as HTMLInputElement | undefined)?.focus();
          },
        }),
        list.some((x) => x.date && x.date < today)
          ? btn('Vergangene entfernen', {
              kind: 'quiet',
              small: true,
              onClick: async () => {
                const n = list.filter((x) => x.date && x.date < today).length;
                if (!(await confirmDialog({ title: 'Vergangene Ausnahmen entfernen?', message: `${n} Eintrag/Einträge vor dem heutigen Tag werden gelöscht.`, confirm: 'Entfernen' }))) return;
                oh.exceptions = list.filter((x) => !x.date || x.date >= today);
                renderEx();
                changed();
              },
            })
          : null,
      ),
    );
    refreshErrors(exBox);
  };
  renderEx();
  void renderEx;
  return h(
    'div',
    { class: 'ad-hours' },
    h('h3', { class: 'ad-h3' }, 'Reguläre Woche'),
    h('p', { class: 'ad-help' }, 'Schalter aus = Ruhetag. Mehrere Zeitspannen (z. B. Mittagspause) sind möglich.'),
    week,
    h('h3', { class: 'ad-h3' }, 'Ausnahmen (Feiertage, Urlaub, Sonderöffnungen)'),
    h('p', { class: 'ad-help' }, 'Gilt nur an diesem Datum und hat Vorrang vor der regulären Woche.'),
    exBox,
    h('p', { class: 'ad-help' }, icon('help'), ' Die Öffnungszeiten erscheinen im Footer, auf der Besuchsseite, im „Jetzt geöffnet"-Hinweis und bei Google.'),
  );
}

export function renderSettings(root: HTMLElement, route: Route): void {
  const settings = store.doc.settings;
  const ro = !store.canEdit;
  const groups = SETTINGS_GROUPS.map((g) => {
    let obj = getAt(settings, g.path);
    if (!isPlainObject(obj)) {
      obj = {};
      let cur = settings as unknown as Record<string, unknown>;
      for (const [i, k] of g.path.entries()) {
        if (i === g.path.length - 1) cur[k] = obj;
        else cur = (cur[k] ??= {}) as Record<string, unknown>;
      }
    }
    return card(cardTitle(g.title, g.intro), renderFields(g.fields, obj as Record<string, unknown>, { path: ['settings', ...g.path] }));
  });
  const hoursCard = card(cardTitle('Öffnungszeiten'), hoursEditor(settings));
  hoursCard.id = 'oeffnungszeiten';
  groups.splice(1, 0, hoursCard);
  root.append(
    h(
      'div',
      { class: 'ad-viewpad ad-viewpad--narrow' },
      pageHeader('Einstellungen', 'Stammdaten des Cafés. Sie werden an vielen Stellen der Website automatisch verwendet (Kopf, Fuß, Besuchsseite, Google-Angaben).'),
      editable(ro, ...groups),
    ),
  );
  refreshErrors(root);
  if (route.query.get('bereich') === 'zeiten') requestAnimationFrame(() => hoursCard.scrollIntoView({ block: 'start' }));
}
