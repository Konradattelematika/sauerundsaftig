/**
 * Felddefinitionen für das Dashboard: Sektionstypen (src/cms/sections/<typ>/definition.mjs),
 * Sammlungen (src/cms/collections/*.mjs) und die festen Formulare (Navigation, Header & Footer,
 * Einstellungen, Seiteneinstellungen). Alles reines JS — dieselben Definitionen nutzt der Server.
 */
import type { FieldDef, PageDoc, SectionDefinition } from '../cms/types';

/** FieldDef + Admin-Erweiterungen (s. Kopfkommentar in src/cms/collections/menu.mjs) */
export interface AdminFieldDef extends FieldDef {
  of?: AdminFieldDef[];
  input?: 'date' | 'time' | 'url' | 'email' | 'tel' | 'color';
  idOnly?: boolean;
  placeholder?: string;
  /** nur anzeigen, nicht bearbeiten */
  readOnly?: boolean;
  /** Feld im Formular breit/schmal (Raster) */
  width?: 'half' | 'third';
  /** list: Einträge brauchen eine eindeutige `id` (wird beim Hinzufügen erzeugt) */
  itemIds?: boolean;
  /** list: Beschriftung des Hinzufügen-Knopfs (Standard „Eintrag hinzufügen“) */
  addLabel?: string;
}

export interface AdminSectionDefinition extends SectionDefinition {
  fields: AdminFieldDef[];
}

export interface AdminCollectionDefinition {
  name: string;
  label: string;
  description: string;
  shape: 'list' | 'object';
  itemLabel?: string;
  fields: AdminFieldDef[];
}

const sectionMods = import.meta.glob<{ default: AdminSectionDefinition }>('../cms/sections/*/definition.mjs', { eager: true });
const collectionMods = import.meta.glob<{ default: AdminCollectionDefinition }>('../cms/collections/*.mjs', { eager: true });

export const SECTION_DEFS: Record<string, AdminSectionDefinition> = Object.fromEntries(
  Object.entries(sectionMods)
    .map(([p, m]) => [p.split('/').at(-2) as string, m.default] as const)
    .filter(([, d]) => d && typeof d === 'object' && Array.isArray(d.fields)),
);

export const COLLECTION_DEFS: Record<string, AdminCollectionDefinition> = Object.fromEntries(
  Object.values(collectionMods)
    .map((m) => m.default)
    .filter((d) => d && d.name)
    .map((d) => [d.name, d]),
);

export function sectionDef(type: string): AdminSectionDefinition | undefined {
  return SECTION_DEFS[type];
}

/** Darf dieser Sektionstyp auf dieser Seite eingesetzt werden? */
export function allowedOn(def: SectionDefinition, page: Pick<PageDoc, 'id' | 'kind'>): boolean {
  if (def.allowedOn === '*') return true;
  return page.kind !== 'custom' && Array.isArray(def.allowedOn) && def.allowedOn.includes(page.id);
}

export function allowedSectionTypes(page: Pick<PageDoc, 'id' | 'kind'>): AdminSectionDefinition[] {
  return Object.values(SECTION_DEFS)
    .filter((d) => allowedOn(d, page))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

/** Startwert eines Feldes für neue Listeneinträge */
export function emptyValue(def: AdminFieldDef): unknown {
  switch (def.kind) {
    case 'text':
    case 'textarea':
    case 'rich':
    case 'href':
    case 'page':
      return '';
    case 'boolean':
      return def.key === 'visible';
    case 'list':
      return [];
    case 'link':
      return { label: '', href: '' };
    case 'media':
    case 'number':
    case 'select':
    case 'collection':
    default:
      return undefined;
  }
}

export function emptyItem(defs: AdminFieldDef[] | undefined): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const d of defs ?? []) {
    const v = emptyValue(d);
    if (v !== undefined) o[d.key] = v;
    if (d.kind === 'select' && d.required && d.options?.length) o[d.key] = d.options[0].value;
  }
  return o;
}

/* ------------------------------------------------------------------ feste Formulare ---------- */

const navItemFields = (withChildren: boolean): AdminFieldDef[] => [
  { key: 'label', label: 'Beschriftung', kind: 'text', required: true, maxLength: 60 },
  { key: 'href', label: 'Ziel', kind: 'href', required: true },
  { key: 'visible', label: 'Sichtbar', kind: 'boolean' },
  { key: 'newTab', label: 'In neuem Tab öffnen', kind: 'boolean' },
  ...(withChildren
    ? [
        {
          key: 'children',
          label: 'Untermenü',
          kind: 'list',
          itemLabel: 'label',
          itemIds: true,
          addLabel: 'Unterpunkt hinzufügen',
          max: 12,
          help: 'Optional: Einträge, die beim Darüberfahren bzw. Antippen aufklappen.',
          of: navItemFields(false),
        } satisfies AdminFieldDef,
      ]
    : []),
];

