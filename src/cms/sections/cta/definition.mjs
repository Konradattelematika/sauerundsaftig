/**
 * Generische Sektion „Handlungsaufruf" (CTA): Dachzeile, Überschrift, Text, 1–2 Buttons
 * auf Sanddorn-Fläche. Muster: gastgeber „Ruf uns an, wir sprechen alles Weitere direkt durch".
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'cta',
  label: 'Handlungsaufruf',
  description: 'Farbige Sektion mit Dachzeile, Überschrift, Text und 1–2 Buttons.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'text', label: 'Text', kind: 'textarea', maxLength: 400 },
    {
      key: 'buttons',
      label: 'Buttons',
      kind: 'list',
      itemLabel: 'label',
      min: 0,
      max: 2,
      of: [
        { key: 'label', label: 'Text', kind: 'text', required: true, maxLength: 60 },
        { key: 'href', label: 'Ziel', kind: 'href', required: true },
        { key: 'newTab', label: 'In neuem Tab öffnen', kind: 'boolean' },
        { key: 'visible', label: 'Sichtbar', kind: 'boolean' },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: '',
    title: 'Jetzt aktiv werden',
    text: '',
    buttons: [{ label: 'Jetzt anrufen', href: '{{tel}}', visible: true }],
  }),
};
