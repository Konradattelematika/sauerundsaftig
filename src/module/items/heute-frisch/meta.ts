import type { ModuleItem } from '../../types';

export default {
  id: 'heute-frisch',
  group: 'bloecke',
  order: 2,
  title: 'Heute-frisch-Tafel',
  question: 'Wie willst du zeigen, was heute frisch aus dem Ofen kommt?',
  kind: 'block',
  usedOn: [{ label: 'Startseite', path: '/' }],
  options: [
    {
      id: 'live',
      title: 'Galerie in einer Reihe',
      summary: 'So ist es jetzt: vier gleich große Fotos nebeneinander, darunter Name und kurze Notiz, oben das Datum.',
    },
    {
      id: 'alt-1',
      title: 'Kreidetafel',
      summary:
        'Wie die Tafel im Café: dunkler Grund mit Holzrahmen, kleine runde Fotos und die Namen in geschwungener Schrift.',
    },
    {
      id: 'alt-2',
      title: 'Aufmacher des Tages',
      summary:
        'Das erste Stück bekommt ein großes Foto wie auf einer Zeitungsseite, der Rest steht daneben als kurze Liste mit kleinen Bildern.',
    },
    {
      id: 'alt-3',
      title: 'Schilder auf der Theke',
      summary:
        'Jedes Gebäck steht als kleines Papierschild auf der Terrazzo-Theke, leicht schief wie von Hand hingestellt. Beim Drüberfahren richtet es sich auf.',
    },
  ],
} satisfies ModuleItem;
