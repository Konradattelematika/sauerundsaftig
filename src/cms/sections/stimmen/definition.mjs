/**
 * Sektion „Gästestimmen" — Google-Bewertung (Wert/Anzahl aus den Einstellungen) und Zitate aus der
 * Sammlung „Gästestimmen" (Platzhalter-Zitate erscheinen nicht öffentlich).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'stimmen',
  label: 'Gästestimmen & Bewertung',
  description: 'Google-Bewertung groß, daneben echte Gästezitate aus der Sammlung „Gästestimmen".',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'countLabel', label: 'Zeile unter der Bewertung', kind: 'text', maxLength: 80, help: '{anzahl} = Zahl der Bewertungen aus den Einstellungen' },
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
  defaults: () => ({ eyebrow: 'Was Gäste sagen', countLabel: '{anzahl} Google-Bewertungen', background: 'bg' }),
};
