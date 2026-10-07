import type { ModuleItem } from '../../types';

export default {
  id: 'instagram',
  group: 'bloecke',
  order: 6,
  title: 'Instagram-Feed',
  question: 'Wie soll dein Instagram auf der Website zu sehen sein?',
  kind: 'block',
  usedOn: [{ label: 'Startseite', path: '/' }],
  options: [
    {
      id: 'live',
      title: 'Wischband',
      summary:
        'So ist es jetzt: verschieden große Bilder in einer Reihe zum Wischen oder Ziehen, mit Pfeil-Buttons und Fortschrittslinie.',
    },
    {
      id: 'alt-1',
      title: 'Polaroid-Wand',
      summary:
        'Deine Beiträge hängen als Sofortbilder mit Klebestreifen an der Wand, die Bildunterschrift steht darunter. Beim Drüberfahren hebt sich das Bild an.',
    },
    {
      id: 'alt-2',
      title: 'Laufband',
      summary:
        'Die Bilder ziehen langsam von selbst durchs Bild, darüber läuft dein Instagram-Name in großer Schrift. Mit Pause-Knopf.',
    },
    {
      id: 'alt-3',
      title: 'Großes Bild und Raster',
      summary: 'Dein neuester Beitrag groß mit Bildunterschrift, daneben vier weitere in einem ruhigen Raster und eine Folgen-Kachel.',
    },
  ],
} satisfies ModuleItem;
