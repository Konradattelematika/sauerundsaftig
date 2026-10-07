/**
 * Gemeinsame Daten der Gästestimmen-Alternativen: Google-Note aus site.json, Zitate aus der
 * testimonials-Collection. Stand 07.10.2026: beide Zitate sind Platzhalter (isPlaceholder) —
 * die Alternativen markieren sie genauso wie Live („Platzhalter — echtes Zitat folgt").
 */
import { getCollection } from 'astro:content';
import site from '../../../data/site.json';

export const PLACEHOLDER_LABEL = 'Platzhalter — echtes Zitat folgt';

export const rating = {
  value: site.rating.value,
  display: site.rating.value.toLocaleString('de-DE'),
  count: site.rating.count,
  source: site.rating.source,
  /** Anteil gefüllter Sterne (0–1) */
  fill: Math.max(0, Math.min(1, site.rating.value / 5)),
};

/** Google-Maps-Suche nach dem Café (kein Place-Link bekannt → Suche über Name + Adresse) */
export const googleHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${site.name}, ${site.address.street}, ${site.address.zip} ${site.address.city}`,
)}`;

export async function getTestimonials() {
  return (await getCollection('testimonials')).sort((a, b) => a.data.order - b.data.order).map((t) => t.data);
}

/** Stern-Pfad (24×24) */
export const STAR =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
