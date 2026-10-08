/** Sammlung „Aus der Backstube“ — Tafel „Heute frisch“ (collections.heuteFrisch, ein Objekt) — Konvention s. menu.mjs. */
export default {
  name: 'heuteFrisch',
  label: 'Aus der Backstube',
  description: 'Die Tafel „Heute frisch“ auf der Startseite: was gerade aus dem Ofen kommt.',
  shape: 'object',
  fields: [
    { key: 'date', label: 'Stand vom', kind: 'text', input: 'date', required: true, help: 'Datum, an dem die Tafel zuletzt aktualisiert wurde.' },
    {
      key: 'items',
      label: 'Auf der Tafel',
      kind: 'list',
      itemLabel: 'name',
      min: 3,
      max: 5,
      help: '3 bis 5 Einträge.',
      of: [
        { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 60 },
        { key: 'note', label: 'Notiz', kind: 'text', maxLength: 100, help: 'z. B. „ofenfrisch ab 9:30“.' },
        { key: 'motif', label: 'Bild', kind: 'text', idOnly: true, maxLength: 64 },
        { key: 'soldOut', label: 'Ausverkauft', kind: 'boolean' },
      ],
    },
  ],
};
