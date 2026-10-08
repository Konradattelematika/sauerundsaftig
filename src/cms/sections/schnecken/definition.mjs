/**
 * Sektion „Signature (Schnecken)" — Teaser für eine Karten-Kategorie (Standard: Schnecken):
 * Dachzeile, Titel, Einleitung, nummerierte Sorten aus der Karte, Button und zwei Bilder.
 * Titel/Einleitung leer = Werte der Karten-Kategorie; die Sorten kommen immer aus der Karte.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'schnecken',
  label: 'Signature (Karten-Teaser)',
  description: 'Teaser für eine Karten-Kategorie mit nummerierten Sorten, Button und zwei Bildern.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', maxLength: 160, help: 'Leer = Titel der Karten-Kategorie' },
    { key: 'intro', label: 'Einleitung', kind: 'textarea', maxLength: 400, help: 'Leer = Einleitung der Karten-Kategorie' },
    { key: 'category', label: 'Karten-Kategorie', kind: 'text', required: true, help: 'Kürzel der Kategorie (z. B. schnecken, kuchen, brot)' },
    { key: 'link', label: 'Button', kind: 'link' },
    { key: 'image', label: 'Bild groß', kind: 'media' },
    { key: 'image2', label: 'Bild versetzt (ab Tablet)', kind: 'media' },
    {
      key: 'background',
      label: 'Hintergrund',
      kind: 'select',
      options: [
        { value: 'bg', label: 'Hell' },
        { value: 'bg-alt', label: 'Mehlstaub (abgesetzt)' },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: 'Die Signature',
    title: '',
    intro: '',
    category: 'schnecken',
    link: { label: 'Zur Signature-Seite', href: 'page:karte-schnecken' },
    image: { media: 'schnecke-pistazie-hoch' },
    image2: { media: 'schnecke-blech' },
    background: 'bg',
  }),
};