export const NAV_DEFS: { key: 'main' | 'footer' | 'legal' | 'social'; def: AdminFieldDef; intro: string }[] = [
  {
    key: 'main',
    intro: 'Die Menüpunkte oben im Kopf der Website (am Handy im aufklappbaren Menü). Einträge können ein Untermenü haben.',
    def: { key: 'main', label: 'Hauptnavigation', kind: 'list', itemLabel: 'label', itemIds: true, addLabel: 'Menüpunkt hinzufügen', max: 9, of: navItemFields(true) },
  },
  {
    key: 'footer',
    intro: 'Die Liste „Mehr“ im Fuß der Website.',
    def: { key: 'footer', label: 'Footer-Links', kind: 'list', itemLabel: 'label', itemIds: true, addLabel: 'Link hinzufügen', max: 16, of: navItemFields(false) },
  },
  {
    key: 'legal',
    intro: 'Impressum, Datenschutz und andere Pflichtangaben ganz unten.',
    def: { key: 'legal', label: 'Rechtliches', kind: 'list', itemLabel: 'label', itemIds: true, addLabel: 'Link hinzufügen', max: 6, of: navItemFields(false) },
  },
  {
    key: 'social',
    intro: 'Links zu Instagram & Co.',
    def: { key: 'social', label: 'Social Media', kind: 'list', itemLabel: 'label', itemIds: true, addLabel: 'Profil hinzufügen', max: 6, of: navItemFields(false) },
  },
];

export const NAV_CTA_DEF: AdminFieldDef = {
  key: 'cta',
  label: 'Button im Kopf der Website',
  kind: 'link',
  help: 'Der hervorgehobene Button rechts in der Kopfleiste (am Handy im Menü).',
};

export const HEADER_DEFS: AdminFieldDef[] = [
  { key: 'logo', label: 'Logo', kind: 'media', help: 'Leer lassen = Standard-Wortmarke „sauer & saftig“.' },
  { key: 'showOpeningStatus', label: 'Öffnungsstatus im Kopf anzeigen („Jetzt geöffnet …“)', kind: 'boolean' },
];

export const FOOTER_DEFS: AdminFieldDef[] = [
  { key: 'claim', label: 'Leitsatz', kind: 'text', maxLength: 80, help: 'Groß unter dem Logo. Leer = wird nicht angezeigt.' },
  { key: 'text', label: 'Kurztext', kind: 'textarea', maxLength: 300, help: 'Leer = wird nicht angezeigt.' },
  { key: 'navHeading', label: 'Überschrift der Linkliste', kind: 'text', maxLength: 40, help: 'Leer = keine Überschrift.' },
  { key: 'hoursHeading', label: 'Überschrift der Öffnungszeiten', kind: 'text', maxLength: 40, help: 'Leer = keine Überschrift.' },
  { key: 'copyright', label: 'Copyright-Zeile', kind: 'text', maxLength: 160, help: '{jahr} = aktuelles Jahr, {stadt} = Ort aus den Einstellungen.' },
];

export const STICKY_DEF: AdminFieldDef = {
  key: 'items',
  label: 'Leiste unten am Handy',
  kind: 'list',
  itemLabel: 'label',
  itemIds: true,
  addLabel: 'Schnellzugriff hinzufügen',
  max: 4,
  help: 'Die Schnellzugriffe am unteren Bildschirmrand auf dem Handy — höchstens 4.',
  of: [
    {
      key: 'icon',
      label: 'Symbol',
      kind: 'select',
      required: true,
      options: [
        { value: 'menu', label: 'Karte (Buch)' },
        { value: 'phone', label: 'Telefon' },
        { value: 'route', label: 'Route (Pin)' },
        { value: 'bag', label: 'Tüte (Vorbestellen)' },
      ],
    },
    { key: 'label', label: 'Beschriftung', kind: 'text', required: true, maxLength: 20 },
    { key: 'href', label: 'Ziel', kind: 'href', required: true },
    {
      key: 'variant',
      label: 'Hervorhebung',
      kind: 'select',
      options: [
        { value: 'accent', label: 'Hervorgehoben (Sanddorn-Hintergrund)' },
      ],
      placeholder: 'Normal',
      help: 'Höchstens einen Eintrag hervorheben (z. B. Vorbestellen).',
    },
    { key: 'newTab', label: 'In neuem Tab öffnen', kind: 'boolean' },
    { key: 'visible', label: 'Sichtbar', kind: 'boolean' },
  ],
};

