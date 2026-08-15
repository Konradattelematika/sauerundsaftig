// Erzeugt TOKENS.md: WCAG-Kontrastwerte der relevanten Token-Paarungen je Variante.
import { readFileSync, writeFileSync } from 'node:fs';

const files = { a: 'src/styles/a.css', b: 'src/styles/b.css', c: 'src/styles/c.css' };
const names = { a: 'A „Krume"', b: 'B „Salzhaff"', c: 'C „Backstube"' };

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const PAIRS = [
  ['ink', 'bg', 'Fließtext auf Grundfläche', 4.5],
  ['ink', 'bg-alt', 'Fließtext auf Sektionsfläche', 4.5],
  ['ink-soft', 'bg', 'Sekundärtext auf Grundfläche', 4.5],
  ['ink-soft', 'bg-alt', 'Sekundärtext auf Sektionsfläche', 4.5],
  ['primary', 'bg', 'Primärfarbe (Headlines/Links) auf Grund', 4.5],
  ['accent-ink', 'bg', 'Akzent-Text auf Grund', 4.5],
  ['paper', 'primary', 'Heller Text auf Primärfläche', 4.5],
  ['paper', 'primary-deep', 'Heller Text auf dunkler Primärfläche', 4.5],
  ['white', 'accent', 'Weißer Text auf Sanddorn-CTA (großer Text/UI)', 3],
  ['open', 'bg', 'Signal „geöffnet" auf Grund (UI)', 3],
  ['closed', 'bg', 'Signal „geschlossen" auf Grund (UI)', 3],
  ['ink', 'paper', 'Text auf Karten-/Papierfläche', 4.5],
];

let md = `# TOKENS — Kontrast-Dokumentation der drei Varianten

Automatisch erzeugt aus src/styles/{a,b,c}.css durch scripts/contrast-doc.mjs.
Sollwerte: Fließtext ≥ 4,5:1 · großer Text/UI ≥ 3:1 (WCAG 2.2 AA).

`;
let fail = 0;
for (const [key, file] of Object.entries(files)) {
  const css = readFileSync(file, 'utf8');
  const tokens = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens[m[1]] = m[2];
  md += `## Variante ${names[key]}\n\n| Paarung | Verwendung | Kontrast | Soll | Status |\n|---|---|---|---|---|\n`;
  // Sekundärfläche: je nach Helligkeit trägt sie hellen ODER dunklen Text — dokumentiere die richtige Wahl
  if (tokens.secondary && tokens.paper && tokens.ink) {
    const rp = ratio(tokens.paper, tokens.secondary);
    const ri = ratio(tokens.ink, tokens.secondary);
    const best = rp >= ri ? ['paper', rp] : ['ink', ri];
    const ok = best[1] >= 4.5;
    if (!ok) fail++;
    md += `| ${best[0]} auf secondary | Textfarbe für Sekundärfläche (verbindliche Wahl) | ${best[1].toFixed(2)}:1 | ≥ 4.5:1 | ${ok ? 'OK' : '**ZU NIEDRIG**'} |\n`;
  }
  for (const [fg, bg, use, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue;
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= min;
    if (!ok) fail++;
    md += `| ${fg} auf ${bg} | ${use} | ${r.toFixed(2)}:1 | ≥ ${min}:1 | ${ok ? 'OK' : '**ZU NIEDRIG**'} |\n`;
  }
  md += '\n';
}
md += fail ? `**${fail} Paarungen unter Soll — vor Abnahme beheben.**\n` : 'Alle geprüften Paarungen erfüllen die Sollwerte.\n';
writeFileSync('TOKENS.md', md);
console.log(fail ? `FAIL: ${fail}` : 'alle OK');
