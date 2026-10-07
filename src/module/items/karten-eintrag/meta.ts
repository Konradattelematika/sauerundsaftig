import type { ModuleItem } from '../../types';

export default {
  id: 'karten-eintrag',
  group: 'komponenten',
  order: 3,
  title: 'Eintrag auf der Speisekarte',
  question: 'Wie sollen Frühstück, Kuchen und Co. auf deiner Karte stehen?',
  kind: 'block',
  usedOn: [
    { label: 'Karte', path: '/karte' },
    { label: 'Frühstück', path: '/karte/fruehstueck' },
    { label: 'Kuchen', path: '/karte/kuchen' },
  ],
  options: [
    {
      id: 'live',
      title: 'Liste mit Punktlinie',
      summary:
        'So ist es jetzt: Name links, Preis rechts, dazwischen eine gepunktete Linie. Beschreibung und Allergene darunter, Veggie und Signature als kleine Marken.',
    },
    {
      id: 'alt-1',
      title: 'Karten mit Foto',
      summary:
        'Jeder Eintrag als Kachel: oben das Foto (wo es eins gibt, sonst ein Thekenstein-Feld mit Nummer), darunter Name, Text und Preis. Mehr zum Gucken, weniger zum Lesen.',
    },
    {
      id: 'alt-2',
      title: 'Gedruckte Karte',
      summary:
        'Wie eine gedruckte Speisekarte: mittig gesetzt, Name in der Überschriften-Schrift, Preis darunter, Allergene als Buchstaben mit Legende. Ruhig und klassisch.',
    },
    {
      id: 'alt-3',
      title: 'Vitrinen-Schilder',
      summary:
        'Kleine Preisschilder wie in der Theke: Name groß, Preis groß, Details klein. Zwei bis drei nebeneinander, leicht verdreht — Backstube statt Restaurant.',
    },
  ],
} satisfies ModuleItem;
