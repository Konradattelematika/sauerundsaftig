/** /ueber-mich Hero: typografischer Stapel links, Porträt rechts. Einzigartiges Markup. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-mich-hero',
  label: 'Über mich: Hero',
  description: 'Typografischer Stapel (Tag, "Moin, ich bin NAME.", Lead) + großes Porträt.',
  allowedOn: ['ueber-mich'],
  fields: [
    { key: 'tag', label: 'Tag (Terrazzo-Plakette)', kind: 'text', required: true, maxLength: 80 },
    { key: 'line1', label: 'Zeile 1', kind: 'text', required: true, maxLength: 20 },
    { key: 'line2', label: 'Zeile 2', kind: 'text', required: true, maxLength: 20 },
    { key: 'name', label: 'Name (3. Zeile)', kind: 'text', required: true, maxLength: 30 },
    { key: 'lead', label: 'Lead-Text', kind: 'textarea', required: true, maxLength: 400 },
    { key: 'image', label: 'Porträt', kind: 'media', required: true },
    { key: 'captionLabel', label: 'Bildunterschrift', kind: 'text', required: true, maxLength: 80 },
  ],
  defaults: () => ({
    tag: '',
    line1: 'Moin,',
    line2: 'ich bin',
    name: '',
    lead: '',
    image: { media: 'josie-portrait' },
    captionLabel: '',
  }),
};
