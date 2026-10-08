#!/usr/bin/env node
/**
 * Code-Version für CMS-Builds (docs/CMS-PLAN.md §7.4): Hash über alle Dateien, die die Build-Ausgabe
 * bestimmen. Das Dockerfile schreibt ihn beim Image-Build nach /app/.code-version; weicht er vom
 * aktuellen Build in /data ab, baut der Server nach einem Deploy einmal mit dem veröffentlichten Inhalt neu.
 *
 *   node server/code-version.mjs [appDir]   → 16 Hex-Zeichen auf stdout
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Eingaben relativ zum App-Verzeichnis (Ordner rekursiv) */
export const CODE_VERSION_INPUTS = ['src', 'server', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json', 'pnpm-lock.yaml'];
/** nicht mitzählen: Laufzeit-Kopien der Uploads, Dotfiles (.DS_Store, .gitkeep …) */
const SKIP = (rel) => rel.startsWith('src/assets/media/') || path.basename(rel).startsWith('.');

function walk(root, rel, out) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const name of readdirSync(abs).sort()) walk(root, rel ? `${rel}/${name}` : name, out);
  } else if (st.isFile() && !SKIP(rel)) {
    out.push(rel);
  }
}

export function computeCodeVersion(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const files = [];
  for (const input of CODE_VERSION_INPUTS) walk(root, input, files);
  const hash = createHash('sha256');
  for (const rel of files.sort()) {
    hash.update(rel).update('\0').update(readFileSync(path.join(root, rel))).update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(computeCodeVersion(process.argv[2] ? path.resolve(process.argv[2]) : undefined));
}
