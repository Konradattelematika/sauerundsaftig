import type { ModuleItem } from '../../types';

export default {
  id: 'schriften',
  group: 'grundlagen',
  order: 20,
  title: 'Schriften',
  question: 'Welche Schrift soll deine Website sprechen?',
  kind: 'token',
  usedOn: [
    { label: 'Startseite', path: '/' },
    { label: 'Karte', path: '/karte' },
    { label: 'Sauerteig', path: '/sauerteig' },
  ],
  options: [
    {
      id: 'live',
      title: 'Fraunces & General Sans',
      summary:
        'Eine weiche, leicht verspielte Serifenschrift für Überschriften, eine ruhige Sans für den Text und Schreibmaschinen-Schrift für kleine Hinweise. So ist es gerade.',
    },
    {
      id: 'alt-1',
      title: 'Nordisch klar',
      summary:
        'Instrument Serif: schlank und elegant wie eine Zeitungs-Schlagzeile, dazu eine schmale, sehr klare Textschrift. Zurückgenommen, edel, viel Luft.',
    },
    {
      id: 'alt-2',
      title: 'Warm & rund',
      summary:
        'Young Serif: eine kräftige, rundliche Serifenschrift mit Bäckerei-Charme, dazu Figtree — freundlich und gut lesbar. Fühlt sich an wie ein handgeschriebenes Schild.',
    },
    {
      id: 'alt-3',
      title: 'Plakativ & jung',
      summary:
        'Bricolage Grotesque: fette, charaktervolle Überschriften ohne Serifen, dazu Satoshi als moderne Textschrift. Laut, frisch, eher Streetfood als Konditorei.',
    },
  ],
} satisfies ModuleItem;
