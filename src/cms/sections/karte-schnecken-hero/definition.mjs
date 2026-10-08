/**
 * Sektion „Karte-Schnecken-Hero": editorialer Aufmacher der Signature-Seite /karte/schnecken.
 * Titel/Einleitung kommen aus der Kategorie „schnecken" in collections.menu — nur die Dachzeile ist
 * ein eigenes Feld. Rendert außerdem das Menu-JSON-LD nur für diese Kategorie (s. Section.astro).
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'karte-schnecken-hero',
  label: 'Karte-Schnecken: Aufmacher',
  description: 'Editorialer Aufmacher der Signature-Seite (Dachzeile + Titel/Einleitung aus der Karten-Sammlung).',
  allowedOn: ['karte-schnecken'],
  fields: [{ key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 80 }],
  defaults: () => ({ eyebrow: 'Die Signature' }),
};
