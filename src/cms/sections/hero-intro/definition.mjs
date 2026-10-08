/** Seiten-Hero: große Einleitung (SectionIntro als H1) für ueber-uns und gastgeber. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'hero-intro',
  label: 'Hero-Einleitung',
  description: 'Großer Seitenkopf: Dachzeile, H1 und Einleitung mit Regel.',
  allowedOn: ['ueber-uns', 'gastgeber'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', required: true, maxLength: 80 },
    { key: 'title', label: 'Überschrift (H1)', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', required: true, maxLength: 500 },
  ],
  defaults: () => ({ eyebrow: '', title: 'Neue Überschrift', intro: '' }),
};
