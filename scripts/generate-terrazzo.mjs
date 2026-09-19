#!/usr/bin/env node
/**
 * PLATZHALTER für die Terrazzo-/Thekenoberfläche (Variante A, „Material Theke").
 *
 * Das echte Foto der Thekenoberfläche (Nahaufnahme, Kunde) lag beim Bau nicht vor.
 * Dieses Skript erzeugt deshalb eine prozedurale Terrazzo-Textur, deren Farbklima aus
 * dem vorhandenen Thekenfoto (src/assets/photos/theke.jpg: helle, kühle Steinplatte mit
 * feinen Einsprengseln) gesampelt ist. Ziel: dieselben CSS-Klassen (`.tz-*`) funktionieren
 * unverändert, sobald das echte Foto unter src/assets/textures/terrazzo.jpg liegt.
 *
 * Echtes Foto einsetzen: quadratischer oder leicht querformatiger Ausschnitt, ≥1600 px
 * Kante, gleichmäßig ausgeleuchtet, ohne Kante/Objekte → als terrazzo.jpg speichern,
 * dieses Skript danach NICHT mehr ausführen (es würde das Foto überschreiben).
 *
 * Aufruf: node scripts/generate-terrazzo.mjs [--force]
 */
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';

const out = new URL('../src/assets/textures/terrazzo.jpg', import.meta.url).pathname;
const force = process.argv.includes('--force');
if (existsSync(out) && !force) {
  console.log('terrazzo.jpg existiert bereits — nicht überschrieben (Option --force erzwingt Neuerzeugung).');
  process.exit(0);
}
mkdirSync(new URL('../src/assets/textures/', import.meta.url).pathname, { recursive: true });

const W = 1600;
const H = 1600;

// Deterministischer Zufall (gleiche Textur bei jedem Lauf)
let seed = 20260919;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

// Farbklima: aus theke.jpg gesampelt — helle kühle Grundfläche, Einsprengsel in Grau,
// Sand, Kruste (selten), Salzhaff (selten), Weiß und Dunkel.
const BASE = '#d8dedb';
const CHIPS = [
  ['#9aa5a3', 30], // Grau
  ['#b7a184', 22], // Sand
  ['#f3f0e8', 18], // Weiß/Kalk
  ['#6f6a62', 12], // Dunkelgrau
  ['#7a4a26', 6], // Kruste (Marke)
  ['#3e5c63', 6], // Salzhaff (Marke)
  ['#c9b8a0', 6], // heller Sand
];
const pick = () => {
  const total = CHIPS.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [c, w] of CHIPS) {
    if ((r -= w) <= 0) return c;
  }
  return CHIPS[0][0];
};

/** Unregelmäßiges Polygon (5–8 Ecken) als Steinchen */
function chip(cx, cy, r) {
  const n = 5 + Math.floor(rnd() * 4);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const rr = r * (0.55 + rnd() * 0.6);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr * (0.7 + rnd() * 0.5)).toFixed(1)}`);
  }
  return pts.join(' ');
}

let shapes = '';
// Viele kleine, wenige mittlere, sehr wenige große Einsprengsel (wie echter Terrazzo)
const layers = [
  [2600, 3, 7],
  [700, 7, 14],
  [140, 14, 26],
  [22, 26, 40],
];
for (const [count, rMin, rMax] of layers) {
  for (let i = 0; i < count; i++) {
    const r = rMin + rnd() * (rMax - rMin);
    const cx = rnd() * W;
    const cy = rnd() * H;
    const rot = Math.floor(rnd() * 360);
    shapes += `<polygon points="${chip(cx, cy, r)}" fill="${pick()}" opacity="${(0.75 + rnd() * 0.25).toFixed(2)}" transform="rotate(${rot} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.10"/></feComponentTransfer><feComposite operator="in" in2="SourceGraphic"/></filter>
    <filter id="mottle"><feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="3"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.14"/></feComponentTransfer><feComposite operator="in" in2="SourceGraphic"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="0.6"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${BASE}"/>
  <rect width="${W}" height="${H}" fill="#ffffff" filter="url(#mottle)"/>
  <g filter="url(#soft)">${shapes}</g>
  <rect width="${W}" height="${H}" fill="#000" filter="url(#grain)" opacity="0.7"/>
</svg>`;

await sharp(Buffer.from(svg)).jpeg({ quality: 78, mozjpeg: true }).toFile(out);
console.log(`Terrazzo-Platzhalter erzeugt: ${out} (${W}×${H})`);
