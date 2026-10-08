/**
 * Generische Sektion „FAQ-Liste": Überschrift + alle sichtbaren Einträge aus collections.faq
 * als Accordion (Reihenfolge/Inhalte der Fragen selbst über die Sammlung „FAQ", nicht hier).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'faq-liste',
  label: 'FAQ-Liste',
  description: 'Überschrift mit Einleitung, darunter alle sichtbaren Fragen aus der FAQ-Sammlung als Accordion.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', maxLength: 400 },
  ],
  defaults: () => ({ eyebrow: 'FAQ', title: 'Häufige Fragen', intro: '' }),
};
