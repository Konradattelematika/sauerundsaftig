/**
 * Sektion „Karte-Schnecken-Sorten": die drei versetzten Bildblöcke (Pistazie, Lotus, Haselnuss)
 * der Signature-Seite, dazwischen zwei kurze Prozess-Absätze. Genau 3 Sorten (feste Abfolge der
 * drei bespokeen Layouts); Inhalte eigenständig (nicht aus collections.menu, damit diese Seite
 * unabhängig von der Karten-Sammlung bleibt).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'karte-schnecken-sorten',
  label: 'Karte-Schnecken: Sorten',
  description: 'Drei versetzte Bildblöcke mit Sorte, Beschreibung und Preis, dazwischen zwei Fließtext-Absätze.',
  allowedOn: ['karte-schnecken'],
  fields: [
    {
      key: 'items',
      label: 'Sorten',
      kind: 'list',
      min: 3,
      max: 3,
      itemLabel: 'name',
      of: [
        { key: 'media', label: 'Bild', kind: 'media', required: true },
        { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 60 },
        { key: 'description', label: 'Beschreibung', kind: 'textarea', maxLength: 200 },
        { key: 'price', label: 'Preis', kind: 'number' },
        { key: 'priceIsPlaceholder', label: 'Preis ist Platzhalter (°)', kind: 'boolean' },
      ],
    },
    { key: 'textAfterFirst', label: 'Text nach der 1. Sorte', kind: 'textarea', maxLength: 400 },
    { key: 'textAfterSecond', label: 'Text nach der 2. Sorte', kind: 'textarea', maxLength: 400 },
  ],
  defaults: () => ({
    items: [
      { media: { media: 'schnecke-pistazie' }, name: 'Neue Sorte', description: '', price: 0, priceIsPlaceholder: true },
      { media: { media: 'schnecke-lotus' }, name: 'Neue Sorte', description: '', price: 0, priceIsPlaceholder: true },
      { media: { media: 'schnecke-haselnuss' }, name: 'Neue Sorte', description: '', price: 0, priceIsPlaceholder: true },
    ],
    textAfterFirst: '',
    textAfterSecond: '',
  }),
};
