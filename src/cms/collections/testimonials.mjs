/** Sammlung „Gästestimmen" (collections.testimonials) — Konvention s. menu.mjs. */
export default {
  name: 'testimonials',
  label: 'Gästestimmen',
  description: 'Zitate von Gästen (z. B. aus Google-Bewertungen) für die Startseite.',
  shape: 'list',
  itemLabel: 'author',
  fields: [
    { key: 'quote', label: 'Zitat', kind: 'textarea', required: true, maxLength: 400, help: 'Ohne Anführungszeichen — die setzt die Website selbst.' },
    { key: 'author', label: 'Name und Zusatz', kind: 'text', required: true, maxLength: 80, help: 'z. B. „Anna, August 2026 auf Google".' },
    {
      key: 'isPlaceholder',
      label: 'Platzhalter (noch kein echtes Zitat)',
      kind: 'boolean',
      help: 'Platzhalter werden auf der Website entsprechend gekennzeichnet.',
    },
  ],
};
