import type { ModuleItem } from '../../types';

export default {
  id: 'formen',
  group: 'grundlagen',
  order: 30,
  title: 'Formen & Ecken',
  question: 'Wie sollen sich Ecken, Kanten und Linien anfühlen?',
  kind: 'token',
  usedOn: [
    { label: 'Startseite', path: '/' },
    { label: 'Karte', path: '/karte' },
  ],
  options: [
    {
      id: 'live',
      title: 'Leicht gerundet',
      summary:
        'Ganz leicht abgerundete Ecken an Buttons, Bildern und Kästen, feine Linien dazwischen. Ruhig und unauffällig — so ist es gerade.',
    },
    {
      id: 'alt-1',
      title: 'Scharfkantig',
      summary:
        'Keine Rundungen, alles auf Kante. Klarere, etwas kräftigere Linien, Plaketten und Etiketten werden eckig. Wirkt präzise und grafisch wie ein Druckbogen.',
    },
    {
      id: 'alt-2',
      title: 'Weich gerundet',
      summary:
        'Große Rundungen an Bildern und Kästen, Buttons als weiche Pillen, runde Etiketten. Fühlt sich freundlich und nahbar an — wie ein Brötchen, nicht wie ein Ziegel.',
    },
    {
      id: 'alt-3',
      title: 'Handgeformt',
      summary:
        'Ungleiche Ecken: je zwei gegenüberliegende Ecken stark gerundet, zwei fast eckig — wie ein Laib, der von Hand geformt wurde. Eigenwillig und sehr wiedererkennbar.',
    },
  ],
} satisfies ModuleItem;
