/** Generische Sektion „Text": Eyebrow, Überschrift, Einleitung und Fließtext — auf jeder Seite einsetzbar. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'text',
  label: 'Text',
  description: 'Überschrift mit kurzer Einleitung und Fließtext in Absätzen.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', maxLength: 400 },
    { key: 'body', label: 'Text', kind: 'rich', maxLength: 6000, help: 'Leerzeile = neuer Absatz. **fett**, *kursiv*, [Linktext](page:seite oder https://…)' },
    {
      key: 'background',
      label: 'Hintergrund',
      kind: 'select',
      options: [
        { value: 'bg', label: 'Hell' },
        { value: 'bg-alt', label: 'Mehlstaub (abgesetzt)' },
      ],
    },
  ],
  defaults: () => ({ eyebrow: '', title: 'Neue Überschrift', intro: '', body: '', background: 'bg' }),
};
