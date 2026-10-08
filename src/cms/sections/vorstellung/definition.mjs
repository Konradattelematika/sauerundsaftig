/**
 * Sektion „Vorstellung" — Porträt im versetzten Terrazzo-Passepartout neben einem typografischen
 * Gruß mit Text und Textlink (Startseite: Josie-Teaser).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'vorstellung',
  label: 'Vorstellung (Porträt + Gruß)',
  description: 'Porträtbild links, rechts Dachzeile, große Überschrift, kurzer Text und ein Textlink.',
  allowedOn: '*',
  fields: [
    { key: 'image', label: 'Porträt', kind: 'media', required: true },
    { key: 'placeholderNote', label: 'Hinweis bei Platzhalterbild', kind: 'text', maxLength: 80, help: 'Erscheint nur, solange das Bild ein Platzhalter ist' },
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'text', label: 'Text', kind: 'rich', maxLength: 1200, help: '**fett**, *kursiv*, [Linktext](page:seite oder https://…)' },
    { key: 'link', label: 'Textlink', kind: 'link' },
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
    image: { media: 'josie-portrait' },
    placeholderNote: '',
    eyebrow: '',
    title: 'Neue Überschrift',
    text: '',
    link: { label: '', href: '' },
    background: 'bg-alt',
  }),
};
