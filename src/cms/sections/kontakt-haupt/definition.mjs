/**
 * /kontakt Hauptsektion: Adresse, Öffnungsstatus, Telefon, Instagram, Formular-Hinweis + Karte.
 * Einzigartiges Markup. Bewusst KEIN Kontaktformular (nicht angeschlossen).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'kontakt-haupt',
  label: 'Kontakt: Hauptsektion',
  description: 'Adresse, Öffnungsstatus, Telefon, Instagram und Formular-Hinweis neben der Karte.',
  allowedOn: ['kontakt'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift (H1)', kind: 'text', required: true, maxLength: 160 },
    {
      key: 'addressLine',
      label: 'Adresszeile',
      kind: 'text',
      required: true,
      maxLength: 160,
      help: 'Platzhalter: {{street}}, {{zip}}, {{city}}',
    },
    { key: 'phoneLink', label: 'Telefon-Button', kind: 'link' },
    { key: 'instagramLink', label: 'Instagram-Link', kind: 'link', help: 'Label kann {{instagram}} enthalten.' },
    { key: 'formHinweisLabel', label: 'Formular-Hinweis: Label', kind: 'text', required: true, maxLength: 40 },
    { key: 'formHinweisText', label: 'Formular-Hinweis: Text', kind: 'textarea', required: true, maxLength: 300 },
  ],
  defaults: () => ({
    eyebrow: 'Kontakt',
    title: 'Sprich uns an',
    addressLine: '{{street}}, {{zip}} {{city}}',
    phoneLink: { label: '{{phoneDisplay}}', href: '{{tel}}', visible: true },
    instagramLink: { label: '@{{instagram}} auf Instagram', href: '', newTab: true, visible: true },
    formHinweisLabel: 'Formular',
    formHinweisText: '',
  }),
};
