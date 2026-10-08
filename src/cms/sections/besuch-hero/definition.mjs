/** Sektion „Besuch-Hero": Adresse, Live-Öffnungsstatus und riesiger Telefon-Button. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'besuch-hero',
  label: 'Besuch: Hero',
  description: 'Adresse als Überschrift, Live-Öffnungsstatus, Einleitung und großer Telefon-Button.',
  allowedOn: ['besuch'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Einleitung', kind: 'text', maxLength: 200 },
    { key: 'phoneLink', label: 'Telefon-Button', kind: 'link' },
  ],
  defaults: () => ({
    eyebrow: 'Besuch',
    title: 'Dünenstraße 1, Ostseebad Rerik',
    intro: 'Reserviere deinen Tisch per Telefon.',
    phoneLink: { label: '{{phoneDisplay}}', href: '{{tel}}', newTab: false, visible: true },
  }),
};
