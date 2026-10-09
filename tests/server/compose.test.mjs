/**
 * Compose-Dateien: Der Node-Server darf nie direkt (an Traefik vorbei) aus dem Netz erreichbar sein —
 * sonst wäre X-Forwarded-For frei setzbar (Login-Rate-Limit, s. auth.mjs → clientIp).
 * docker-compose.yml: nur `expose`; docker-compose.local.yml: Port-Mapping ausschließlich auf 127.0.0.1.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFile(path.join(root, f), 'utf8');
/** Einträge unter `ports:` (Kommentare ignoriert) */
const portEntries = (yml) => {
  const out = [];
  let inPorts = false;
  let indent = -1;
  for (const raw of yml.split('\n')) {
    const line = raw.replace(/#.*$/, '');
    if (!line.trim()) continue;
    const ind = line.length - line.trimStart().length;
    if (/^\s*ports:\s*$/.test(line)) {
      inPorts = true;
      indent = ind;
      continue;
    }
    if (inPorts && ind <= indent) inPorts = false;
    if (inPorts) out.push(line.trim().replace(/^-\s*/, '').replace(/^["']|["']$/g, ''));
  }
  return out;
};

describe('docker-compose', () => {
  it('Haupt-Datei veröffentlicht keinen Host-Port, gibt 3000 nur intern frei', async () => {
    const yml = await read('docker-compose.yml');
    expect(portEntries(yml)).toEqual([]);
    expect(yml).toMatch(/expose:\s*\n\s*-\s*"3000"/);
  });

  it('lokale Override-Datei bindet ausschließlich an 127.0.0.1', async () => {
    const entries = portEntries(await read('docker-compose.local.yml'));
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e).toMatch(/^127\.0\.0\.1:/);
  });

  it('Prüfung erkennt offene Mappings (Selbsttest)', () => {
    expect(portEntries('services:\n  web:\n    ports:\n      - "3000:3000"\n')).toEqual(['3000:3000']);
    expect(portEntries('services:\n  web:\n    ports:\n      - 3000:3000 # Kommentar\n    volumes:\n      - x:/y\n')).toEqual(['3000:3000']);
  });
});
