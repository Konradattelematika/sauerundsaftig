/** Generische Sektion „Zeitstrahl": vertikale Etappen-Zeitleiste (z. B. /sauerteig) — auf jeder Seite einsetzbar. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'zeitstrahl',
  label: 'Zeitstrahl',
  description: 'Vertikale Zeitleiste mit Uhrzeit, Titel und Text je Etappe.',
  allowedOn: '*',
  fields: [
    {
      key: 'stages',
      label: 'Etappen',
      kind: 'list',
      min: 1,
      itemLabel: 'title',
      of: [
        { key: 'time', label: 'Uhrzeit', kind: 'text', required: true, maxLength: 40 },
        { key: 'title', label: 'Titel', kind: 'text', required: true, maxLength: 80 },
        { key: 'text', label: 'Text', kind: 'textarea', required: true, maxLength: 400 },
      ],
    },
  ],
  defaults: () => ({ stages: [{ time: '00:00', title: 'Neue Etappe', text: '' }] }),
};
