/** /ueber-mich Besuch-Modul: dünner Wrapper um das geteilte, kompakte Besuch-Modul. */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'ueber-mich-besuch',
  label: 'Über mich: Besuch-Modul',
  description: 'Kompaktes Besuch-Modul (Öffnungszeiten/Telefon/Route) — Inhalt kommt aus den Einstellungen.',
  allowedOn: ['ueber-mich'],
  fields: [],
  defaults: () => ({}),
};
