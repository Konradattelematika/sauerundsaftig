/**
 * Generische Sektion „Karte-Sektionen": die ganze Kartenübersicht (/karte) — Ankernavigation plus
 * je eine Sektion pro Kategorie aus collections.menu (Reihenfolge = Feld „order" der Kategorie).
 * Inhalte der Kategorien selbst kommen aus der Sammlung „Karte", nicht aus Feldern dieser Sektion.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'karte-sektionen',
  label: 'Karte-Sektionen',
  description: 'Kartenübersicht: Ankernavigation plus alle Kategorien der Karten-Sammlung.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'note', label: 'Fußnote', kind: 'text', maxLength: 200, help: 'Erscheint am Ende der Kartenübersicht.' },
  ],
  defaults: () => ({ eyebrow: 'Die Karte', title: 'Unsere Karte', note: '° Beispielpreise — finale Preise folgen.' }),
};
