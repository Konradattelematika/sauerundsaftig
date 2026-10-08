/**
 * Sektion „Vorbestellen-Formular": bindet die PreorderFlow-Insel ein. Produkte, Fußnote und
 * Erfolgstext kommen aus den Feldern (Default = heutiger Stand); Mikrotexte (Schritt-Beschriftungen,
 * Validierungshinweise) bleiben bewusst Teil der Insel (docs/CMS-PLAN.md §2: „Nicht im CMS").
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'vorbestellen-formular',
  label: 'Vorbestellen: Formular',
  description: 'Vorbestell-Assistent (Produkte → Abholtag → Zeitfenster → Zusammenfassung).',
  allowedOn: ['vorbestellen'],
  fields: [
    {
      key: 'products',
      label: 'Produkte',
      kind: 'list',
      min: 1,
      itemLabel: 'name',
      of: [
        { key: 'id', label: 'Kennung', kind: 'text', required: true, maxLength: 60, help: 'kebab-case, z. B. „bauernbrot"' },
        { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 80 },
        { key: 'price', label: 'Preis', kind: 'number', required: true },
        { key: 'leadDays', label: 'Vorlauf (Tage)', kind: 'number' },
        { key: 'note', label: 'Hinweis', kind: 'text', maxLength: 40 },
        { key: 'placeholder', label: 'Preis ist Platzhalter (°)', kind: 'boolean' },
      ],
    },
    { key: 'note', label: 'Fußnote unter der Produktliste', kind: 'text', maxLength: 200 },
    { key: 'successTitle', label: 'Erfolgsmeldung: Titel', kind: 'text', maxLength: 120 },
    { key: 'successTextBefore', label: 'Erfolgsmeldung: Text vor der Telefonnummer', kind: 'text', maxLength: 200 },
  ],
  defaults: () => ({
    products: [{ id: 'neues-produkt', name: 'Neues Produkt', price: 0, leadDays: 0, note: '', placeholder: true }],
    note: '° Beispielpreis — finale Preise folgen. Brotpreise sind aktuell.',
    successTitle: 'Danke! Das war eine Demo-Vorbestellung.',
    successTextBefore: 'Die Bestellung wurde nicht übertragen und ist nicht vorgemerkt. Ruf uns an:',
  }),
};
