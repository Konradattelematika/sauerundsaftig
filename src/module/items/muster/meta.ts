import type { ModuleItem } from '../../types';

export default {
  id: 'muster',
  group: 'grundlagen',
  order: 40,
  title: 'Muster & Material',
  question: 'Welches Material soll sich durch die Website ziehen?',
  kind: 'token',
  usedOn: [
    { label: 'Startseite', path: '/' },
    { label: 'Über mich', path: '/ueber-mich' },
  ],
  options: [
    {
      id: 'live',
      title: 'Theke (Terrazzo)',
      summary:
        'Das Foto deiner echten Thekenplatte taucht als schmales Band zwischen den Abschnitten, als Rahmen um Fotos und als kleine Plakette auf. So ist es gerade.',
    },
    {
      id: 'alt-1',
      title: 'Mehlstaub',
      summary:
        'Statt Stein ein feines, helles Korn wie Mehl auf der Arbeitsfläche. Sehr leise, fast nur zu spüren — die Fotos bekommen dadurch mehr Raum.',
    },
    {
      id: 'alt-2',
      title: 'Leinen',
      summary:
        'Ein feines Gewebe wie das Tuch über dem Gärkorb: zarte Linien, die sich kreuzen. Warm und handwerklich, erinnert an Papier und Stoff.',
    },
    {
      id: 'alt-3',
      title: 'Ostsee-Welle',
      summary:
        'Leichte Wellenlinien in Salzhaff-Blaugrün auf hellem Grund. Holt das Meer vor der Tür auf die Website — verspielt, aber zurückhaltend.',
    },
  ],
} satisfies ModuleItem;
