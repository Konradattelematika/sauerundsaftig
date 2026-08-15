/**
 * Bild-Registry: Motiv-Key → Platzhalter-Asset je Variante.
 * Nach dem Fotoshooting (IMAGE-BRIEF.md) echte Fotos nach src/assets/photos/<motif>.jpg
 * legen — sie ersetzen die Platzhalter automatisch für alle Varianten.
 */
import type { ImageMetadata } from 'astro';
import type { VariantKey } from './variants';

const placeholders = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/placeholders/*/*.jpg',
  { eager: true },
);
const photos = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/photos/*.jpg',
  { eager: true },
);

/** Beschreibende Alt-Texte je Motiv (Platzhalter-Zustand wird benannt). */
export const MOTIF_ALT: Record<string, string> = {
  'hero-krume': 'Aufgerissene Brotkruste mit Blick auf die offene Krume (Platzhalterbild)',
  'schnecke-pistazie': 'Sauerteigschnecke mit Pistaziencreme (Platzhalterbild)',
  'schnecke-pistazie-hoch': 'Sauerteigschnecke mit Pistaziencreme, Nahaufnahme (Platzhalterbild)',
  'schnecke-lotus': 'Sauerteigschnecke mit Lotuscreme (Platzhalterbild)',
  'schnecke-haselnuss': 'Sauerteigschnecke mit Haselnusscreme (Platzhalterbild)',
  'schnecke-blech': 'Ein Blech Sauerteigschnecken, frisch aus dem Ofen (Platzhalterbild)',
  'schnecke-querschnitt': 'Sauerteigschnecke im Querschnitt mit sichtbaren Schichten (Platzhalterbild)',
  kaesekuchen: 'Käsekuchen mit Sauerteig (Platzhalterbild)',
  obsttorte: 'Saisonale Obsttorte (Platzhalterbild)',
  fruehstueck: 'Gedeckter Frühstückstisch am Fenster (Platzhalterbild)',
  suppe: 'Suppe im Teller mit Brotscheibe (Platzhalterbild)',
  kaffee: 'Kaffeezubereitung an der Maschine (Platzhalterbild)',
  'brot-laib': 'Ganzer Sauerteiglaib (Platzhalterbild)',
  'brot-anschnitt': 'Sauerteiglaib im Anschnitt (Platzhalterbild)',
  gaerkorb: 'Teigling im bemehlten Gärkorb (Platzhalterbild)',
  anstellgut: 'Anstellgut im Glas mit Blasenstruktur (Platzhalterbild)',
  'haende-teig': 'Hände falten Sauerteig (Platzhalterbild)',
  ofen: 'Ofeneinschuss in der Backstube am frühen Morgen (Platzhalterbild)',
  'team-1': 'Porträt aus der Backstube (Platzhalterbild)',
  'team-2': 'Porträt aus dem Service (Platzhalterbild)',
  gastraum: 'Gastraum des Cafés (Platzhalterbild)',
  terrasse: 'Eingedeckter Außenbereich (Platzhalterbild)',
  fassade: 'Fassade des Cafés in der Dünenstraße 1 (Platzhalterbild)',
  kueste: 'Steilküste am Salzhaff bei Rerik (Platzhalterbild)',
  tgtg: 'Gepackte Too-Good-To-Go-Tüte auf der Theke (Platzhalterbild)',
};

export function getImage(variant: VariantKey, motif: string): ImageMetadata {
  const photo = photos[`../assets/photos/${motif}.jpg`];
  if (photo) return photo.default;
  const ph = placeholders[`../assets/placeholders/${variant}/${motif}.jpg`];
  if (!ph) throw new Error(`Unbekanntes Bildmotiv: ${motif} (Variante ${variant})`);
  return ph.default;
}

export function getAlt(motif: string): string {
  return MOTIF_ALT[motif] ?? 'Platzhalterbild';
}

/** Responsive Breiten (Master-Prompt §5: 5 Breiten) */
export const WIDTHS = [400, 800, 1200, 1600, 2000];
export const SIZES_FULL = '100vw';
export const SIZES_HALF = '(min-width: 1024px) 50vw, 100vw';
export const SIZES_THIRD = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw';
