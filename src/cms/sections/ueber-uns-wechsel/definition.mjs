/** /ueber-uns „Übernahme": Bild links, versetzte Karte rechts. Einzigartiges Markup. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-uns-wechsel',
  label: 'Über uns: Übernahme',
  description: 'Bild links, versetzte Textkarte rechts ("Was neu ist").',
  allowedOn: ['ueber-uns'],
  fields: [
    { key: 'image', label: 'Bild', kind: 'media', required: true },
    { key: 'label', label: 'Kartenüberschrift (klein)', kind: 'text', required: true, maxLength: 60 },
    { key: 'title', label: 'Kartentitel', kind: 'text', required: true, maxLength: 160 },
    { key: 'text', label: 'Text', kind: 'textarea', required: true, maxLength: 600 },
  ],
  defaults: () => ({ image: '', label: 'Was neu ist', title: 'Neue Überschrift', text: '' }),
};
