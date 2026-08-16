/** Bild-Hilfsfunktionen für Variante C — verhindert Astro-Fehler durch Breiten > Bild-Intrinsic. */
import type { ImageMetadata } from 'astro';
import { WIDTHS } from '../../../lib/images';

export function widthsFor(img: ImageMetadata): number[] {
  const fit = WIDTHS.filter((w) => w <= img.width);
  return fit.length > 0 ? fit : [img.width];
}
