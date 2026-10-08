/**
 * Ziel-Wähler für Links: Seite aus der Liste (folgt Adressänderungen), externe Web-Adresse, Anruf,
 * E-Mail, Routenplaner, Adresse auf dieser Website. Ergebnis ist ein Href (src/cms/types.ts).
 */
import { h, domId } from './dom';
import { store } from './state';
import { checkHref, describeHref } from './scan';
import { pagePath } from './rich';

type TargetType = 'page' | 'url' | 'tel' | 'telx' | 'mail' | 'route' | 'path';

const TYPE_LABELS: [TargetType, string][] = [
  ['page', 'Seite dieser Website'],
  ['url', 'Externe Web-Adresse'],
  ['tel', 'Anruf (Telefonnummer aus den Einstellungen)'],
  ['telx', 'Anruf (andere Nummer)'],
  ['mail', 'E-Mail schreiben'],
  ['route', 'Routenplaner (Google Maps)'],
  ['path', 'Eigene Adresse auf dieser Website'],
];

interface Parsed {
  type: TargetType;
  page?: string;
  anchor?: string;
  text?: string;
}

export function parseHref(href: string): Parsed {
  const v = (href ?? '').trim();
  if (!v) return { type: 'page', page: '' };
  if (v.startsWith('page:')) {
    const [page, anchor] = v.slice(5).split('#');
    return { type: 'page', page, anchor: anchor ?? '' };
  }
  if (v === '{{tel}}') return { type: 'tel' };
  if (v === '{{route}}') return { type: 'route' };
  if (v.startsWith('tel:')) return { type: 'telx', text: v.slice(4) };
  if (v.startsWith('mailto:')) return { type: 'mail', text: v.slice(7) };
  if (v.startsWith('/') || v.startsWith('#')) return { type: 'path', text: v };
  return { type: 'url', text: v };
}

export function buildHref(p: Parsed): string {
  const t = (p.text ?? '').trim();
  switch (p.type) {
    case 'page':
      return p.page ? `page:${p.page}${p.anchor?.trim() ? `#${p.anchor.trim().replace(/^#/, '')}` : ''}` : '';
    case 'tel':
      return '{{tel}}';
    case 'route':
      return '{{route}}';
    case 'telx':
      return t ? `tel:${t.replace(/[^\d+]/g, '')}` : '';
    case 'mail':
      return t ? `mailto:${t.replace(/^mailto:/, '')}` : '';
    case 'path':
      return t ? (t.startsWith('/') || t.startsWith('#') ? t : `/${t}`) : '';
    case 'url':
      return t ? (/^[a-z]+:/i.test(t) ? t : `https://${t}`) : '';
  }
}

/**
 * @param value aktuelles Linkziel
 * @param onChange neues Linkziel (bei jeder Eingabe)
 */
export function targetPicker(value: string, onChange: (href: string) => void, opts: { label?: string; required?: boolean } = {}): HTMLElement {
  let parsed = parseHref(value);
  const typeId = domId('tt');
  const root = h('div', { class: 'ad-target' });
  const detail = h('div', { class: 'ad-target__detail' });
  const status = h('p', { class: 'ad-target__status', 'aria-live': 'polite' });

  const typeSel = h(
    'select',
    { id: typeId, class: 'ad-input', 'aria-label': `${opts.label ?? 'Ziel'}: Art` },
    ...TYPE_LABELS.map(([v, l]) => h('option', { value: v, selected: v === parsed.type }, l)),
  );

  const emit = () => {
    const href = buildHref(parsed);
    onChange(href);
    showStatus(href);
  };

  const showStatus = (href: string) => {
    const doc = store.doc;
    const check = href ? checkHref(href, doc) : opts.required ? { level: 'error' as const, message: 'Bitte ein Ziel wählen' } : null;
    status.className = `ad-target__status${check ? ` is-${check.level}` : ''}`;
    status.textContent = href ? `→ ${describeHref(href, doc)}${check ? ` — ${check.message}` : ''}` : check ? check.message : 'Kein Ziel';
  };

  const renderDetail = () => {
    detail.replaceChildren();
    const doc = store.doc;
    switch (parsed.type) {
      case 'page': {
        const sel = h(
          'select',
          { class: 'ad-input', 'aria-label': 'Zielseite' },
          h('option', { value: '' }, '– Seite wählen –'),
          ...doc.pages
            .filter((p) => !p.system && p.template !== 'menu-category')
            .map((p) =>
              h('option', { value: p.id, selected: p.id === parsed.page }, `${p.title} (${pagePath(p)})${p.status !== 'published' ? ' — deaktiviert' : ''}`),
            ),
        );
        if (parsed.page && !doc.pages.some((p) => p.id === parsed.page))
          sel.append(h('option', { value: parsed.page, selected: true }, `„${parsed.page}“ (gibt es nicht mehr)`));
        sel.addEventListener('change', () => {
          parsed.page = sel.value;
          emit();
        });
        const anchor = h('input', {
          class: 'ad-input',
          type: 'text',
          value: parsed.anchor ?? '',
          placeholder: 'Sprungmarke (optional), z. B. oeffnungszeiten',
          'aria-label': 'Sprungmarke auf der Zielseite (optional)',
          autocomplete: 'off',
        });
        anchor.addEventListener('input', () => {
          parsed.anchor = anchor.value;
          emit();
        });
        detail.append(h('div', { class: 'ad-target__row' }, sel, anchor));
        break;
      }
      case 'url':
      case 'telx':
      case 'mail':
      case 'path': {
        const conf = {
          url: { type: 'url', ph: 'https://…', label: 'Web-Adresse' },
          telx: { type: 'tel', ph: '+49 38296 …', label: 'Telefonnummer' },
          mail: { type: 'email', ph: 'name@beispiel.de', label: 'E-Mail-Adresse' },
          path: { type: 'text', ph: '/karte#kuchen', label: 'Adresse auf dieser Website (beginnt mit /)' },
        }[parsed.type];
        const inp = h('input', { class: 'ad-input', type: conf.type, value: parsed.text ?? '', placeholder: conf.ph, 'aria-label': conf.label, autocomplete: 'off' });
        inp.addEventListener('input', () => {
          parsed.text = inp.value;
          emit();
        });
        detail.append(inp);
        break;
      }
      case 'tel':
        detail.append(h('p', { class: 'ad-help' }, `Ruft ${doc.settings?.phoneDisplay || doc.settings?.phone || '(keine Nummer hinterlegt)'} an — ändert sich automatisch mit den Einstellungen.`));
        break;
      case 'route':
        detail.append(h('p', { class: 'ad-help' }, 'Öffnet die Route zur Adresse aus den Einstellungen in Google Maps.'));
        break;
    }
  };

  typeSel.addEventListener('change', () => {
    const prev = parsed;
    parsed = { type: typeSel.value as TargetType, page: prev.type === 'page' ? prev.page : '', text: '' };
    if (parsed.type === 'url') parsed.text = '';
    renderDetail();
    emit();
  });

  renderDetail();
  showStatus(value);
  root.append(typeSel, detail, status);
  return root;
}
