/**
 * Generische Sektion „Zitat": großes, zentriertes Zitat mit Quellenangabe.
 * Baustoffe aus vorhandenen Mustern: tz-rule (Theke-Material), font-display-Zitatgröße
 * (wie SocialProof-Gästezitate), Mono-mall-caps-Quelle.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'zitat',
  label: 'Zitat',
  description: 'Großes, zentriertes Zitat mit optionaler Quellenangabe.',
  allowedOn: '*',
  fields: [
    { key: 'quote', label: 'Zitat', kind: 'textarea', required: true, maxLength: 400 },
    { key: 'source', label: 'Quelle', kind: 'text', maxLength: 120 },
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
  defaults: () => ({ quote: 'Ein Satz, der bleibt.', source: '', background: 'bg' }),
};
