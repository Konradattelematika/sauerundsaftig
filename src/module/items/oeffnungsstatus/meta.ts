import type { ModuleItem } from '../../types';

export default {
  id: 'oeffnungsstatus',
  group: 'komponenten',
  order: 2,
  title: 'Öffnungsstatus',
  question: 'Wie soll deine Seite zeigen, ob gerade geöffnet ist?',
  kind: 'block',
  usedOn: [
    { label: 'Kopfzeile (jede Seite)', path: '/' },
    { label: 'Startseite', path: '/' },
    { label: 'Besuch', path: '/besuch' },
    { label: 'Kontakt', path: '/kontakt' },
  ],
  options: [
    {
      id: 'live',
      title: 'Punkt & Zeile',
      summary:
        'So ist es jetzt: ein farbiger Punkt (grün = offen, orange = schließt bald, rot = zu) und eine Textzeile in der Schreibmaschinen-Schrift. Klein in der Kopfzeile, groß auf Start- und Besuchsseite.',
    },
    {
      id: 'alt-1',
      title: 'Kreidetafel',
      summary:
        'Ein dunkles Täfelchen wie die Tafel an der Theke: „Geöffnet“ groß in Kreide-Schrift, darunter bis wann. Für die Kopfzeile gibt es eine schmale Tafel-Version.',
    },
    {
      id: 'alt-2',
      title: 'Türschild',
      summary:
        'Das klassische Wendeschild an der Ladentür: „Offen“ oder „Geschlossen“ an einer Kordel, die Kante im Signal-Ton. Klein als Anhänger für die Kopfzeile.',
    },
    {
      id: 'alt-3',
      title: 'Wochenleiste',
      summary:
        'Sieben Tagesfelder Mo–So auf einen Blick: Ruhetage durchgestrichen, der heutige Tag hervorgehoben, darunter die Statuszeile. Zeigt nicht nur ob, sondern auch wann sonst.',
    },
  ],
} satisfies ModuleItem;
