import type { ModuleItem } from '../../types';

export default {
  id: 'besuch',
  group: 'bloecke',
  order: 4,
  title: 'Besuch & Öffnungszeiten',
  question: 'Wie sollen Gäste erfahren, wann und wie sie zu dir kommen?',
  kind: 'block',
  usedOn: [
    { label: 'Startseite', path: '/' },
    { label: 'Besuch', path: '/besuch' },
  ],
  options: [
    {
      id: 'live',
      title: 'Zwei Spalten',
      summary:
        'So ist es jetzt: links Öffnungsstatus, Telefonnummer und Buttons, rechts die Wochentage als Tabelle.',
    },
    {
      id: 'alt-1',
      title: 'Wochenstreifen',
      summary:
        'Die sieben Tage stehen als Streifen nebeneinander, der heutige Tag ist markiert, Ruhetage tragen Terrazzo. Darunter Telefon, Route und die wichtigsten Hinweise mit kleinen Symbolen.',
    },
    {
      id: 'alt-2',
      title: 'Telefon zuerst',
      summary:
        'Dunkler Block, in dem deine Telefonnummer ganz groß steht, weil Tische nur per Anruf reserviert werden. Zeiten, Adresse und Hinweise darunter.',
    },
    {
      id: 'alt-3',
      title: 'Postkarte aus Rerik',
      summary:
        'Alles Wichtige steht wie auf der Rückseite einer Postkarte: Adresse auf Linien, Briefmarke mit Theken-Foto, Öffnungszeiten als Nachricht, im P.S. die Reservierung per Telefon und im P.P.S. die Hinweise.',
    },
  ],
} satisfies ModuleItem;
