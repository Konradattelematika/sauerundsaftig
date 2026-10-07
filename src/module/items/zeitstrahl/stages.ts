/**
 * Etappen der 18-Stunden-Zeitleiste — 1:1 aus src/pages/sauerteig/index.astro (Konstante `stages`,
 * Quelle dort: Journal-Artikel „achtzehn-stunden"). Bei Textänderungen auf der Seite hier nachziehen.
 */
export interface Stage {
  time: string;
  title: string;
  text: string;
}

export const STAGES: Stage[] = [
  { time: '14:00', title: 'Ansetzen', text: 'Der Sauerteig kommt aus dem Glas, wird mit Mehl und Wasser aufgefrischt. Parallel ruht das Mehl für den Hauptteig eine Stunde im Wasser — Autolyse.' },
  { time: '15:30', title: 'Kneten', text: 'Sauerteig und Salz kommen dazu. Kurz kneten, dann Pause — der Teig arbeitet die nächsten Stunden vor allem selbst.' },
  { time: '17:00–19:00', title: 'Dehnen & Falten', text: 'Vier Runden im Halbstundentakt. Bei rund 24 Grad Raumtemperatur baut der Teig so Spannung auf, ohne zu reißen.' },
  { time: '21:00', title: 'Formen', text: 'Der Teig wird zum Laib geformt und kopfüber in den bemehlten Gärkorb gelegt — die Naht zeigt nach oben.' },
  { time: '21:30', title: 'Kalte Gare', text: 'Ab in den Kühlschrank, bei rund 4 Grad. Über Nacht entsteht hier ein guter Teil der Säure, die den Laib später trägt.' },
  { time: '06:00–06:30', title: 'Ofen & Einschuss', text: 'Der Ofen heizt auf 250 Grad mit Schwaden vor. Ein Schnitt mit der Klinge, dann Dampf für die ersten Minuten.' },
  { time: '07:15', title: 'Auskühlen', text: 'Die Kruste ist dunkel und knackt beim Abkühlen hörbar — die letzte halbe Stunde gehört dem Brot allein.' },
  { time: '08:00', title: 'Theke', text: '18 Stunden nach dem ersten Handgriff steht der Laib bei uns im Regal, bereit für den ersten Schnitt des Tages.' },
];

/** "17:00–19:00" → { start: 1020, end: 1140 } (Minuten seit Mitternacht; end = start bei Einzelzeit) */
export function parseRange(time: string): { start: number; end: number } {
  const [a, b] = time.split(/[–-]/).map((t) => t.trim());
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const start = toMin(a ?? '00:00');
  return { start, end: b ? toMin(b) : start };
}

/** Zeit fürs Vorlesen: "17:00–19:00" → "17:00 bis 19:00 Uhr" */
export function spokenTime(time: string): string {
  return `${time.replace('–', ' bis ')} Uhr`;
}
