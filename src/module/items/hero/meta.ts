import type { ModuleItem } from '../../types';

export default {
  id: 'hero',
  group: 'bloecke',
  order: 1,
  title: 'Startseiten-Bühne',
  question: 'Wie soll deine Startseite die Gäste begrüßen?',
  kind: 'block',
  usedOn: [{ label: 'Startseite', path: '/' }],
  options: [
    {
      id: 'live',
      title: 'Magazin-Cover',
      summary:
        'So ist es jetzt: links dein Satz zum Sauerteig mit Öffnungszeit und Buttons, rechts ein hohes Foto deiner Theke im versetzten Terrazzo-Rahmen.',
    },
    {
      id: 'alt-1',
      title: 'Vollbild am Morgen',
      summary:
        'Das Schneckenfoto füllt den ganzen Bildschirm, der Text liegt hell darauf. Wirkt groß und appetitlich, wie ein Blick direkt aufs Blech.',
    },
    {
      id: 'alt-2',
      title: 'Tageszettel an der Theke',
      summary:
        'Neben der Begrüßung hängt ein Zettel mit dem, was heute frisch aus dem Ofen kommt, auf einem Foto deiner Theke. Gäste sehen sofort, was es gibt.',
    },
    {
      id: 'alt-3',
      title: 'Große Schrift, kleine Bilder',
      summary:
        'Dein Spruch „Sauer macht saftig.“ steht riesig da, kleine Fotos sitzen mitten in der Zeile. Darunter eine Terrazzo-Theke mit Öffnungszeit und Buttons.',
    },
  ],
} satisfies ModuleItem;
