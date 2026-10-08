import type { ModuleItem } from '../../types';

export default {
  id: 'footer',
  group: 'komponenten',
  order: 5,
  title: 'Fußzeile',
  question: 'Wie soll das Ende jeder Seite aussehen — mit Zeiten, Telefon, Adresse und Links?',
  kind: 'block',
  usedOn: [
    { label: 'Jede Seite — z. B. Startseite', path: '/' },
    { label: 'Besuch', path: '/besuch' },
  ],
  options: [
    {
      id: 'live',
      title: 'Dunkler Abschluss',
      summary:
        'So ist es jetzt: Thekenstein-Band als Übergang, dann ein dunkler Block mit Logo, Spruch, Links, Öffnungszeiten als Tabelle, Telefon und Instagram.',
    },
    {
      id: 'alt-1',
      title: 'Hell & aufgeräumt',
      summary:
        'Heller Mehlstaub-Grund statt dunkel, vier klare Spalten: Logo und Spruch, Öffnungszeiten kurz zusammengefasst, Kontakt mit Route, Links. Wirkt leichter und freundlicher.',
    },
    {
      id: 'alt-2',
      title: 'Großer Spruch',
      summary:
        '„Sauer macht saftig.“ riesig in der Überschriften-Schrift auf dunklem Grund, darunter Zeiten, Adresse und Telefon in einer Reihe, die Links in einer Zeile. Ein echter Schlusspunkt.',
    },
    {
      id: 'alt-3',
      title: 'Karte auf der Theke',
      summary:
        'Die Fußzeile ist die Thekenoberfläche: darauf liegt eine Papierkarte mit Logo, Adresse, Zeiten, Telefon und Instagram wie eine Visitenkarte. Darunter ein dunkler Streifen mit den Links.',
    },
  ],
} satisfies ModuleItem;
