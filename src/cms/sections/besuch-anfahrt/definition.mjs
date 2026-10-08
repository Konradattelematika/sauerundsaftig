/** Sektion „Besuch-Anfahrt": Klick-Karte, zwei Textabsätze und Routen-Button. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'besuch-anfahrt',
  label: 'Besuch: Anfahrt',
  description: 'Klick-to-Load-Karte, Anfahrtsbeschreibung und Routen-Button.',
  allowedOn: ['besuch'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'text1', label: 'Anfahrtsbeschreibung', kind: 'textarea', maxLength: 500 },
    { key: 'text2', label: 'Zusatzhinweis', kind: 'text', maxLength: 200 },
    { key: 'link', label: 'Routen-Button', kind: 'link' },
  ],
  defaults: () => ({
    eyebrow: 'Anfahrt',
    text1:
      'Rerik liegt an der Ostseeküste zwischen Wismar und Kühlungsborn. Aus Richtung Kühlungsborn kommst du aus östlicher Richtung, aus Richtung Bad Doberan aus südlicher Richtung, aus Richtung Wismar aus westlicher Richtung — die Dünenstraße liegt nah an der Küste.',
    text2: 'Am sichersten: kurz anrufen, wenn du dir bei der Anfahrt unsicher bist.',
    link: { label: 'Route in Maps starten', href: '{{route}}', newTab: true, visible: true },
  }),
};
