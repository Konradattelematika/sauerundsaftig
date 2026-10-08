/**
 * Sektion „Karte-Kategorie-Hero": Hero + Preisliste der Vorlagen-Seite /karte/<kategorie>
 * (template „menu-category", Seite „karte-kategorie"). Titel/Einleitung/Hinweis/Artikel kommen aus
 * der jeweiligen Kategorie in collections.menu (context.category je generierter Route).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'karte-kategorie-hero',
  label: 'Karte-Kategorie: Hero + Preisliste',
  description: 'Hero-Bild und Preisliste der jeweiligen Karten-Kategorie (eine Route je Kategorie).',
  allowedOn: ['karte-kategorie'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'footnote', label: 'Fußnote bei Beispielpreisen', kind: 'text', maxLength: 200 },
  ],
  defaults: () => ({ eyebrow: 'Karte', footnote: '° Beispielpreise — finale Preise folgen.' }),
};
