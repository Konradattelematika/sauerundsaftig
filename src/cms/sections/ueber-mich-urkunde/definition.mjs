/** /ueber-mich „Und dann war da plötzlich diese Urkunde": Text links, Urkunden-Karte rechts. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-mich-urkunde',
  label: 'Über mich: Urkunde',
  description: 'Text links, kleine Urkunden-Karte rechts (Terrazzo-Passepartout).',
  allowedOn: ['ueber-mich'],
  fields: [
    { key: 'year', label: 'Jahr (klein, oben)', kind: 'text', required: true, maxLength: 10 },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'text', label: 'Text', kind: 'rich', required: true, maxLength: 800 },
    { key: 'cardLabel', label: 'Karte: Label', kind: 'text', required: true, maxLength: 40 },
    { key: 'cardTitleLine1', label: 'Karte: Titel Zeile 1', kind: 'text', required: true, maxLength: 40 },
    { key: 'cardTitleLine2', label: 'Karte: Titel Zeile 2', kind: 'text', required: true, maxLength: 40 },
    { key: 'cardRegion', label: 'Karte: Region', kind: 'text', required: true, maxLength: 60 },
    { key: 'cardSource', label: 'Karte: Quelle', kind: 'text', required: true, maxLength: 80 },
  ],
  defaults: () => ({
    year: '',
    title: 'Neue Überschrift',
    text: '',
    cardLabel: 'Urkunde',
    cardTitleLine1: '',
    cardTitleLine2: '',
    cardRegion: '',
    cardSource: '',
  }),
};
