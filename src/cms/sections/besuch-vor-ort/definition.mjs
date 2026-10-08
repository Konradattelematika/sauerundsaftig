/**
 * Sektion „Besuch-Vor-Ort": 5 kurze Infoblöcke (Parken, Barrierefreiheit, Hunde, Reservierung,
 * Zahlungsmittel) in zwei festen Rasterzeilen (3 + 2, letzter Block zweispaltig) — feste Reihenfolge.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'besuch-vor-ort',
  label: 'Besuch: Vor Ort',
  description: 'Fünf Infoblöcke: Parken, Barrierefreiheit, Hunde, Reservierung, Zahlungsmittel.',
  allowedOn: ['besuch'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 },
    {
      key: 'items',
      label: 'Infoblöcke',
      kind: 'list',
      min: 5,
      max: 5,
      itemLabel: 'heading',
      help: 'Feste Reihenfolge: Parken, Barrierefreiheit, Hunde, Reservierung, Zahlungsmittel.',
      of: [
        { key: 'heading', label: 'Überschrift', kind: 'text', required: true, maxLength: 60 },
        {
          key: 'text',
          label: 'Text',
          kind: 'rich',
          maxLength: 300,
          help: 'Telefonnummer über [{{phoneDisplay}}]({{tel}}).',
        },
      ],
    },
  ],
  defaults: () => ({
    eyebrow: 'Vor Ort',
    items: [
      {
        heading: 'Parken',
        text: 'Parkmöglichkeiten in der Nähe haben wir noch nicht abschließend bestätigt. Ruf uns kurz an unter [{{phoneDisplay}}]({{tel}}), dann sagen wir dir, wo du am besten stehst.',
      },
      { heading: 'Barrierefreiheit', text: 'Das Café ist nicht barrierefrei.' },
      { heading: 'Hunde', text: 'Hunde sind an der Leine erlaubt.' },
      {
        heading: 'Reservierung',
        text: 'Reservierungen laufen ausschließlich telefonisch — ruf uns unter [{{phoneDisplay}}]({{tel}}) an und frag nach einem Tisch für deinen Termin.',
      },
      { heading: 'Zahlungsmittel', text: 'Du kannst bar oder mit Karte bezahlen.' },
    ],
  }),
};
