/**
 * Sektion „Instagram" — horizontaler Feed (Beiträge aus lib/instagram.ts: Import bzw. später Live-API).
 * Platzhalter: {handle} = @Profilname, {datum} = Stand des Imports.
 */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'instagram',
  label: 'Instagram-Feed',
  description: 'Horizontal wischbarer Instagram-Feed mit Überschrift und Link zum Profil.',
  allowedOn: '*',
  fields: [
    { key: 'tag', label: 'Plakette', kind: 'text', maxLength: 80, help: '{handle} = @Profilname' },
    { key: 'title', label: 'Überschrift', kind: 'text', required: true, maxLength: 160 },
    { key: 'subline', label: 'Unterzeile', kind: 'textarea', maxLength: 300 },
    { key: 'followLabel', label: 'Linktext zum Profil', kind: 'text', required: true, maxLength: 80, help: '{handle} = @Profilname' },
    { key: 'swipeHint', label: 'Hinweis „wischen" (nur mobil)', kind: 'text', maxLength: 60 },
    { key: 'importNote', label: 'Stand-Hinweis', kind: 'text', maxLength: 80, help: 'Nur solange der Feed nicht live angebunden ist; {datum} = Stand des Imports' },
    { key: 'limit', label: 'Anzahl Beiträge', kind: 'number', min: 3, max: 20 },
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
    tag: 'Instagram · {handle}',
    title: 'Frisch aus der Backstube',
    subline: 'Noch mehr Krümel gibt’s auf Instagram.',
    followLabel: '{handle} auf Instagram folgen',
    swipeHint: 'Wischen für mehr',
    importNote: 'Auswahl · Stand {datum}',
    limit: 10,
    background: 'bg',
  }),
};
