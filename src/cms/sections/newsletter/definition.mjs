/**
 * Sektion „Brotbrief (Newsletter)" — Überschrift links, Anmeldeformular rechts (Demo: Versand noch
 * nicht angeschlossen). Validierungsmeldungen bleiben fest im Formular-Skript.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'newsletter',
  label: 'Brotbrief (Newsletter)',
  description: 'Newsletter-Anmeldung mit Überschrift, Einleitung, Einwilligung und Button.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'intro', label: 'Einleitung über dem Formular', kind: 'textarea', maxLength: 400 },
    { key: 'emailLabel', label: 'Beschriftung E-Mail-Feld', kind: 'text', required: true, maxLength: 40 },
    { key: 'consent', label: 'Einwilligungstext', kind: 'rich', required: true, maxLength: 600, help: 'Link zur Datenschutzerklärung z. B. [Datenschutzerklärung](page:datenschutz)' },
    { key: 'submitLabel', label: 'Button', kind: 'text', required: true, maxLength: 60 },
    { key: 'successText', label: 'Meldung nach dem Absenden', kind: 'text', maxLength: 200 },
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
    eyebrow: 'Der Brotbrief',
    title: 'Einmal im Monat Post aus der Backstube',
    intro:
      'Einmal im Monat: ein Rezept, ein Termin, ein Küstenbild. Als Dankeschön gibt’s den Sauerteig-Spickzettel als PDF, sobald er fertig ist.',
    emailLabel: 'E-Mail*',
    consent:
      'Ich bin einverstanden, dass ihr mir monatlich den Brotbrief schickt. Abmelden geht jederzeit. Mehr dazu in der [Datenschutzerklärung](page:datenschutz).',
    submitLabel: 'Brotbrief abonnieren (Demo)',
    successText: 'Fast geschafft — Demo: Der Versand ist noch nicht angeschlossen.',
    background: 'bg-alt',
  }),
};
