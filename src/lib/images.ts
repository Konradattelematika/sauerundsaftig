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
  'josie-portrait': 'Porträt von Josie im Café (Platzhalterbild — echtes Foto folgt)',
};

export function getImage(variant: VariantKey, motif: string): ImageMetadata {
  const photo = photos[`../assets/photos/${motif}.jpg`];
  if (photo) return photo.default;
  const ph = placeholders[`../assets/placeholders/${variant}/${motif}.jpg`];
  if (!ph) throw new Error(`Unbekanntes Bildmotiv: ${motif} (Variante ${variant})`);
  return ph.default;
}

/** Alt-Texte für echte Fotos (Quellen: Instagram @sauerundsaftig + Kundenfotos 16.08.2026) */
const PHOTO_ALT: Record<string, string> = {
  'hero-krume': 'Frisch gebackene Sauerteigschnecken dicht an dicht, glänzend vom Ofen',
  'brot-laib': 'Frisch gebackene Sauerteiglaibe mit eingeschnittenem Ährenmuster und bemehlter Kruste',
  obsttorte: 'Erdbeertorte, dicht belegt mit frischen Erdbeeren',
  kaesekuchen: 'Käsekuchen mit Himbeer- und Maracujaspiegel auf Holzbrettern in der Theke',
  gastraum: 'Sitzecke im Gastraum: Holzbänke mit Kissen am großen Fenster',
  'gastraum-abend': 'Gastraum am Abend mit warmem Licht und gedeckten Holztischen',
  theke: 'Theke mit Vitrine, Brotkörben, Brezelständer und Getränketafel',
  brotregal: 'Brotregal mit Sauerteigbroten und Tafel: Dinkelvollkorn mit Saaten, Bauernbrot, Roggenvollkorn',
  fruehstueck: 'Große Frühstücksplatte mit Käse, Räucherlachs, Eiern, Obst und Beeren',
  'schnecke-blech': 'Frisch gebackene Schnecken dicht an dicht auf dem Blech',
  'schnecke-lotus': 'Lotus-Schnecken mit Karamellcreme und Keks, frisch vom Blech',
  'schnecke-saison': 'Saison-Schnecken mit Sahne, frischen Erdbeeren und Fruchtsoße',
  'kaesekuchen-lotus': 'Käsekuchen mit Karamellspiegel und Lotus-Keksen',
  'torte-blau': 'Auftragstorte mit hellblauer Creme und Streuseln',
  'torte-rosa': 'Auftragstorte in Rosa mit gespritzten Bögen und Schleifen',
  'torte-blumen': 'Auftragstorte mit heller Creme und echten Wiesenblumen',
  'torte-vintage': 'Erdbeer-Mascarpone-Torte im Vintage-Stil mit Buttercreme',
  'josie-portrait': 'Josie im Café, in den Händen die Urkunde „Bester Bäcker 2025 – Landkreis Rostock“',
};

export function hasPhoto(motif: string): boolean {
  return Boolean(photos[`../assets/photos/${motif}.jpg`]);
}

export function getAlt(motif: string): string {
  if (hasPhoto(motif) && PHOTO_ALT[motif]) return PHOTO_ALT[motif];
  return MOTIF_ALT[motif] ?? 'Platzhalterbild';
}

/** Responsive Breiten (Master-Prompt §5: 5 Breiten) */
export const WIDTHS = [400, 800, 1200, 1600, 2000];
export const SIZES_FULL = '100vw';
export const SIZES_HALF = '(min-width: 1024px) 50vw, 100vw';
export const SIZES_THIRD = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw';
