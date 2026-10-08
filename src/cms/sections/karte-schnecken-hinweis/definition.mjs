/** Sektion „Karte-Schnecken-Hinweis": schmales Sanddorn-Hinweisband (Verknappungssignal). */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'karte-schnecken-hinweis',
  label: 'Karte-Schnecken: Hinweisband',
  description: 'Schmales farbiges Band mit kurzem Hinweistext (z. B. „ofenfrisch, solange der Vorrat reicht").',
  allowedOn: ['karte-schnecken'],
  fields: [{ key: 'note', label: 'Hinweistext', kind: 'text', required: true, maxLength: 120 }],
  defaults: () => ({ note: 'Ofenfrisch am Vormittag — solange der Vorrat reicht.' }),
};