export const SETTINGS_GROUPS: { title: string; intro?: string; path: string[]; fields: AdminFieldDef[] }[] = [
  {
    title: 'Name & Beschreibung',
    path: [],
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 60 },
      { key: 'shortName', label: 'Kurzname', kind: 'text', maxLength: 30, help: 'Für knappe Stellen (z. B. App-Symbol).' },
      { key: 'claim', label: 'Leitsatz', kind: 'text', maxLength: 80 },
      { key: 'subline', label: 'Unterzeile', kind: 'textarea', maxLength: 200 },
      { key: 'type', label: 'Art des Betriebs', kind: 'text', maxLength: 60, help: 'z. B. „Café mit eigener Backstube“.' },
    ],
  },
  {
    title: 'Adresse',
    path: ['address'],
    fields: [
      { key: 'street', label: 'Straße und Hausnummer', kind: 'text', required: true, maxLength: 80 },
      { key: 'zip', label: 'Postleitzahl', kind: 'text', required: true, maxLength: 10, width: 'third' },
      { key: 'city', label: 'Ort', kind: 'text', required: true, maxLength: 60 },
      { key: 'region', label: 'Bundesland', kind: 'text', maxLength: 60 },
      { key: 'country', label: 'Land (Kürzel)', kind: 'text', maxLength: 2, width: 'third', help: 'z. B. DE' },
    ],
  },
  {
    title: 'Kontakt',
    path: [],
    fields: [
      { key: 'phone', label: 'Telefon (international)', kind: 'text', input: 'tel', required: true, maxLength: 30, help: 'z. B. +49 38296 769924 — für Anruf-Links.' },
      { key: 'phoneDisplay', label: 'Telefon (Anzeige)', kind: 'text', maxLength: 30, help: 'So steht die Nummer auf der Website, z. B. 038296 769924.' },
      { key: 'email', label: 'E-Mail-Adresse', kind: 'text', input: 'email', maxLength: 120, help: 'Leer = keine E-Mail-Adresse auf der Website.' },
      { key: 'instagram', label: 'Instagram-Name', kind: 'text', maxLength: 60, help: 'Ohne @, z. B. sauerundsaftig.' },
    ],
  },
  {
    title: 'Café-Infos',
    path: [],
    fields: [
      { key: 'breakfastUntil', label: 'Frühstück bis (Uhrzeit)', kind: 'text', input: 'time', width: 'third' },
      { key: 'payment', label: 'Bezahlung', kind: 'text', maxLength: 60, help: 'z. B. „bar oder Karte“.' },
      { key: 'dogs', label: 'Hunde', kind: 'text', maxLength: 60, help: 'z. B. „an der Leine erlaubt“.' },
      { key: 'accessible', label: 'Barrierefrei zugänglich', kind: 'boolean' },
      { key: 'priceRange', label: 'Preisniveau', kind: 'select', options: [{ value: '€', label: '€ (günstig)' }, { value: '€€', label: '€€ (mittel)' }, { value: '€€€', label: '€€€ (gehoben)' }] },
    ],
  },
  {
    title: 'Bewertung',
    intro: 'Wird auf der Startseite und für Google angezeigt. Bitte nur echte Werte eintragen.',
    path: ['rating'],
    fields: [
      { key: 'value', label: 'Durchschnitt (z. B. 4,6)', kind: 'number', width: 'third' },
      { key: 'count', label: 'Anzahl Bewertungen', kind: 'number', width: 'third' },
      { key: 'source', label: 'Quelle', kind: 'text', maxLength: 40, width: 'third' },
    ],
  },
  {
    title: 'Too Good To Go',
    path: ['tooGoodToGo'],
    fields: [
      { key: 'partner', label: 'Wir sind Too-Good-To-Go-Partner', kind: 'boolean' },
      { key: 'bagValue', label: 'Warenwert einer Tüte (€)', kind: 'number', width: 'half' },
      { key: 'bagPrice', label: 'Preis einer Tüte (€)', kind: 'number', width: 'half' },
    ],
  },
  {
    title: 'Kartenposition',
    intro: 'Koordinaten für Karte und Routenplaner. Nur ändern, wenn der Pin falsch sitzt.',
    path: ['geo'],
    fields: [
      { key: 'lat', label: 'Breitengrad', kind: 'number', width: 'half' },
      { key: 'lng', label: 'Längengrad', kind: 'number', width: 'half' },
    ],
  },
  {
    title: 'Website',
    path: [],
    fields: [
      { key: 'siteUrl', label: 'Adresse der Website', kind: 'text', input: 'url', required: true, help: 'z. B. https://sauerundsaftig.de — für Suchmaschinen und Vorschaubilder.' },
    ],
  },
];

export const WEEKDAYS: { key: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; label: string }[] = [
  { key: 'mon', label: 'Montag' },
  { key: 'tue', label: 'Dienstag' },
  { key: 'wed', label: 'Mittwoch' },
  { key: 'thu', label: 'Donnerstag' },
  { key: 'fri', label: 'Freitag' },
  { key: 'sat', label: 'Samstag' },
  { key: 'sun', label: 'Sonntag' },
];

export const VARIANT_LABELS: Record<string, string> = {
  primary: 'Dunkel (Standard)',
  accent: 'Sanddorn (auffällig)',
  secondary: 'Kontur',
  ghost: 'Dezent',
  link: 'Textlink',
};

/** Adressen, die keine Seite bekommen darf (feste Routen von Website und Server) */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'login', 'logout', 'passwort', 'countdown', 'checkliste', 'module', 'varianten', 'dev',
  'b', 'c', 'd', '404', '_astro', 'brand', 'healthz', 'robots.txt', 'sitemap-index.xml', 'sitemap-0.xml',
  'favicon.ico', 'site.webmanifest', 'media', 'vorschau',
]);
