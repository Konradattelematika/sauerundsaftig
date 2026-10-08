/**
 * Sektion „Aus der Backstube" — Board mit der aktuellen Auswahl aus der Sammlung
 * „Aus der Backstube" (collections.heuteFrisch). Die Einträge pflegt man in der Sammlung.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'heute-frisch',
  label: 'Aus der Backstube (Heute frisch)',
  description: 'Aktuelle Auswahl aus dem Ofen mit Bildern — Einträge kommen aus der Sammlung „Aus der Backstube".',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'dateLine', label: 'Datumszeile', kind: 'text', maxLength: 80, help: '{datum} = Datum der Sammlung, z. B. „Stand {datum}"; leer = ausblenden' },
    { key: 'soldOutLabel', label: 'Hinweis „vergriffen"', kind: 'text', maxLength: 40 },
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
  defaults: () => ({
    eyebrow: 'Aus der Backstube',
    title: 'Eine Auswahl aus unserem Ofen',
    dateLine: 'Stand {datum}',
    soldOutLabel: 'Vergriffen',
    background: 'bg-alt',
  }),
};
