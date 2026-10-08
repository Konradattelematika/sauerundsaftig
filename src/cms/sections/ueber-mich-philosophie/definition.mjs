/** /ueber-mich „Woran ich mich halte": typografische Liste nummerierter Grundsätze + Links. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-mich-philosophie',
  label: 'Über mich: Philosophie',
  description: 'Überschrift, darunter eine nummerierte, typografische Liste von Grundsätzen, dazu Pfeil-Links.',
  allowedOn: ['ueber-mich'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    {
      key: 'principles',
      label: 'Grundsätze',
      kind: 'list',
      itemLabel: 'text',
      min: 1,
      of: [
        { key: 'n', label: 'Nummer', kind: 'text', required: true, maxLength: 4 },
        { key: 'text', label: 'Satz', kind: 'text', required: true, maxLength: 160 },
      ],
    },
    {
      key: 'links',
      label: 'Pfeil-Links',
      kind: 'list',
      itemLabel: 'label',
      max: 4,
      of: [
        { key: 'label', label: 'Text', kind: 'text', required: true, maxLength: 60 },
        { key: 'href', label: 'Ziel', kind: 'href', required: true },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: '',
    title: 'Neue Überschrift',
    principles: [{ n: '01', text: '' }],
    links: [],
  }),
};
