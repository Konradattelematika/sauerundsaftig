/**
 * Erzeugt abstrakte Bild-Platzhalter (keine Stockfotos, klar als Platzhalter markiert):
 * ruhige tonale Verläufe mit Korn im Farbklima der jeweiligen Variante + Mono-Label.
 * Beim Fotoshooting werden die Dateien 1:1 durch echte Fotos ersetzt (IMAGE-BRIEF.md).
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const RATIOS = { '16x9': [1600, 900], '4x5': [1200, 1500], '1x1': [1200, 1200], '3x2': [1500, 1000] };

/** Motive — Keys werden von lib/images.ts + Content (motif) referenziert. */
const MOTIFS = [
  ['hero-krume', '16x9', 'Krume-Makro, aufgerissene Kruste'],
  ['schnecke-pistazie', '1x1', 'Pistazienschnecke solo'],
  ['schnecke-pistazie-hoch', '4x5', 'Pistazienschnecke 45°'],
  ['schnecke-lotus', '1x1', 'Lotusschnecke'],
  ['schnecke-haselnuss', '1x1', 'Haselnussschnecke'],
  ['schnecke-blech', '3x2', 'Blech frisch aus dem Ofen'],
  ['schnecke-querschnitt', '4x5', 'Schnecke im Querschnitt'],
  ['kaesekuchen', '4x5', 'Sauerteig-Käsekuchen'],
  ['obsttorte', '1x1', 'Saisonale Obsttorte'],
  ['fruehstueck', '3x2', 'Frühstückstisch am Fenster'],
  ['suppe', '1x1', 'Suppe mit Brotscheibe'],
  ['kaffee', '4x5', 'Milchschaum, Hände an der Maschine'],
  ['brot-laib', '1x1', 'Ganzer Laib'],
  ['brot-anschnitt', '1x1', 'Laib im Anschnitt'],
  ['gaerkorb', '1x1', 'Laib im Gärkorb'],
  ['anstellgut', '4x5', 'Anstellgut im Glas, Gegenlicht'],
  ['haende-teig', '4x5', 'Hände falten Teig'],
  ['ofen', '16x9', 'Ofeneinschuss, 5 Uhr'],
  ['team-1', '4x5', 'Porträt Backstube'],
  ['team-2', '4x5', 'Porträt Service'],
  ['gastraum', '3x2', 'Gastraum Gesamtperspektive'],
  ['terrasse', '3x2', 'Außenbereich eingedeckt'],
  ['fassade', '16x9', 'Fassade Dünenstraße 1'],
  ['kueste', '16x9', 'Steilküste / Salzhaff, ruhig'],
  ['tgtg', '1x1', 'Too-Good-To-Go-Tüte'],
];

/** Farbklima je Variante: [Verlauf-Stops], Labelfarbe, Kornstärke */
const PALETTES = {
  a: { stops: [['#EDE5D6', '#D9C6A8'], ['#E4D5BC', '#C9A87E'], ['#E9DFC9', '#D4BC96']], label: '#4A2C16', grain: 0.055 },
  b: { stops: [['#E8E9E6', '#CBD0CC'], ['#DFE3E0', '#B9C4C2'], ['#E4E6E2', '#C2CBC5']], label: '#3E5C63', grain: 0.04 },
  c: { stops: [['#E0761F', '#B65A14'], ['#6B3A1C', '#4E2913'], ['#2F4A50', '#22373C'], ['#EAD9B7', '#D9BC85']], label: '#FDF9F0', grain: 0.07 },
  d: { stops: [['#5A3A1E', '#241812'], ['#6E4423', '#2A1F16'], ['#4A3320', '#1B1410'], ['#7A4A26', '#33241A']], label: '#E8A253', grain: 0.09, hl: 0.1 },
};

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

function svgFor(variant, motif, ratio, desc) {
  const [w, h] = RATIOS[ratio];
  const p = PALETTES[variant];
  const hv = hash(variant + motif);
  const [c1, c2] = p.stops[hv % p.stops.length];
  const angle = [0, 35, 60, 120][hv % 4];
  // Label auf dunklen C-Flächen hell, sonst dunkel
  const dark = variant === 'c' && !c1.startsWith('#E') ? true : false;
  const labelColor = dark ? '#FDF9F0' : p.label;
  const cx = 20 + (hv % 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="r" cx="${cx}%" cy="30%" r="80%">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="${p.hl ?? 0.35}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${hv % 97}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="${p.grain}"/></feComponentTransfer><feComposite operator="in" in2="SourceGraphic"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#r)"/>
  <rect width="${w}" height="${h}" filter="url(#n)" opacity="0.9"/>
  <g font-family="DejaVu Sans Mono, monospace" font-size="${Math.round(w * 0.014) + 8}" letter-spacing="2">
    <text x="40" y="${h - 44}" fill="${labelColor}" opacity="0.6">PLATZHALTER · ${desc.toUpperCase()}</text>
  </g>
  <rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="${labelColor}" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="2 10"/>
</svg>`;
}

for (const variant of process.argv[2] ? [process.argv[2]] : ['a', 'b', 'c', 'd']) {
  const dir = new URL(`../src/assets/placeholders/${variant}/`, import.meta.url).pathname;
  await mkdir(dir, { recursive: true });
  for (const [motif, ratio, desc] of MOTIFS) {
    const svg = Buffer.from(svgFor(variant, motif, ratio, desc));
    await sharp(svg).jpeg({ quality: 72, mozjpeg: true }).toFile(`${dir}${motif}.jpg`);
  }
  console.log(`Variante ${variant}: ${MOTIFS.length} Platzhalter`);
}
