/**
 * Generische Sektion „Seiten-Intro": die große H1-Einleitung allein in ihrer eigenen Sektion
 * (z. B. /vorbestellen, /shop) — für Seiten, bei denen danach eine eigene Sektion folgt.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'seiten-intro',
  label: 'Seiten-Intro',
  description: 'Große Einleitung einer Seite: Dachzeile, Überschrift (H1), Einleitungstext.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', maxLength: 400 },
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
  defaults: () => ({ eyebrow: '', title: 'Neue Überschrift', intro: '', background: 'bg' }),
};
