/**
 * Neue Hauptnavigation (Umbau durch Agent R, siehe docs/LIVE-PLAN.md): lokal definiert, damit die
 * Alternativen schon vor dem Merge die richtige Struktur zeigen. Pfade ohne /a-Präfix.
 * Live.astro rendert dagegen die echte Header-/Footer-Komponente (zieht nach dem Merge nach).
 */
export const NAV_MAIN = [
  { label: 'Karte', path: '/karte' },
  { label: 'Sauerteig', path: '/sauerteig' },
  { label: 'Über mich', path: '/ueber-mich' },
  { label: 'Besuch', path: '/besuch' },
] as const;

export const NAV_CTA = { label: 'Vorbestellen', path: '/vorbestellen' } as const;

export const NAV_FOOTER = [
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

export const INSTAGRAM_URL = (handle: string) => `https://www.instagram.com/${handle}/`;
