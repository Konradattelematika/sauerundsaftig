/**
 * Statische Auslieferung von dist/: sichere Pfadauflösung (kein Traversal, keine Dotfiles,
 * keine Symlinks nach außen), MIME-Typen, ETag/If-None-Match, HEAD, gzip/brotli mit
 * Speicher-Cache für Textformate.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export const MIME = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  webmanifest: 'application/manifest+json; charset=utf-8',
};
const COMPRESSIBLE = new Set(['html', 'css', 'js', 'mjs', 'json', 'xml', 'txt', 'svg', 'webmanifest']);
const MIN_COMPRESS = 1024;
const MAX_MEMORY_FILE = 4 * 1024 * 1024;

export function extOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

export function mimeFor(file) {
  return MIME[extOf(file)] ?? 'application/octet-stream';
}

/** Accept-Encoding → 'br' | 'gzip' | null (q-Werte beachten). */
export function pickEncoding(header) {
  if (typeof header !== 'string' || !header) return null;
  const prefs = new Map();
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    let q = 1;
    for (const param of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(param);
      if (m) q = Number.parseFloat(m[1]);
    }
    if (name) prefs.set(name.trim(), Number.isFinite(q) ? q : 0);
  }
  const q = (n) => (prefs.has(n) ? prefs.get(n) : prefs.has('*') ? prefs.get('*') : 0);
  if (q('br') > 0) return 'br';
  if (q('gzip') > 0) return 'gzip';
  return null;
}

/** If-None-Match gegen ETag prüfen (schwacher Vergleich, Listen, *). */
export function etagMatches(header, etag) {
  if (typeof header !== 'string' || !header) return false;
  const strip = (t) => t.trim().replace(/^W\//, '');
  const target = strip(etag);
  return header.split(',').some((t) => t.trim() === '*' || strip(t) === target);
}

export class StaticFiles {
  /** @param {string} distDir  @param {{ log?: Console, maxCacheBytes?: number }} [opts] */
  constructor(distDir, opts = {}) {
    this.distDir = path.resolve(distDir);
    this.root = null;
    this.log = opts.log ?? console;
    this.maxCacheBytes = opts.maxCacheBytes ?? 96 * 1024 * 1024;
    this.cache = new Map();
    this.cacheBytes = 0;
  }

  async init() {
    try {
      this.root = await realpath(this.distDir);
    } catch {
      this.log.warn(`[static] dist-Verzeichnis fehlt: ${this.distDir} — alle Seiten liefern 404.`);
      this.root = null;
    }
    return this;
  }

  /** Relativer URL-Pfad (dekodiert, mit führendem /) → absoluter Pfad in dist oder null. */
  safeJoin(rel) {
    if (!this.root || typeof rel !== 'string') return null;
    const segments = rel.split('/').filter(Boolean);
    for (const seg of segments) {
      if (seg.startsWith('.') || /[\\\0]/.test(seg)) return null; // Dotfiles & Traversal
    }
    const abs = path.join(this.root, ...segments);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) return null;
    return abs;
  }

  /** Erste existierende Datei aus der Kandidatenliste → { rel, abs, stat } | null */
  async find(candidates) {
    for (const rel of candidates) {
      const abs = this.safeJoin(rel);
      if (!abs) continue;
      let st;
      try {
        st = await stat(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      // Symlinks dürfen nicht aus dist/ herausführen
      let real;
      try {
        real = await realpath(abs);
      } catch {
        continue;
      }
      if (!real.startsWith(this.root + path.sep)) continue;
      return { rel, abs: real, stat: st };
    }
    return null;
  }

  async #memoryEntry(file) {
    const key = file.abs;
    const cached = this.cache.get(key);
    if (cached && cached.mtimeMs === file.stat.mtimeMs && cached.size === file.stat.size) return cached;
    if (cached) {
      this.cache.delete(key);
      this.cacheBytes -= cached.bytes;
    }
    const raw = await readFile(file.abs);
    const hash = createHash('sha1').update(raw).digest('base64url').slice(0, 20);
    const entry = { mtimeMs: file.stat.mtimeMs, size: file.stat.size, raw, hash, variants: {}, bytes: raw.length };
    if (this.cacheBytes + entry.bytes > this.maxCacheBytes) {
      this.cache.clear();
      this.cacheBytes = 0;
    }
    this.cache.set(key, entry);
    this.cacheBytes += entry.bytes;
    return entry;
  }

  async #variant(entry, encoding) {
    if (!entry.variants[encoding]) {
      entry.variants[encoding] = (
        encoding === 'br'
          ? brotli(entry.raw, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 10,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: entry.raw.length,
              },
            })
          : gzip(entry.raw, { level: 9 })
      ).then(
        (buf) => {
          entry.bytes += buf.length;
          this.cacheBytes += buf.length;
          return buf;
        },
        (err) => {
          delete entry.variants[encoding];
          throw err;
        },
      );
    }
    return entry.variants[encoding];
  }

  /**
   * Datei ausliefern.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {{ rel: string, abs: string, stat: import('node:fs').Stats }} file
   * @param {{ status?: number, cacheControl: string }} opts
   */
  async serve(req, res, file, { status = 200, cacheControl }) {
    const ext = extOf(file.rel);
    const headers = { 'Content-Type': mimeFor(file.rel), 'Cache-Control': cacheControl };
    const head = req.method === 'HEAD';

    if (COMPRESSIBLE.has(ext) && file.stat.size <= MAX_MEMORY_FILE) {
      const entry = await this.#memoryEntry(file);
      const encoding = entry.raw.length >= MIN_COMPRESS ? pickEncoding(req.headers['accept-encoding']) : null;
      const etag = `"${entry.hash}${encoding ? `-${encoding}` : ''}"`;
      headers.ETag = etag;
      headers.Vary = 'Accept-Encoding';
      if (status === 200 && etagMatches(req.headers['if-none-match'], etag)) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      const body = encoding ? await this.#variant(entry, encoding) : entry.raw;
      if (encoding) headers['Content-Encoding'] = encoding;
      headers['Content-Length'] = body.length;
      res.writeHead(status, headers);
      res.end(head ? undefined : body);
      return;
    }

    const etag = `"${file.stat.size.toString(36)}-${Math.floor(file.stat.mtimeMs).toString(36)}"`;
    headers.ETag = etag;
    if (status === 200 && etagMatches(req.headers['if-none-match'], etag)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    headers['Content-Length'] = file.stat.size;
    res.writeHead(status, headers);
    if (head) {
      res.end();
      return;
    }
    await new Promise((resolve) => {
      const stream = createReadStream(file.abs);
      stream.on('error', (err) => {
        this.log.error(`[static] Lesefehler ${file.rel}: ${err.message}`);
        res.destroy(err);
        resolve();
      });
      res.on('close', () => {
        stream.destroy();
        resolve();
      });
      stream.pipe(res);
    });
  }
}

/**
 * Umschaltbare Auslieferung (CMS-Builds): hält die aktuelle StaticFiles-Instanz. set() tauscht sie atomar
 * aus — die neue Instanz startet mit leerem Kompressions-Cache, laufende Antworten der alten laufen zu Ende.
 */
export class StaticSwitch {
  /** @param {StaticFiles|null} [inner] */
  constructor(inner = null) {
    this.inner = inner;
  }

  set(inner) {
    this.inner = inner;
  }

  get distDir() {
    return this.inner?.distDir ?? null;
  }

  async find(candidates) {
    return this.inner ? this.inner.find(candidates) : null;
  }

  serve(req, res, file, opts) {
    return this.inner.serve(req, res, file, opts);
  }
}
