/** Sektion „Sauerteig-Hero": Hero-Einleitung plus Kennzahlen-Reihe (z. B. „18 Stunden, 4 Falt-Runden"). */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'sauerteig-hero',
  label: 'Sauerteig: Hero + Kennzahlen',
  description: 'Hero-Einleitung (H1) mit einer Reihe aus 3 Kennzahlen darunter.',
  allowedOn: ['sauerteig'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', maxLength: 400 },
    {
      key: 'stats',
      label: 'Kennzahlen',
      kind: 'list',
      min: 3,
      max: 3,
      itemLabel: 'label',
      of: [
        { key: 'label', label: 'Beschriftung', kind: 'text', required: true, maxLength: 40 },
        { key: 'value', label: 'Zahl', kind: 'number', required: true },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: 'Handwerk',
    title: '18 Stunden, keine Abkürzung',
    intro: '',
    stats: [
      { label: 'Stunden gesamt', value: 18 },
      { label: 'Falt-Runden', value: 4 },
      { label: 'Grad im Ofen', value: 250 },
    ],
  }),
};
