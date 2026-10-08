/**
 * CMS-Datenmodell (docs/CMS-PLAN.md §3). Ein SiteDoc ist der komplette, versionierbare Inhaltsstand
 * der Live-Site (Variante A). Er liegt als JSON vor: im Repo als Seed (src/cms/seed/**, zusammengesetzt
 * von src/cms/store.mjs), im Betrieb als /data/cms/{draft,published}.json (server/lib/cms/**).
 *
 * Konventionen:
 * - IDs: kebab-case `^[a-z0-9][a-z0-9-]{0,63}$`, eindeutig in ihrem Geltungsbereich.
 * - Texte sind reiner Text (beim Rendern escaped). Felder vom Typ `rich` nutzen das kleine,
 *   sichere Markup aus src/cms/rich.mjs (Absätze, **fett**, *kursiv*, [Link](ziel), Zeilenumbruch).
 * - Linkziele (`Href`): `page:<seitenId>[#anker]`, `/pfad`, `https://…`, `mailto:…`, `tel:…`,
 *   sowie die Platzhalter `{{tel}}` (Telefon aus den Einstellungen) und `{{route}}` (Routenplaner).
 * - Bilder: `MediaRef` verweist auf einen Eintrag der Medienbibliothek (`media[].id`).
 */

export type Id = string;
/** Linkziel, s. Kopfkommentar */
export type Href = string;
/** Text mit kleinem Markup (src/cms/rich.mjs) */
export type RichText = string;

export interface MediaRef {
  /** media[].id */
  media: Id;
  /** Alt-Text nur für diese Stelle; leer/fehlend = Alt-Text aus der Medienbibliothek */
  alt?: string;
}

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'link';

export interface LinkValue {
  label: string;
  href: Href;
  newTab?: boolean;
  /** false = ausgeblendet (Standard: sichtbar) */
  visible?: boolean;
  /** nur wo die Komponente Varianten unterstützt */
  variant?: ButtonVariant;
}

export interface Seo {
  /** kompletter <title> */
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: MediaRef;
  /** absolute URL; leer = automatisch (Live-Domain + Pfad) */
  canonical?: string;
  /** true = noindex,nofollow + nicht in der Sitemap */
  noindex?: boolean;
}

export interface Section<F = Record<string, unknown>> {
  /** eindeutig innerhalb der Seite */
  id: Id;
  /** Sektionstyp = Ordnername unter src/cms/sections/ */
  type: string;
  visible: boolean;
  fields: F;
}

export interface PageDoc {
  id: Id;
  /** URL ohne führenden Slash; '' = Startseite; darf '/' enthalten (z. B. 'karte/schnecken') */
  slug: string;
  /** Name in der Seitenverwaltung */
  title: string;
  status: 'published' | 'disabled';
  /** builtin = gehört zum Grundbestand (deaktivierbar, nicht löschbar); custom = vom Admin angelegt */
  kind: 'builtin' | 'custom';
  /** Brotkrumen-Beschriftung (leer = keine Brotkrumen auf dieser Seite; Vorfahren über das Slug-Präfix) */
  breadcrumb?: string;
  /** Brotkrumen auf dieser Seite anzeigen (Standard: false) */
  showBreadcrumbs?: boolean;
  /** strukturierte Daten im <head>, in dieser Reihenfolge */
  structuredData?: ('localBusiness' | 'menu' | 'faq')[];
  /**
   * Vorlage: 'menu-category' = eine Seite je Karten-Kategorie unter <slug ohne /*>/<kategorie>
   * (slug endet auf '/*'); Kategorien mit eigener Seite (z. B. karte/schnecken) werden übersprungen.
   */
  template?: 'menu-category';
  /** structuredData 'menu': nur diese Karten-Kategorie (Slug) statt der ganzen Karte, z. B. 'schnecken' */
  menuScope?: string;
  /** system = hat eine eigene Route (z. B. 404), wird nicht über die CMS-Route ausgeliefert */
  system?: boolean;
  seo: Seo;
  sections: Section[];
}

export interface NavItem {
  id: Id;
  label: string;
  href: Href;
  visible?: boolean;
  newTab?: boolean;
  /** Dropdown (nur Hauptnavigation) */
  children?: NavItem[];
}

export interface Navigation {
  /** Hauptnavigation im Header (Desktop + Mobil-Menü) */
  main: NavItem[];
  /** Button rechts im Header bzw. im Mobil-Menü */
  cta: LinkValue;
  /** Footer „Mehr" */
  footer: NavItem[];
  /** Rechtliche Links (Footer unten) */
  legal: NavItem[];
  /** Social-Media-Links */
  social: NavItem[];
}

export interface LayoutDoc {
  header: {
    logo: MediaRef | null; // null = Standard-Wortmarke
    showOpeningStatus: boolean;
  };
  footer: {
    claim: string;
    text: string;
    navHeading: string;
    hoursHeading: string;
    /** Platzhalter: {jahr}, {stadt}, {name} */
    copyright: string;
  };
  /** Mobile Leiste unten: genau die Einträge in dieser Reihenfolge */
  stickyBar: { items: (LinkValue & { id: Id; icon: 'menu' | 'phone' | 'route' | 'bag' })[] };
}

