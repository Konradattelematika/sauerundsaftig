/** Metadaten der drei Design-Varianten — für Wähler-Seite, Layouts und OG-Images. */

export type VariantKey = 'a' | 'b' | 'c';

export interface VariantMeta {
  key: VariantKey;
  name: string;
  workingTitle: string; // „Krume" etc.
  stance: string; // Haltung in einem Satz (für die Wähler-Seite)
  base: string; // Basis-Pfad, z. B. "/a"
  swatches: string[]; // Farbfelder für die Wähler-Seite
  typeSample: { display: string; body: string };
  motion: string;
}

export const VARIANTS: Record<VariantKey, VariantMeta> = {
  a: {
    key: 'a',
    name: 'Krume',
    workingTitle: 'Editorial Warm',
    stance: 'Warm, sinnlich, redaktionell — ein Magazin über gutes Backen.',
    base: '/a',
    swatches: ['#F7F2E8', '#7A4A26', '#241B14', '#E07A1F', '#5B8C3E'],
    typeSample: { display: 'Fraunces', body: 'General Sans' },
    motion: 'Teig — langsam, weich, 500–700 ms',
  },
  b: {
    key: 'b',
    name: 'Salzhaff',
    workingTitle: 'Nordic Quiet',
    stance: 'Reduziert, kühl, präzise — Premium durch Weglassen.',
    base: '/b',
    swatches: ['#FBFAF8', '#3E5C63', '#151A1C', '#A8B392', '#D9641A'],
    typeSample: { display: 'Instrument Serif', body: 'Inter Tight' },
    motion: 'Wasser — gleitend, 300–450 ms',
  },
  c: {
    key: 'c',
    name: 'Backstube',
    workingTitle: 'Craft Bold',
    stance: 'Mutig, plakativ, charaktervoll — Farbe als Statement.',
    base: '/c',
    swatches: ['#F4EFE2', '#E0761F', '#6B3A1C', '#2F4A50', '#FDF9F0'],
    typeSample: { display: 'Bricolage Grotesque', body: 'Satoshi' },
    motion: 'Ofen — kräftig, mit Anschlag, 250–400 ms',
  },
};

/** Navigations-Struktur, identisch je Variante (Pfade relativ zur Basis). */
export const NAV_MAIN = [
  { label: 'Karte', path: '/karte' },
  { label: 'Sauerteig', path: '/sauerteig' },
  { label: 'Workshops', path: '/workshops' },
  { label: 'Journal', path: '/journal' },
  { label: 'Besuch', path: '/besuch' },
] as const;

export const NAV_CTA = { label: 'Vorbestellen', path: '/vorbestellen' } as const;

export const NAV_FOOTER = [
  { label: 'Über uns', path: '/ueber-uns' },
  { label: 'Shop & Gutscheine', path: '/shop' },
  { label: 'Für Gastgeber', path: '/gastgeber' },
  { label: 'FAQ', path: '/faq' },
  { label: 'Kontakt', path: '/kontakt' },
  { label: 'Jobs', path: '/jobs' },
] as const;

export const NAV_LEGAL = [
  { label: 'Impressum', path: '/impressum' },
  { label: 'Datenschutz', path: '/datenschutz' },
] as const;

/** Karten-Sektionen in Anzeige-Reihenfolge (Slugs = Content-IDs + Routen) */
export const MENU_SECTIONS = ['fruehstueck', 'kuchen', 'brot', 'schnecken', 'kaffee'] as const;
