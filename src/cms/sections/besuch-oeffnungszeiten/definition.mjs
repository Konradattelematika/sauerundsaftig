/** Sektion „Besuch-Öffnungszeiten": große Wochentabelle (aus den Einstellungen) plus Hinweistext. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'besuch-oeffnungszeiten',
  label: 'Besuch: Öffnungszeiten',
  description: 'Große Wochenübersicht der Öffnungszeiten (aus den Einstellungen) mit Hinweistext darunter.',
  allowedOn: ['besuch'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'note', label: 'Hinweistext', kind: 'textarea', maxLength: 300 },
  ],
  defaults: () => ({
    eyebrow: 'Öffnungszeiten',
    note: 'An Heiligabend und am 1. Weihnachtstag haben wir geschlossen. Verlässlich ist immer der Stand hier auf der Website, nicht unbedingt Google oder Instagram.',
  }),
};
