/** Sektion „Sauerteig-Abschluss": Bild-Text-Block mit Link am Ende von /sauerteig. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'sauerteig-abschluss',
  label: 'Sauerteig: Abschluss',
  description: 'Bild-Text-Block mit Link am Ende der Seite.',
  allowedOn: ['sauerteig'],
  fields: [
    { key: 'media', label: 'Bild', kind: 'media', required: true },
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 120 },
    { key: 'text', label: 'Text', kind: 'textarea', maxLength: 400 },
    { key: 'link', label: 'Link', kind: 'link' },
  ],
  defaults: () => ({
    media: { media: 'haende-teig' },
    eyebrow: 'Warum so lange',
    title: 'Zeit statt Abkürzung',
    text: 'Kein Schritt lässt sich beschleunigen, ohne dass Krume oder Kruste darunter leiden. Wer weniger Zeit gibt, bekommt weniger Geschmack zurück — deshalb gibt es bei uns keinen Laib, der schneller geht als 18 Stunden.',
    link: { label: 'Unsere Brote in der Karte', href: '/karte/brot', newTab: false, visible: true },
  }),
};
