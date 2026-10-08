/** /gastgeber „Warum das hilft": schlichte 2-Spalten-Textsektion, keine Bausteine. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'gastgeber-warum',
  label: 'Gastgeber: Warum das hilft',
  description: 'Zwei Textspalten: Dachzeile + Überschrift links, Fließtext rechts.',
  allowedOn: ['gastgeber'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'text', label: 'Text', kind: 'textarea', required: true, maxLength: 600 },
  ],
  defaults: () => ({ eyebrow: '', title: 'Neue Überschrift', text: '' }),
};
