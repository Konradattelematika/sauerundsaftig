/**
 * Kleine Bild-Helfer für Variante A.
 * WIDTHS aus lib/images.ts ist bewusst großzügig (bis 2000px) für künftige, größere
 * Fotos — unsere aktuellen Platzhalter sind kleiner. `safeWidths` filtert deshalb auf
 * die tatsächliche Quellbreite, damit Astro nicht versucht hochzuskalieren.
 */
import type { ImageMetadata } from 'astro';

export function safeWidths(image: ImageMetadata, widths: number[]): number[] {
  const filtered = widths.filter((w) => w <= image.width);
  return filtered.length > 0 ? filtered : [image.width];
}
