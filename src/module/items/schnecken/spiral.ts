/**
 * Archimedische Spirale als SVG-Pfad (für die gezeichnete „Schnecke" in den Alternativen).
 * cx/cy = Mitte, turns = Windungen, rMax = Außenradius, steps = Stützpunkte je Windung.
 */
export function spiralPath(cx: number, cy: number, rMax: number, turns = 3.25, steps = 48, rMin = 2): string {
  const total = Math.round(turns * steps);
  const pts: string[] = [];
  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const angle = t * turns * Math.PI * 2;
    const r = rMin + (rMax - rMin) * t;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return pts.join(' ');
}
