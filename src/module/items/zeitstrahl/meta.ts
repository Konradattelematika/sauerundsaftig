import type { ModuleItem } from '../../types';

export default {
  id: 'zeitstrahl',
  group: 'bloecke',
  order: 7,
  title: '18-Stunden-Zeitstrahl',
  question: 'Wie willst du die 18 Stunden vom Ansetzen bis zur Theke erzählen?',
  kind: 'block',
  usedOn: [{ label: 'Sauerteig', path: '/sauerteig' }],
  options: [
    {
      id: 'live',
      title: 'Senkrechte Linie',
      summary:
        'So ist es jetzt: eine Linie von oben nach unten mit nummerierten Punkten, die Schritte stehen abwechselnd links und rechts.',
    },
    {
      id: 'alt-1',
      title: 'Zifferblatt',
      summary:
        'Eine 24-Stunden-Uhr zeigt, wie der Teig vom Nachmittag über die Nacht bis zum Morgen läuft. Daneben die Schritte mit denselben Nummern.',
    },
    {
      id: 'alt-2',
      title: 'Spur zum Wischen',
      summary:
        'Die Schritte liegen als Karten nebeneinander auf einer Zeitlinie zum Wischen. Der Abend ist blau eingefärbt, der Morgen hat einen Sanddorn-Streifen.',
    },
    {
      id: 'alt-3',
      title: 'Backstuben-Tagebuch',
      summary:
        'Wie ein liniertes Notizbuch aus der Backstube: große Uhrzeiten am Rand, die Nacht als Trennlinie und am Ende die 18 Stunden als Summe.',
    },
  ],
} satisfies ModuleItem;
