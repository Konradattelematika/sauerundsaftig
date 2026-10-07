/** Metadaten der drei Design-Varianten — für Wähler-Seite, Layouts und OG-Images. */

export type VariantKey = 'a' | 'b' | 'c' | 'd';

export interface VariantMeta {
  key: VariantKey;
  name: string;
  workingTitle: string; // „Krume" etc.
  stance: string; // Haltung in einem Satz (für die Wähler-Seite)
  base: string; // Einstiegspfad: A (Live-Site) liegt im Wurzelpfad "/", B/C/D unter "/b" usw.
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
    base: '/',
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
  d: {
    key: 'd',
    name: 'Fermentation',
    workingTitle: 'Digital Immersive',
    stance: 'Die Nachtbackstube: dunkel, lebendig, animiert — eine Website, die atmet.',
    base: '/d',
    swatches: ['#16110D', '#E8A253', '#F4EBDD', '#F27A1F', '#6E8F86'],
    typeSample: { display: 'Clash Display', body: 'General Sans' },
    motion: 'Fermentation — organisch, scrollgetrieben, 250–700 ms',
  },
};

/** Navigations-Struktur der alten Varianten B/C/D (Pfade relativ zur Basis). */
export const NAV_MAIN = [
  { label: 'Karte', path: '/karte' },
  { label: 'Sauerteig', path: '/sauerteig' },
  { label: 'Workshops', path: '/workshops' },
  { label: 'Journal', path: '/journal' },
  { label: 'Besuch', path: '/besuch' },
] as const;

/**
 * Hauptnavigation der Live-Site (Variante A „Krume" im Wurzelpfad) — ohne Workshops
 * und Journal (Kunden-Feedback 10/2026), dafür mit „Über mich" (Josie).
 */
export const NAV_MAIN_A = [
  { label: 'Karte', path: '/karte' },
  { label: 'Sauerteig', path: '/sauerteig' },
  { label: 'Über mich', path: '/ueber-mich' },
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

/** Footer-Navigation der Live-Site (A): wie NAV_FOOTER, plus „Über mich" direkt hinter „Über uns". */
export const NAV_FOOTER_A = [
  { label: 'Über uns', path: '/ueber-uns' },
  { label: 'Über mich', path: '/ueber-mich' },
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
