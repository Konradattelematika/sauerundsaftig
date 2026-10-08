/**
 * Sammlung „Karte" (collections.menu): Kategorien mit ihren Einträgen.
 *
 * Konvention für Sammlungs-Definitionen (src/cms/collections/*.mjs, genutzt von Admin und Validierung):
 *   shape: 'list'   → Der Sammlungswert ist ein Array; `fields` beschreibt EINEN Eintrag,
 *                     `itemLabel` nennt das Feld, das den Eintrag in Listen benennt.
 *   shape: 'object' → Der Sammlungswert ist ein Objekt; `fields` beschreibt dieses Objekt.
 * Zusätzliche Feld-Eigenschaften (über FieldDef hinaus, vom Admin ausgewertet):
 *   input: 'date' | 'time' | 'url' | 'email' | 'tel' | 'color'  (Eingabeart für text-Felder)
 *   idOnly: true   (media: Wert ist nur die Medien-ID statt MediaRef — wie MenuItem.motif)
 *   list ohne `of` = Liste von Texten; mit `options` = Mehrfachauswahl aus diesen Werten.
 */
export const ALLERGENS = [
  'Gluten',
  'Krebstiere',
  'Ei',
  'Fisch',
  'Erdnüsse',
  'Soja',
  'Milch',
  'Nüsse',
  'Sellerie',
  'Senf',
  'Sesam',
  'Sulfite',
  'Lupinen',
  'Weichtiere',
];

const itemFields = [
  { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 80 },
  { key: 'description', label: 'Beschreibung', kind: 'textarea', maxLength: 400, help: 'Was gehört dazu? Ein bis zwei Sätze.' },
  { key: 'price', label: 'Preis in Euro', kind: 'number', help: 'z. B. 4,80 — leer lassen, wenn es keinen festen Preis gibt.' },
  { key: 'priceSuffix', label: 'Zusatz zum Preis', kind: 'text', maxLength: 30, help: 'z. B. „pro Stück" oder „pro Laib".' },
  { key: 'priceIsPlaceholder', label: 'Preis ist noch vorläufig', kind: 'boolean', help: 'Wird auf der Website als vorläufig gekennzeichnet.' },
  { key: 'veggie', label: 'Vegetarisch', kind: 'boolean' },
  { key: 'vegan', label: 'Vegan', kind: 'boolean' },
  { key: 'highlight', label: 'Empfehlung (hervorheben)', kind: 'boolean' },
  { key: 'seasonal', label: 'Hinweis zur Verfügbarkeit', kind: 'text', maxLength: 40, help: 'z. B. „nach Jahreszeit" oder „nur samstags".' },
  {
    key: 'allergens',
    label: 'Allergene',
    kind: 'list',
    options: ALLERGENS.map((a) => ({ value: a, label: a })),
    help: 'Alles ankreuzen, was enthalten ist.',
  },
  { key: 'motif', label: 'Bild', kind: 'media', idOnly: true, help: 'Optional — erscheint bei Empfehlungen und in Teasern.' },
];

export default {
  name: 'menu',
  label: 'Karte',
  description: 'Speisen und Getränke, nach Kategorien geordnet. Jede Kategorie hat eine eigene Seite unter /karte/….',
  shape: 'list',
  itemLabel: 'title',
  fields: [
    { key: 'title', label: 'Name der Kategorie', kind: 'text', required: true, maxLength: 60 },
    {
      key: 'slug',
      label: 'Adresse (URL) der Kategorieseite',
      kind: 'text',
      required: true,
      maxLength: 40,
      help: 'Nur Kleinbuchstaben, Ziffern und Bindestriche — ergibt /karte/<adresse>. Eine Änderung macht alte Links ungültig.',
    },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', maxLength: 400 },
    { key: 'note', label: 'Hinweis unter der Liste', kind: 'textarea', maxLength: 800, help: 'z. B. Beilagen oder Kennzeichnungen.' },
    { key: 'order', label: 'Reihenfolge (Zahl)', kind: 'number', help: 'Wird beim Sortieren der Kategorien automatisch gesetzt (10, 20, 30 …).' },
    { key: 'items', label: 'Einträge', kind: 'list', itemLabel: 'name', of: itemFields },
  ],
};
