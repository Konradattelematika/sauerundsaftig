/**
 * Texturen für das Material-System (aktuell nur Terrazzo/Theke, Variante A).
 * Liefert die optimierte Asset-URL als CSS-`url(...)` — Layout A setzt sie als --tz-url.
 *
 * Quelle: src/assets/textures/terrazzo.jpg. Solange das echte Foto der Thekenoberfläche
 * fehlt, liegt dort ein prozeduraler Platzhalter (scripts/generate-terrazzo.mjs).
 */
import { getImage } from 'astro:assets';
import terrazzo from '../assets/textures/terrazzo.jpg';

export const TERRAZZO_IS_PLACEHOLDER = true; // TODO(kunde): auf false, sobald das echte Foto liegt

export async function terrazzoCssUrl(width = 1400): Promise<string> {
  const img = await getImage({ src: terrazzo, width, format: 'webp', quality: 62 });
  return `url("${img.src}")`;
}
