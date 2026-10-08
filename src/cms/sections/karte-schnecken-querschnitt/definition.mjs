/** Sektion „Karte-Schnecken-Querschnitt": Abschlussblock mit Bild, Text und Vorbestellen-Button. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'karte-schnecken-querschnitt',
  label: 'Karte-Schnecken: Querschnitt',
  description: 'Abschlussblock mit Bild, kurzem Text und Vorbestellen-Button.',
  allowedOn: ['karte-schnecken'],
  fields: [
    { key: 'media', label: 'Bild', kind: 'media', required: true },
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 120 },
    { key: 'text', label: 'Text', kind: 'textarea', maxLength: 300 },
    { key: 'link', label: 'Button', kind: 'link', variants: ['primary', 'accent', 'secondary', 'ghost', 'link'] },
    { key: 'note', label: 'Fußnote bei Beispielpreisen', kind: 'text', maxLength: 200 },
  ],
  defaults: () => ({
    media: { media: 'schnecke-querschnitt' },
    eyebrow: 'Im Querschnitt',
    title: 'Schicht für Schicht sichtbar',
    text: 'Eng gerollt, damit die Creme in jeder Windung sitzt — sichtbar wird das erst beim Anschnitt.',
    link: { label: 'Vorbestellen', href: 'page:vorbestellen', newTab: false, visible: true, variant: 'accent' },
    note: '° Beispielpreise — finale Preise folgen.',
  }),
};
