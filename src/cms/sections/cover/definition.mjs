/**
 * Sektion „Titel (Magazin-Cover)" — Seitenkopf der Startseite: links Plakette, H1, Unterzeile,
 * Öffnungsstatus und Buttons, rechts ein Hochformat-Bild im versetzten Terrazzo-Passepartout
 * mit Bildunterschrift. Auf jeder Seite als Seitenkopf einsetzbar (genau eine H1 pro Seite!).
 */

/** Button-Liste (auch von nicht-gefunden genutzt) */
export const buttonsField = {
  key: 'buttons',
  label: 'Buttons',
  kind: 'list',
  itemLabel: 'link',
  max: 3,
  of: [
    { key: 'link', label: 'Button', kind: 'link', required: true, variants: ['accent', 'primary', 'secondary', 'ghost'] },
    {
      key: 'icon',
      label: 'Symbol',
      kind: 'select',
      options: [
        { value: '', label: 'keins' },
        { value: 'arrow', label: 'Pfeil →' },
        { value: 'external', label: 'Pfeil ↗ (extern)' },
      ],
    },
  ],
};

/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'cover',
  label: 'Titel (Magazin-Cover)',
  description: 'Großer Seitenkopf: Überschrift (H1), Unterzeile, Öffnungsstatus, Buttons und ein Hochformat-Bild.',
  allowedOn: '*',
  fields: [
    { key: 'eyebrow', label: 'Plakette', kind: 'text', maxLength: 80, help: 'Kleine Terrazzo-Plakette über der Überschrift' },
    { key: 'title', label: 'Überschrift (H1)', kind: 'textarea', required: true, maxLength: 160 },
    { key: 'subline', label: 'Unterzeile', kind: 'textarea', maxLength: 300 },
    { key: 'showOpeningStatus', label: 'Öffnungsstatus anzeigen', kind: 'boolean' },
    buttonsField,
    { key: 'image', label: 'Bild (Hochformat)', kind: 'media', required: true },
    { key: 'caption', label: 'Bildunterschrift', kind: 'text', maxLength: 160, help: 'Leer = Alt-Text des Bildes' },
    { key: 'captionAside', label: 'Zusatz rechts unter dem Bild', kind: 'text', maxLength: 60, help: 'Erst ab Tablet-Breite sichtbar' },
    { key: 'band', label: 'Terrazzo-Band unter der Sektion', kind: 'boolean' },
  ],
  defaults: () => ({
    eyebrow: '',
    title: 'Neue Überschrift',
    subline: '',
    showOpeningStatus: false,
    buttons: [],
    image: { media: 'theke' },
    caption: '',
    captionAside: '',
    band: false,
  }),
};
