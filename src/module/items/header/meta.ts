import type { ModuleItem } from '../../types';

export default {
  id: 'header',
  group: 'komponenten',
  order: 4,
  title: 'Kopfzeile & Navigation',
  question: 'Wie soll die Kopfzeile mit dem Menü auf jeder Seite aussehen?',
  kind: 'block',
  usedOn: [
    { label: 'Jede Seite — z. B. Startseite', path: '/' },
    { label: 'Karte', path: '/karte' },
  ],
  options: [
    {
      id: 'live',
      title: 'Schmale Zeile',
      summary:
        'So ist es jetzt: eine ruhige Zeile mit Logo links, Menü in der Mitte, Öffnungsstatus und dunklem Vorbestellen-Knopf rechts. Am Handy ein Menü, das die ganze Seite füllt.',
    },
    {
      id: 'alt-1',
      title: 'Infoleiste & Logo mittig',
      summary:
        'Oben eine dunkle Infozeile mit Öffnungsstatus, Telefon und Instagram; darunter das Logo in der Mitte, das Menü links und rechts davon. Am Handy schiebt sich das Menü von rechts herein.',
    },
    {
      id: 'alt-2',
      title: 'Schwebende Leiste',
      summary:
        'Eine abgerundete Leiste, die mit etwas Abstand über der Seite schwebt und beim Scrollen schmaler wird. Menüpunkte als Pillen, Vorbestellen in Sanddorn-Orange.',
    },
    {
      id: 'alt-3',
      title: 'Ladenschild',
      summary:
        'Großes Logo auf Thekenstein wie ein Schild über der Tür, darunter eine Menüzeile in Großbuchstaben. Beim Scrollen bleibt nur die Menüzeile mit kleinem Logo stehen. Am Handy ein dunkles Vollbild-Menü.',
    },
  ],
} satisfies ModuleItem;
