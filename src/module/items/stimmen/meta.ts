import type { ModuleItem } from '../../types';

export default {
  id: 'stimmen',
  group: 'bloecke',
  order: 5,
  title: 'Gästestimmen',
  question: 'Wie sollen die Stimmen deiner Gäste auf der Seite wirken?',
  kind: 'block',
  usedOn: [{ label: 'Startseite', path: '/' }],
  options: [
    {
      id: 'live',
      title: 'Note und zwei Zitate',
      summary:
        'So ist es jetzt: links die Google-Note mit Anzahl der Bewertungen, rechts zwei Zitat-Kästen. Die Zitate sind noch Platzhalter.',
    },
    {
      id: 'alt-1',
      title: 'Die große Zahl',
      summary:
        'Deine 4,6 steht riesig in der Mitte mit Sternen, darunter ein Link zu Google und die Zitate groß in Anführungszeichen.',
    },
    {
      id: 'alt-2',
      title: 'Gästebuch-Zettel',
      summary:
        'Die Stimmen hängen wie handgeschriebene Zettel an der Wand, mit Klebestreifen und leicht schief. Die Google-Note ist der erste Zettel.',
    },
    {
      id: 'alt-3',
      title: 'Gastraum mit Siegel',
      summary:
        'Ein Foto deines Gastraums mit einem runden Terrazzo-Siegel für die Google-Note, daneben die Zitate wie in einer Zeitschrift.',
    },
  ],
} satisfies ModuleItem;
