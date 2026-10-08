/**
 * /ueber-mich „Die Theke ist das Erste, was du siehst": Bild + Text, dann Terrazzo-Übergang
 * (großes Wort + Material-Fläche). Einzigartiges Markup.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-mich-cafe',
  label: 'Über mich: Café/Theke',
  description: 'Bild + Text (Theke), danach Terrazzo-Übergang mit großem Wort und Materialfläche.',
  allowedOn: ['ueber-mich'],
  fields: [
    { key: 'image', label: 'Bild', kind: 'media', required: true },
    { key: 'label', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'text1', label: 'Absatz 1', kind: 'textarea', required: true, maxLength: 500 },
    { key: 'text2', label: 'Absatz 2', kind: 'textarea', maxLength: 300 },
    { key: 'link', label: 'Link', kind: 'link' },
    { key: 'bigWord', label: 'Großes Wort (Übergang)', kind: 'text', required: true, maxLength: 20 },
    { key: 'terrazzoCaption', label: 'Bildunterschrift Materialfläche', kind: 'text', required: true, maxLength: 80 },
  ],
  defaults: () => ({
    image: '',
    label: 'Das Café',
    title: 'Neue Überschrift',
    text1: '',
    text2: '',
    link: { label: '', href: '', visible: false },
    bigWord: 'Theke',
    terrazzoCaption: '',
  }),
};
