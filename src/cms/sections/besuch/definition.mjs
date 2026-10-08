/**
 * Sektion „Besuch" — Öffnungszeiten-Tabelle (aus den Einstellungen) mit Öffnungsstatus, kurzem Text
 * und Buttons (Telefon, Infos zum Besuch, Route). Kompakt (Startseite) oder groß (eigene Besuch-Seite).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'besuch',
  label: 'Besuch & Öffnungszeiten',
  description: 'Öffnungszeiten der Woche, Öffnungsstatus, Telefon- und Routen-Button.',
  allowedOn: '*',
  fields: [
    {
      key: 'variant',
      label: 'Darstellung',
      kind: 'select',
      options: [
        { value: 'compact', label: 'Kompakt (mit Link „Alle Infos")' },
        { value: 'full', label: 'Groß (ohne Link „Alle Infos")' },
      ],
    },
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'showOpeningStatus', label: 'Öffnungsstatus anzeigen', kind: 'boolean' },
    { key: 'text', label: 'Text', kind: 'textarea', maxLength: 300 },
    { key: 'phone', label: 'Telefon-Button', kind: 'link', help: 'Beschriftung {{phoneDisplay}} und Ziel {{tel}} = Nummer aus den Einstellungen' },
    { key: 'info', label: 'Button „Alle Infos"', kind: 'link', help: 'Nur in der kompakten Darstellung' },
    { key: 'route', label: 'Routen-Button', kind: 'link', help: 'Ziel {{route}} = Routenplaner zur Adresse' },
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
    variant: 'compact',
    eyebrow: 'Besuch',
    title: 'Wann du uns findest',
    showOpeningStatus: true,
    text: 'Reserviere deinen Tisch per Telefon.',
    phone: { label: '{{phoneDisplay}}', href: '{{tel}}' },
    info: { label: 'Alle Infos zum Besuch', href: 'page:besuch' },
    route: { label: 'Route', href: '{{route}}' },
    background: 'bg-alt',
  }),
};
