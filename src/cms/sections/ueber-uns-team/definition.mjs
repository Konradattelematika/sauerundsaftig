/** /ueber-uns „Die Menschen dahinter": SectionIntro + 2 Porträts + Absatz mit Link zu /ueber-mich. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-uns-team',
  label: 'Über uns: Team',
  description: 'Überschrift, zwei Porträts nebeneinander, Absatz mit Link.',
  allowedOn: ['ueber-uns'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'image1', label: 'Bild 1', kind: 'media', required: true },
    { key: 'image2', label: 'Bild 2', kind: 'media', required: true },
    {
      key: 'text',
      label: 'Text',
      kind: 'rich',
      required: true,
      maxLength: 600,
      help: '[Linktext](page:seite) für Links, **fett**, *kursiv*',
    },
  ],
  defaults: () => ({ eyebrow: '', title: 'Neue Überschrift', image1: { media: 'team-1' }, image2: { media: 'team-2' }, text: '' }),
};
