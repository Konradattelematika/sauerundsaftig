/** /ueber-uns „Wofür wir stehen": nummerierte Werte-Liste (2 Spalten), optional mit Link. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-uns-werte',
  label: 'Über uns: Werte',
  description: 'Überschrift, darunter nummerierte Werte in 2 Spalten, je optional mit Link.',
  allowedOn: ['ueber-uns'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    {
      key: 'items',
      label: 'Werte',
      kind: 'list',
      itemLabel: 'title',
      min: 1,
      max: 4,
      of: [
        { key: 'number', label: 'Nummer', kind: 'text', required: true, maxLength: 4 },
        { key: 'title', label: 'Titel', kind: 'text', required: true, maxLength: 80 },
        { key: 'text', label: 'Text', kind: 'textarea', required: true, maxLength: 300 },
        { key: 'link', label: 'Link (optional)', kind: 'link' },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: '',
    title: 'Neue Überschrift',
    items: [
      { number: '01', title: 'Erster Wert', text: '' },
      { number: '02', title: 'Zweiter Wert', text: '' },
    ],
  }),
};
