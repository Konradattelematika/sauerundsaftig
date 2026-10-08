/** /ueber-mich Instagram-Feed: dünner Wrapper um die geteilte Instagram-Sektion. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-mich-instagram',
  label: 'Über mich: Instagram',
  description: 'Instagram-Feed (geteilte Sektion) mit eigener Überschrift/Unterzeile.',
  allowedOn: ['ueber-mich'],
  fields: [
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 80 },
    { key: 'subline', label: 'Unterzeile', kind: 'text', required: true, maxLength: 120 },
  ],
  defaults: () => ({ title: 'Frisch aus der Backstube', subline: '' }),
};
