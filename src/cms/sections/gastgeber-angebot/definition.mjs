/** /gastgeber „Das Angebot": Kartenraster links + Hinweis, Bild rechts. Einzigartiges Markup. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'gastgeber-angebot',
  label: 'Gastgeber: Angebot',
  description: 'Kartenraster (links) mit Preishinweis + Bild (rechts).',
  allowedOn: ['gastgeber'],
  fields: [
    { key: 'label', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    {
      key: 'items',
      label: 'Angebote',
      kind: 'list',
      itemLabel: 'title',
      min: 1,
      max: 6,
      of: [
        { key: 'title', label: 'Titel', kind: 'text', required: true, maxLength: 80 },
        { key: 'text', label: 'Text', kind: 'textarea', required: true, maxLength: 300 },
      ],
    },
    { key: 'note', label: 'Preishinweis', kind: 'textarea', required: true, maxLength: 300 },
    { key: 'image', label: 'Bild', kind: 'media', required: true },
  ],
  defaults: () => ({ label: 'Das Angebot', items: [{ title: 'Neues Angebot', text: '' }], note: '', image: { media: 'brot-laib' } }),
};
