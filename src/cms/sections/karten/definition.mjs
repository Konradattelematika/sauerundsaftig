/**
 * Generische Sektion „Karten": optionale Dachzeile/Überschrift/Einleitung, darunter ein
 * Raster aus Karten (Titel, Text, optional Bild/Link). Kartenstil = vorhandener Baustein
 * (rounded-card border bg-paper p-6, s. gastgeber „Das Angebot").
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'karten',
  label: 'Karten',
  description: 'Optionale Überschrift, darunter ein Raster aus Karten (Titel, Text, optional Bild/Link) — wiederholbar.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', maxLength: 160 },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', maxLength: 400 },
    {
      key: 'items',
      label: 'Karten',
      kind: 'list',
      itemLabel: 'title',
      min: 1,
      max: 8,
      of: [
        { key: 'title', label: 'Titel', kind: 'text', required: true, maxLength: 120 },
        { key: 'text', label: 'Text', kind: 'textarea', maxLength: 400 },
        { key: 'image', label: 'Bild', kind: 'media' },
        { key: 'link', label: 'Link', kind: 'link' },
      ],
    },
    {
      key: 'background',
      label: 'Hintergrund',
      kind: 'select',
      options: [
        { value: 'bg', label: 'Hell' },
        { value: 'bg-alt', label: 'Mehlstaub (abgesetzt)' },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: '',
    title: '',
    intro: '',
    items: [{ title: 'Neue Karte', text: '' }],
    background: 'bg',
  }),
};
