import type { ModuleItem } from '../../types';

export default {
  id: 'farben',
  group: 'grundlagen',
  order: 10,
  title: 'Farbwelt',
  question: 'Welche Farbwelt passt zu deinem Café?',
  kind: 'token',
  usedOn: [
    { label: 'Startseite', path: '/' },
    { label: 'Karte', path: '/karte' },
    { label: 'Besuch', path: '/besuch' },
  ],
  options: [
    {
      id: 'live',
      title: 'Krume',
      summary:
        'Warmes Krumen-Beige, dunkles Kruste-Braun und ein Tupfer Sanddorn für das Wichtigste. So ist die Website gerade.',
    },
    {
      id: 'alt-1',
      title: 'Ostsee-Morgen',
      summary:
        'Heller, kühler, nordisch: Nebelgrau statt Beige, dazu das Blaugrün vom Salzhaff und Dünengras. Wirkt klar und frisch wie ein früher Morgen am Wasser.',
    },
    {
      id: 'alt-2',
      title: 'Nachtbackstube',
      summary:
        'Dunkel wie die Backstube um vier Uhr morgens: Röstbraun als Grund, cremefarbene Schrift und Amber-Töne wie Ofenglut. Mutig und sehr stimmungsvoll.',
    },
    {
      id: 'alt-3',
      title: 'Beere & Salbei',
      summary:
        'Zart rosiges Papier, ein saftiges Beerenrot für Überschriften und Links, Salbeigrün als ruhiger Gegenpart. Fruchtig, jung, ein bisschen verspielt.',
    },
  ],
} satisfies ModuleItem;
