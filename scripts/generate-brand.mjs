/**
 * Erzeugt aus dem Original-Logo (Bildnachzeichner-SVG, nicht umfärbbar) saubere
 * Web-Assets: transparente PNG-Sets in „ink" und „light", Wortmarken-Crop,
 * Favicons und site.webmanifest. Quelle bleibt src/assets/brand-original.svg.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const SRC = new URL('../src/assets/brand-original.svg', import.meta.url).pathname;
const OUT = new URL('../public/brand/', import.meta.url).pathname;

const INK = { r: 23, g: 21, b: 28 }; // nahe Originalfarbe (#17151C)
const LIGHT = { r: 253, g: 249, b: 240 }; // Papier/Creme (#FDF9F0)
const CREAM_BG = '#F7F2E8';

async function renderAlpha(width, cropTopRatio = null) {
  // Weiß plätten -> Graustufen -> invertieren = Alphamaske der dunklen Zeichnung
  let img = sharp(SRC, { density: 300 }).resize(width, width, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' });
  let buf = await img.toBuffer();
  if (cropTopRatio) {
    const meta = await sharp(buf).metadata();
    buf = await sharp(buf).extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * cropTopRatio) }).toBuffer();
  }
  return sharp(buf).greyscale().negate().toBuffer();
}

async function colorize(alphaBuf, color, pad = 40) {
  // Rest-Alpha der hellen Trace-Patches entfernen (sonst schimmert ein Kasten auf farbigem Grund)
  const cleaned = await sharp(alphaBuf).linear(1.3, -30).toBuffer();
  const trimmed = await sharp(cleaned).trim({ threshold: 12 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const solid = await sharp({
    create: { width: meta.width, height: meta.height, channels: 3, background: color },
  }).png().toBuffer();
  const withAlpha = await sharp(solid).joinChannel(trimmed).png().toBuffer();
  return sharp(withAlpha).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

await mkdir(OUT, { recursive: true });

const fullAlpha = await renderAlpha(2000);
// Wortmarke = oberer Teil ohne „BROT·KUCHEN"-Subline (Sichtprüfung: Subline beginnt bei ~76 %)
const wordAlpha = await renderAlpha(2000, 0.74);

for (const [name, alpha] of [['lockup', fullAlpha], ['wordmark', wordAlpha]]) {
  for (const [tone, color] of [['ink', INK], ['light', LIGHT]]) {
    const buf = await colorize(alpha, color);
    await sharp(buf).toFile(`${OUT}logo-${name}-${tone}.png`);
    await sharp(buf).resize({ width: 640 }).toFile(`${OUT}logo-${name}-${tone}-640.png`);
  }
}

// Favicons: Zeichnung auf Creme, quadratisch
const iconInk = await colorize(fullAlpha, INK, 120);
const iconBase = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: CREAM_BG } })
  .composite([{ input: await sharp(iconInk).resize(880, 880, { fit: 'inside' }).toBuffer(), gravity: 'centre' }])
  .png()
  .toBuffer(); // composite und resize getrennt: sharp führt resize sonst VOR composite aus
for (const size of [16, 32, 180, 512]) {
  await sharp(iconBase).resize(size, size).png().toFile(`${OUT}favicon-${size}.png`);
}

await writeFile(`${OUT.replace(/brand\/$/, '')}site.webmanifest`, JSON.stringify({
  name: 'Sauer & Saftig — Café und Backstube, Ostseebad Rerik',
  short_name: 'Sauer & Saftig',
  icons: [
    { src: '/brand/favicon-180.png', sizes: '180x180', type: 'image/png' },
    { src: '/brand/favicon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: CREAM_BG,
  background_color: CREAM_BG,
  display: 'browser',
}, null, 2));

console.log('Brand-Assets erzeugt →', OUT);
