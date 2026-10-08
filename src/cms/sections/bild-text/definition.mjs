/**
 * Generische Sektion „Bild & Text": Bild links oder rechts neben Dachzeile, Überschrift,
 * Text und optionalem Link/Button. Muster: ueber-uns „Rerik-Bezug" (Bild rechts, Textlink).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'bild-text',
  label: 'Bild & Text',
  description: 'Bild (links oder rechts) neben Dachzeile, Überschrift, Text und optionalem Link.',
  allowedOn: '*',
  fields: [
    { key: 'image', label: 'Bild', kind: 'media', required: true },
    {
      key: 'imagePosition',
      label: 'Bildposition',
      kind: 'select',
      options: [
        { value: 'right', label: 'Rechts' },
        { value: 'left', label: 'Links' },
      ],
    },
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'text', label: 'Text', kind: 'rich', maxLength: 2000, help: '**fett**, *kursiv*, [Linktext](page:seite oder https://…)' },
    { key: 'link', label: 'Link', kind: 'link', variants: ['link', 'primary', 'secondary'] },
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
    image: '',
    imagePosition: 'right',
    eyebrow: '',
    title: 'Neue Überschrift',
    text: '',
    link: { label: '', href: '', visible: false },
    background: 'bg',
  }),
};
