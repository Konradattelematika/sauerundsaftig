#!/usr/bin/env node
/**
 * Visuelle Regression der Live-Site (Variante A): Ganzseiten-Screenshots aller Seiten in drei Breiten
 * mit eingefrorener Uhr (Öffnungsstatus!), reduzierter Bewegung und einmal durchgescrollt — plus
 * sichtbarer Text je Seite. Vergleich pixelgenau (sharp) und als Textvergleich.
 *
 *   node scripts/visual-regression.mjs capture <dist-dir> <ausgabe-dir> [--port 4460] [--only /pfad,/pfad2]
 *   node scripts/visual-regression.mjs compare <referenz-dir> <neu-dir> [--threshold 0]
 *
 * capture startet den Node-Server (server/index.mjs) auf <dist-dir> mit localhost als Live-Host nach Go-Live.
 * Vorher `source scripts/env.sh` (Chromium-Bibliotheken). compare: Exit 1 bei Abweichungen; Diff-Bilder
 * landen unter <neu-dir>/diff/.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const [cmd, a, b, ...rest] = process.argv.slice(2);
const opt = (name, def) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : def;
};

export const PAGES = [
  '/', '/karte', '/karte/fruehstueck', '/karte/kuchen', '/karte/brot', '/karte/schnecken', '/karte/kaffee',
  '/sauerteig', '/besuch', '/ueber-uns', '/ueber-mich', '/shop', '/vorbestellen', '/gastgeber', '/faq',
  '/kontakt', '/jobs', '/impressum', '/datenschutz', '/gibt-es-nicht',
];
export const WIDTHS = [390, 768, 1440];
// Feste Zeit: Donnerstag 12.11.2026, 10:30 Berlin (geöffnet, kein Feiertag) — Öffnungsstatus deterministisch
const FIXED_TIME = new Date('2026-11-12T09:30:00Z');

const slugOf = (p) => (p === '/' ? 'start' : p.slice(1).replaceAll('/', '__'));

async function capture(distDir, outDir) {
  const port = Number(opt('--port', '4460'));
  const only = opt('--only', '');
  const pages = only ? only.split(',') : PAGES;
  await mkdir(outDir, { recursive: true });
  const dataDir = path.join(outDir, '.data');
  await rm(dataDir, { recursive: true, force: true });
  const server = spawn(process.execPath, ['server/index.mjs'], {
    env: {
      ...process.env,
      PORT: String(port),
      SUS_DIST_DIR: path.resolve(distDir),
      SUS_DATA_DIR: dataDir,
      SUS_LIVE_HOSTS: 'localhost',
      SUS_GO_LIVE_AT: '2026-01-01T00:00:00Z',
      SUS_USERS: '[]',
      SUS_SESSION_SECRET: 'visual-regression-0123456789-0123456789',
      SUS_QUIET: '1',
    },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/healthz`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
      executablePath: `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`,
      args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
    });
    const texts = {};
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
      for (const p of pages) {
        const page = await ctx.newPage();
        await page.clock.setFixedTime(FIXED_TIME);
        await page.goto(`http://localhost:${port}${p}`, { waitUntil: 'networkidle' });
        // einmal durchscrollen (Lazy-Bilder), dann zurück nach oben
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 40));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(outDir, `${slugOf(p)}@${width}.png`), fullPage: true, animations: 'disabled' });
        if (width === WIDTHS[0]) {
          texts[p] = await page.evaluate(() => {
            const t = document.body.innerText.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
            const meta = [...document.querySelectorAll('title, meta[name="description"], meta[property^="og:"], link[rel="canonical"]')]
              .map((m) => m.tagName === 'TITLE' ? `title=${m.textContent}` : `${m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('rel')}=${m.getAttribute('content') || m.getAttribute('href')}`);
            const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
            const links = [...document.querySelectorAll('a[href]')].map((a) => `${a.textContent.trim().slice(0, 40)} -> ${a.getAttribute('href')}`);
            const imgs = [...document.querySelectorAll('img')].map((i) => `${i.getAttribute('alt')}`);
            return { text: t, meta, ld, links, imgs };
          });
        }
        await page.close();
      }
      await ctx.close();
    }
    await browser.close();
    await writeFile(path.join(outDir, 'texts.json'), JSON.stringify(texts, null, 2));
    console.log(`capture: ${pages.length} Seiten × ${WIDTHS.length} Breiten → ${outDir}`);
  } finally {
    server.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function compare(refDir, newDir) {
  const sharp = (await import('sharp')).default;
  const threshold = Number(opt('--threshold', '0'));
  const diffDir = path.join(newDir, 'diff');
  await mkdir(diffDir, { recursive: true });
  const files = (await readdir(refDir)).filter((f) => f.endsWith('.png'));
  let failed = 0;
  for (const f of files) {
    const nf = path.join(newDir, f);
    if (!existsSync(nf)) {
      console.log(`FEHLT   ${f}`);
      failed++;
      continue;
    }
    const [ra, na] = await Promise.all([
      sharp(path.join(refDir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(nf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    if (ra.info.width !== na.info.width || ra.info.height !== na.info.height) {
      console.log(`GRÖSSE  ${f}: ${ra.info.width}×${ra.info.height} → ${na.info.width}×${na.info.height}`);
      failed++;
      continue;
    }
    let diff = 0;
    const out = Buffer.alloc(ra.data.length);
    for (let i = 0; i < ra.data.length; i += 4) {
      const d = Math.abs(ra.data[i] - na.data[i]) + Math.abs(ra.data[i + 1] - na.data[i + 1]) + Math.abs(ra.data[i + 2] - na.data[i + 2]);
      if (d > 24) {
        diff++;
        out[i] = 255; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 255;
      } else {
        out[i] = ra.data[i] * 0.3; out[i + 1] = ra.data[i + 1] * 0.3; out[i + 2] = ra.data[i + 2] * 0.3; out[i + 3] = 255;
      }
    }
    const pct = (diff / (ra.data.length / 4)) * 100;
    if (pct > threshold) {
      failed++;
      console.log(`ABWEICH ${f}: ${diff} px (${pct.toFixed(3)} %)`);
      await sharp(out, { raw: { width: ra.info.width, height: ra.info.height, channels: 4 } }).png().toFile(path.join(diffDir, f));
    }
  }
  // Textvergleich
  const rt = JSON.parse(await readFile(path.join(refDir, 'texts.json'), 'utf8'));
  const nt = existsSync(path.join(newDir, 'texts.json')) ? JSON.parse(await readFile(path.join(newDir, 'texts.json'), 'utf8')) : {};
  for (const p of Object.keys(rt)) {
    for (const key of ['text', 'meta', 'ld', 'links', 'imgs']) {
      const x = JSON.stringify(rt[p]?.[key]);
      const y = JSON.stringify(nt[p]?.[key]);
      if (x !== y) {
        failed++;
        console.log(`TEXT    ${p} [${key}] weicht ab`);
        if (key === 'text') {
          const xs = rt[p].text.split('\n');
          const ys = (nt[p]?.text ?? '').split('\n');
          for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
            if (xs[i] !== ys[i]) {
              console.log(`        - ${xs[i]}\n        + ${ys[i]}`);
              break;
            }
          }
        }
      }
    }
  }
  console.log(failed ? `\n${failed} Abweichung(en). Diff-Bilder: ${diffDir}` : '\nIdentisch: alle Screenshots und Texte.');
  process.exit(failed ? 1 : 0);
}

if (cmd === 'capture') await capture(a, b);
else if (cmd === 'compare') await compare(a, b);
else {
  console.error('Aufruf: visual-regression.mjs capture <dist> <out> | compare <ref> <neu>');
  process.exit(2);
}
