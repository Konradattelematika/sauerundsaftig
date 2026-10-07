import type { ModuleItem } from '../../types';

export default {
  id: 'buttons',
  group: 'komponenten',
  order: 1,
  title: 'Buttons & Links',
  question: 'Wie sollen die Knöpfe und Links auf deiner Seite aussehen?',
  kind: 'block',
  usedOn: [
    { label: 'Startseite', path: '/' },
    { label: 'Karte', path: '/karte' },
    { label: 'Besuch', path: '/besuch' },
    { label: 'Vorbestellen', path: '/vorbestellen' },
  ],
  options: [
    {
      id: 'live',
      title: 'Ruhig & eckig',
      summary:
        'So ist es jetzt: leicht abgerundete Knöpfe in der Schreibmaschinen-Schrift. Dunkel für die Hauptaktion, Sanddorn-Orange nur fürs Vorbestellen. Beim Darüberfahren wechselt nur die Farbe.',
    },
    {
      id: 'alt-1',
      title: 'Rund & freundlich',
      summary:
        'Vollrunde Pillen in der Textschrift, etwas größer und weicher. Beim Darüberfahren heben sie sich leicht an und bekommen einen Schatten.',
    },
    {
      id: 'alt-2',
      title: 'Stempel',
      summary:
        'Kantige Knöpfe mit hartem Schatten wie ein Stempelabdruck, Beschriftung in Großbuchstaben. Beim Darüberfahren und Klicken drücken sie sich sichtbar ein.',
    },
    {
      id: 'alt-3',
      title: 'Theke & Fraunces',
      summary:
        'Weiche Kissen-Form mit Beschriftung in der Überschriften-Schrift. Nebenaktionen liegen auf der echten Thekenoberfläche (Terrazzo) und färben sich beim Darüberfahren dunkel.',
    },
  ],
} satisfies ModuleItem;
