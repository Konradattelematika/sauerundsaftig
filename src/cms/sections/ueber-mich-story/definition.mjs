/** /ueber-mich „Wie das hier angefangen hat": Story-Text + sichtbare Platzhalter-Box (offene Fragen). */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-mich-story',
  label: 'Über mich: Story',
  description: 'Überschrift links, Lead + Fließtext rechts, darunter sichtbare Platzhalter-Box mit offenen Fragen.',
  allowedOn: ['ueber-mich'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 200 },
    { key: 'lead', label: 'Lead-Absatz', kind: 'rich', required: true, maxLength: 500 },
    { key: 'body', label: 'Weitere Absätze', kind: 'rich', maxLength: 2000, help: 'Leerzeile = neuer Absatz.' },
    { key: 'placeholderLabel', label: 'Platzhalter-Label', kind: 'text', required: true, maxLength: 80 },
    {
      key: 'offeneFragen',
      label: 'Offene Fragen',
      kind: 'list',
      itemLabel: 'frage',
      of: [{ key: 'frage', label: 'Frage', kind: 'text', required: true, maxLength: 200 }],
    },
  ],
  defaults: () => ({
    eyebrow: '',
    title: 'Neue Überschrift',
    lead: '',
    body: '',
    placeholderLabel: 'Redaktioneller Platzhalter',
    offeneFragen: [{ frage: '' }],
  }),
};
