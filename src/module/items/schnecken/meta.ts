import type { ModuleItem } from '../../types';

export default {
  id: 'schnecken',
  group: 'bloecke',
  order: 3,
  title: 'Schnecken-Bühne (Signature)',
  question: 'Wie soll deine Sauerteigschnecke auf der Startseite auftreten?',
  kind: 'block',
  usedOn: [
    { label: 'Startseite', path: '/' },
    { label: 'Schnecken-Seite (Link-Ziel)', path: '/karte/schnecken' },
  ],
  options: [
    {
      id: 'live',
      title: 'Zwei Bilder und Sortenliste',
      summary: 'So ist es jetzt: zwei hohe Fotos links, rechts Titel, kurzer Text und die drei Sorten als schlichte Liste.',
    },
    {
      id: 'alt-1',
      title: 'Die Spirale',
      summary:
        'Ein rundes Schneckenfoto, um das sich ein Satz über Sauerteig dreht, daneben die drei Sorten mit ihrer Beschreibung.',
    },
    {
      id: 'alt-2',
      title: 'Drei Füllungen, drei Farben',
      summary:
        'Pistazie, Lotus und Haselnuss bekommen je eine eigene farbige Karte mit gezeichneter Spirale. Darunter ein Blechfoto und wie die Schnecken gedreht werden.',
    },
    {
      id: 'alt-3',
      title: 'Morgens am Blech',
      summary:
        'Erzählt wie eine Magazinseite: großes Blechfoto, daneben in großer Schrift, warum Sauerteig statt Hefe, und die Sorten wie auf einer Speisekarte.',
    },
  ],
} satisfies ModuleItem;
