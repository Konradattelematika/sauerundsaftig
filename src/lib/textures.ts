/**
 * Texturen für das Material-System (aktuell nur Terrazzo/Theke, Variante A).
 * Liefert die optimierte Asset-URL als CSS-`url(...)` — Layout A setzt sie als --tz-url.
 *
 * Quelle: src/assets/textures/terrazzo.jpg — echtes Foto der Thekenoberfläche (Kunde, 19.09.2026),
 * quadratischer Ausschnitt mit leicht geglättetem Beleuchtungsverlauf für ruhige Flächen.
 * (scripts/generate-terrazzo.mjs erzeugt nur noch einen Notfall-Platzhalter, falls die Datei fehlt.)
 */
import { getImage } from 'astro:assets';
import terrazzo from '../assets/textures/terrazzo.jpg';

export const TERRAZZO_IS_PLACEHOLDER = false; // echtes Foto der Thekenoberfläche seit 19.09.2026

export async function terrazzoCssUrl(width = 1400): Promise<string> {
  const img = await getImage({ src: terrazzo, width, format: 'webp', quality: 62 });
  return `url("${img.src}")`;
}
