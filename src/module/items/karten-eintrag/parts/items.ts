/**
 * Echte Einträge aus der Content-Collection `menu` für die Vorschau: je drei aus Frühstück und
 * Kuchen, so gewählt, dass alle Auszeichnungen vorkommen (Signature, Veggie, Allergene,
 * Saison-Hinweis, Platzhalterpreis °, Preis „pro Stück", Eintrag ohne Preis, Eintrag mit Foto).
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type MenuItem = CollectionEntry<'menu'>['data']['items'][number];
export interface MenuSection {
  slug: string;
  title: string;
  intro: string;
  items: MenuItem[];
}

const PICK: Record<string, string[]> = {
  fruehstueck: ['Rührei-Frühstück', 'Gegrilltes Sauerteig-Käsesandwich', 'Frühstück für Zwei'],
  kuchen: ['Käsekuchen', 'Obsttorte der Saison', 'Torten auf Bestellung'],
};

export async function previewSections(): Promise<MenuSection[]> {
  const all = await getCollection('menu');
  return Object.entries(PICK).flatMap(([slug, names]) => {
    const section = all.find((s) => s.data.slug === slug);
    if (!section) return [];
    const items = names
      .map((n) => section.data.items.find((i) => i.name === n))
      .filter((i): i is MenuItem => Boolean(i));
    return [{ slug, title: section.data.title, intro: section.data.intro, items }];
  });
}

/** Legende für die Allergen-Kürzel der gedruckten Karte (Alt 2) */
export const ALLERGEN_CODES: Record<string, string> = {
  Gluten: 'A',
  Ei: 'C',
  Fisch: 'D',
  Milch: 'G',
  Nüsse: 'H',
};
export function allergenCode(name: string): string {
  return ALLERGEN_CODES[name] ?? name.slice(0, 1).toUpperCase();
}
