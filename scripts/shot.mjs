// Screenshot-Helfer: node scripts/shot.mjs <url> <breite> <ausgabe.png> [--full] [--wait <ms>]
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';

const [url, width, out, ...rest] = process.argv.slice(2);
if (!url || !width || !out) {
  console.error('Usage: node scripts/shot.mjs <url> <width> <out.png> [--full] [--wait <ms>]');
  process.exit(1);
}
const fullPage = rest.includes('--full');
const reduced = rest.includes('--reduced');
const waitIdx = rest.indexOf('--wait');
const extraWait = waitIdx >= 0 ? Number(rest[waitIdx + 1]) : 800;

const browser = await chromium.launch({
  executablePath: `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage({
  viewport: { width: Number(width), height: Math.round(Number(width) * (width < 500 ? 2.16 : 0.625)) },
  deviceScaleFactor: 2,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(extraWait);
await page.screenshot({ path: out, fullPage });
await browser.close();
console.log(`OK ${out}`);
