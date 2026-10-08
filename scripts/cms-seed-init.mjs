#!/usr/bin/env node
/**
 * Einmalige Übernahme der bisherigen Inhaltsquellen in den CMS-Seed (src/cms/seed/**), 08.10.2026.
 * Quellen: src/data/site.json, src/content/{menu,faq,testimonials,heute-frisch}, src/lib/images.ts
 * (Alt-Texte), src/assets/{photos,placeholders/a}, src/lib/variants.ts (Navigation der Live-Site).
 * Seitentexte (src/pages/**) übernehmen die Sektions-Umbauten (docs/CMS-PLAN.md §5).
 *
 *   node scripts/cms-seed-init.mjs [--force]   (überschreibt nur mit --force)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const seed = path.join(root, 'src/cms/seed');
const force = process.argv.includes('--force');
const out = (rel, data) => {
  const file = path.join(seed, rel);
  if (existsSync(file) && !force) return console.log(`übersprungen (existiert): ${rel}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`geschrieben: ${rel}`);
};
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// --- Einstellungen (site.json + neue Felder) -------------------------------------------------
const site = JSON.parse(read('src/data/site.json'));
out('settings.json', {
  ...site,
  email: site.email ?? '',
  siteUrl: 'https://sauerundsaftig.de',
  seoDefaults: { ogImage: null, themeColor: '#F7F2E8' },
});

// --- Medienbibliothek ---------------------------------------------------------------------------
const imagesTs = read('src/lib/images.ts');
const parseMap = (name) => {
  const block = imagesTs.slice(imagesTs.indexOf(`${name}: Record<string, string> = {`));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('\n};'));
  const map = {};
  for (const m of body.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)) map[m[1]] = m[2].replace(/\\'/g, "'");
  return map;
};
const MOTIF_ALT = parseMap('MOTIF_ALT');
const PHOTO_ALT = parseMap('PHOTO_ALT');
const photos = readdirSync(path.join(root, 'src/assets/photos')).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4));
const placeholders = readdirSync(path.join(root, 'src/assets/placeholders/a')).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4));
const ids = [...new Set([...photos, ...placeholders, ...Object.keys(MOTIF_ALT), ...Object.keys(PHOTO_ALT)])].sort();
const media = ids.map((id) => {
  const isPhoto = photos.includes(id);
  // = bisheriges getAlt(): echtes Foto mit PHOTO_ALT, sonst MOTIF_ALT, sonst 'Platzhalterbild'
  const alt = isPhoto && PHOTO_ALT[id] ? PHOTO_ALT[id] : MOTIF_ALT[id] ?? 'Platzhalterbild';
  return { id, kind: isPhoto ? 'builtin' : 'placeholder', file: isPhoto ? `photos/${id}.jpg` : `placeholders/a/${id}.jpg`, alt };
});
out('media.json', media);

// --- Sammlungen ---------------------------------------------------------------------------------
const menuDir = path.join(root, 'src/content/menu');
const menu = readdirSync(menuDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(menuDir, f), 'utf8')))
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
out('collections/menu.json', menu);

const faqDir = path.join(root, 'src/content/faq');
const faq = readdirSync(faqDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const raw = readFileSync(path.join(faqDir, f), 'utf8');
    const [, fm, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const question = fm.match(/question:\s*"(.*)"/)[1];
    const order = Number(fm.match(/order:\s*(\d+)/)?.[1] ?? 0);
    const id = f.replace(/\.md$/, '');
    // Too Good To Go ist von der Live-Site entfernt (Kunden-Feedback 07.10.2026) → ausgeblendet
    return { order, item: { id, question, answer: body.trim(), visible: id !== 'too-good-to-go' } };
  })
  .sort((a, b) => a.order - b.order)
  .map((x) => x.item);
out('collections/faq.json', faq);

const tDir = path.join(root, 'src/content/testimonials');
const testimonials = readdirSync(tDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ id: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(path.join(tDir, f), 'utf8')) }))
  .sort((a, b) => a.order - b.order)
  .map(({ order, ...t }) => t);
out('collections/testimonials.json', testimonials);

out('collections/heuteFrisch.json', JSON.parse(read('src/content/heute-frisch/today.json')));

// --- Navigation (Live-Site) -----------------------------------------------------------------------
const pathToPage = (p) => `page:${p === '/' ? 'start' : p.slice(1).replaceAll('/', '-')}`;
const navBlock = (name) => {
  const block = read('src/lib/variants.ts').split(`export const ${name} = [`)[1].split('] as const')[0];
  return [...block.matchAll(/\{ label: '([^']+)', path: '([^']+)' \}/g)].map((m) => ({
    id: m[2].slice(1).replaceAll('/', '-') || 'start',
    label: m[1],
    href: pathToPage(m[2]),
  }));
};
out('navigation.json', {
  main: navBlock('NAV_MAIN_A'),
  cta: { label: 'Vorbestellen', href: 'page:vorbestellen' },
  footer: navBlock('NAV_FOOTER_A'),
  legal: navBlock('NAV_LEGAL'),
  social: [{ id: 'instagram', label: `@${site.instagram} auf Instagram`, href: `https://www.instagram.com/${site.instagram}/` }],
});
out('redirects.json', []);
