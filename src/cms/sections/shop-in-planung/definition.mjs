/** Sektion „Shop-In-Planung": ehrliche Vorschau auf Produkte, die noch nicht käuflich sind. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'shop-in-planung',
  label: 'Shop: In Planung',
  description: 'Überschrift plus Kachelraster für Produkte, die noch nicht käuflich sind.',
  allowedOn: ['shop'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'badgeLabel', label: 'Kachel-Badge', kind: 'text', maxLength: 20 },
    {
      key: 'items',
      label: 'Kacheln',
      kind: 'list',
      min: 1,
      itemLabel: 'title',
      of: [
        { key: 'title', label: 'Titel', kind: 'text', required: true, maxLength: 80 },
        { key: 'text', label: 'Text', kind: 'textarea', maxLength: 300 },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: 'In Planung',
    title: 'Noch nicht käuflich, aber angedacht',
    badgeLabel: 'Bald',
    items: [{ title: 'Neue Idee', text: '' }],
  }),
};