export type WeekKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Ersetzt src/data/site.json (gleiche Feldnamen, damit alle bisherigen Nutzer weiter funktionieren) */
export interface Settings {
  name: string;
  shortName: string;
  claim: string;
  subline: string;
  type: string;
  address: { street: string; zip: string; city: string; region: string; country: string };
  geo: { lat: number; lng: number };
  phone: string;
  phoneDisplay: string;
  email?: string;
  instagram: string;
  rating: { value: number; count: number; source: string };
  priceRange: string;
  tooGoodToGo: { partner: boolean; bagValue: number; bagPrice: number };
  openingHours: {
    week: Record<WeekKey, [string, string][]>;
    exceptions: { date: string; hours: [string, string][]; label: string }[];
  };
  breakfastUntil: string;
  payment: string;
  accessible: boolean;
  dogs: string;
  goLiveAt: string;
  /** Live-Domain für Canonical/Sitemap/OG */
  siteUrl: string;
  seoDefaults: { ogImage: MediaRef | null; themeColor: string };
  [key: string]: unknown;
}

export interface MediaItem {
  id: Id;
  /** builtin = Foto aus src/assets/photos; placeholder = generierter Platzhalter; upload = hochgeladen */
  kind: 'builtin' | 'placeholder' | 'upload';
  /** builtin: 'photos/<datei>' · placeholder: 'placeholders/a/<datei>' · upload: 'media/<datei>' (relativ zu src/assets) */
  file: string;
  alt: string;
  width?: number;
  height?: number;
  /** Ersetzt durch Upload: zeigt dann auf 'media/<datei>' (builtin/placeholder bleiben als Herkunft erhalten) */
  replacedBy?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface Redirect {
  from: string; // '/alt'
  to: string; // '/neu'
  status: 301 | 302;
  createdAt?: string;
}

export interface MenuItem {
  name: string;
  description?: string;
  price?: number;
  priceIsPlaceholder?: boolean;
  priceSuffix?: string;
  tags?: string[];
  allergens?: string[];
  /** Saison-Hinweis als Text (z. B. „nach Jahreszeit") */
  seasonal?: string;
  motif?: Id;
  [key: string]: unknown;
}

export interface MenuCategory {
  slug: string;
  title: string;
  intro?: string;
  note?: string;
  order?: number;
  items: MenuItem[];
  [key: string]: unknown;
}

export interface FaqItem {
  id: Id;
  question: string;
  answer: RichText;
  /** auf der FAQ-Seite anzeigen */
  visible: boolean;
}

export interface Testimonial {
  id: Id;
  quote: string;
  author: string;
  isPlaceholder: boolean;
}

export interface Collections {
  menu: MenuCategory[];
  faq: FaqItem[];
  testimonials: Testimonial[];
  heuteFrisch: { date: string; items: { name: string; note?: string; motif?: Id; [key: string]: unknown }[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface SiteDoc {
  schemaVersion: number;
  settings: Settings;
  navigation: Navigation;
  layout: LayoutDoc;
  pages: PageDoc[];
  collections: Collections;
  media: MediaItem[];
  redirects: Redirect[];
  /** wird vom Server gesetzt */
  meta?: { revision?: number; updatedAt?: string; updatedBy?: string };
}

/* ------------------------------------------------------------------ Sektions-Definitionen ---- */

export type FieldKind =
  | 'text' // einzeilig
  | 'textarea' // mehrzeilig, reiner Text
  | 'rich' // mehrzeilig mit kleinem Markup
  | 'media' // MediaRef
  | 'link' // LinkValue
  | 'href' // nur Linkziel
  | 'list' // Array von Objekten (fields: of)
  | 'select'
  | 'boolean'
  | 'number'
  | 'page' // Seiten-ID
  | 'collection'; // Verweis auf eine Sammlung (options = Sammlungsnamen)

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  required?: boolean;
  maxLength?: number;
  /** select/collection */
  options?: { value: string; label: string }[];
  /** list: Felder je Eintrag */
  of?: FieldDef[];
  /** list: welches Unterfeld den Eintrag in der Liste benennt */
  itemLabel?: string;
  /** list: Mindest-/Höchstzahl */
  min?: number;
  max?: number;
  /** link: welche Varianten die Komponente kann (leer = keine Auswahl) */
  variants?: string[];
}

export interface SectionDefinition {
  type: string;
  label: string;
  description: string;
  /** '*' = auf allen Seiten (auch neuen) einsetzbar, sonst nur auf diesen Seiten-IDs */
  allowedOn: '*' | Id[];
  fields: FieldDef[];
  /** Startwerte für eine neu hinzugefügte Sektion */
  defaults: () => Record<string, unknown>;
}

export interface CollectionDefinition {
  name: string;
  label: string;
  description: string;
  fields: FieldDef[];
}
