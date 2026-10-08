/**
 * Generische Sektion „Rechtstext": Überschrift (H1) + Abschnitte (Überschrift + Absätze).
 * Für Impressum, Datenschutz u. Ä. — Markup 1:1 aus den bisherigen Seiten (legal.ts-Darstellung).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'rechtstext',
  label: 'Rechtstext',
  description: 'Überschrift mit Abschnitten (je Überschrift + Absätze) — für Impressum, Datenschutz u. Ä.',
  allowedOn: '*',
  fields: [
    { key: 'title', label: 'Überschrift (H1)', kind: 'text', required: true, maxLength: 120 },
    {
      key: 'sections',
      label: 'Abschnitte',
      kind: 'list',
      itemLabel: 'heading',
      min: 1,
      of: [
        { key: 'heading', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
        {
          key: 'paragraphs',
          label: 'Absätze',
          kind: 'list',
          itemLabel: 'text',
          min: 1,
          of: [{ key: 'text', label: 'Absatz', kind: 'rich', required: true, maxLength: 2000 }],
        },
      ],
    },
  ],
  defaults: () => ({ title: 'Rechtliches', sections: [{ heading: 'Abschnitt', paragraphs: [{ text: '' }] }] }),
};
