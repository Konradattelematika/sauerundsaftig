/** /jobs: ehrlicher Aufruf (keine erfundenen offenen Stellen) + Telefon-Button. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'jobs-aufruf',
  label: 'Jobs: Aufruf',
  description: 'Schmale Textsektion mit Überschrift, zwei Absätzen und Telefon-Button.',
  allowedOn: ['jobs'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift (H1)', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Absatz 1', kind: 'textarea', required: true, maxLength: 400 },
    { key: 'note', label: 'Absatz 2', kind: 'textarea', maxLength: 300 },
    { key: 'phoneLink', label: 'Telefon-Button', kind: 'link' },
  ],
  defaults: () => ({
    eyebrow: 'Jobs',
    title: 'Neue Überschrift',
    intro: '',
    note: '',
    phoneLink: { label: '{{phoneDisplay}}', href: '{{tel}}', visible: true },
  }),
};
