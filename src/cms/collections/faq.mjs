/** Sammlung „FAQ" (collections.faq) — Konvention s. menu.mjs. */
export default {
  name: 'faq',
  label: 'FAQ',
  description: 'Häufige Fragen mit Antworten — erscheinen auf der FAQ-Seite und als strukturierte Daten für Google.',
  shape: 'list',
  itemLabel: 'question',
  fields: [
    { key: 'question', label: 'Frage', kind: 'text', required: true, maxLength: 160 },
    {
      key: 'answer',
      label: 'Antwort',
      kind: 'rich',
      required: true,
      maxLength: 2000,
      help: 'Leerzeile = neuer Absatz. **fett**, *kursiv*, [Linktext](Ziel). {{phoneDisplay}} setzt die Telefonnummer aus den Einstellungen ein.',
    },
    { key: 'visible', label: 'Auf der FAQ-Seite anzeigen', kind: 'boolean' },
  ],
};
