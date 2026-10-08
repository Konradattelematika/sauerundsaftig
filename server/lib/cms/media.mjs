/**
 * Medien (docs/CMS-PLAN.md §6): Upload-Prüfung per Magic Bytes, Normalisierung mit sharp (EXIF-Drehung,
 * Metadaten weg, max. 3000 px), Ablage unter <dataDir>/media, Vorschaubilder mit Datei-Cache,
 * Sync nach <appDir>/src/assets/media vor jedem Build, Aufräumen nicht mehr verwendeter Dateien.
 *
 * sharp wird dynamisch aus dem App-node_modules geladen (im Runtime-Image vorhanden); fehlt es,
 * antworten Upload und Vorschaubilder mit 503 — der restliche Server läuft weiter.
 */
import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdir, readdir, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HttpError } from '../http.mjs';

export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
export const MAX_EDGE = 3000;
export const THUMB_WIDTHS = [160, 320, 640, 960, 1280, 1920];
const MEDIA_NAME_RE = /^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp|avif)$/;
const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
const THUMB_DIR = '.thumbs';
const MAX_THUMBS = 1500;

/** Bildformat aus den ersten Bytes → 'jpeg' | 'png' | 'webp' | 'avif' | null */
export function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 4, 8) === 'ftyp') {
    const size = Math.min(buf.readUInt32BE(0), buf.length, 64);
    const brands = [buf.toString('latin1', 8, 12)];
    for (let o = 16; o + 4 <= size; o += 4) brands.push(buf.toString('latin1', o, o + 4));
    if (brands.some((b) => b === 'avif' || b === 'avis')) return 'avif';
  }
  return null;
}

let sharpPromise = null;
/** sharp aus <appDir>/node_modules laden (einmal), sparsam konfiguriert */
export function loadSharp(appDir) {
  sharpPromise ??= (async () => {
    let mod;
    try {
      const req = createRequire(path.join(appDir, 'package.json'));
      mod = await import(pathToFileURL(req.resolve('sharp')).href);
    } catch {
      mod = await import('sharp');
    }
    const sharp = mod.default ?? mod;
    sharp.concurrency(1);
    sharp.cache(false);
    return sharp;
  })().catch((err) => {
    sharpPromise = null;
    throw new HttpError(503, `Bildverarbeitung nicht verfügbar (sharp fehlt): ${err?.message ?? err}`);
  });
  return sharpPromise;
}

/**
 * Upload normalisieren. JPEG → JPEG, PNG → PNG, WebP/AVIF → WebP (AVIF ist beim Bauen langsam).
 * @returns {Promise<{ data: Buffer, ext: string, width: number, height: number }>}
 */
export async function normalizeImage(buf, type, appDir) {
  const sharp = await loadSharp(appDir);
  let pipeline;
  try {
    pipeline = sharp(buf, { failOn: 'error', limitInputPixels: 80_000_000, animated: false })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
    let ext;
    if (type === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
      ext = 'jpg';
    } else if (type === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
      ext = 'png';
    } else {
      pipeline = pipeline.webp({ quality: 88 });
      ext = 'webp';
    }
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { data, ext, width: info.width, height: info.height };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(415, 'Die Datei ist kein lesbares Bild (beschädigt oder zu groß).');
  }
}

/** Dateiname → Medien-ID-Vorschlag (kebab-case, ohne Endung) */
export function slugifyName(name) {
  const base = String(name ?? '')
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return base || 'bild';
}

export function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const id = `${base.slice(0, 60)}-${i}`;
    if (!taken.has(id)) return id;
  }
}

export class MediaFiles {
  /** @param {{ dataDir: string, appDir: string, log?: Console }} opts */
  constructor({ dataDir, appDir, log = console }) {
    this.dir = path.join(dataDir, 'media');
    this.thumbDir = path.join(this.dir, THUMB_DIR);
    this.appDir = appDir;
    this.assetsDir = path.join(appDir, 'src', 'assets');
    this.log = log;
  }

  async init() {
    await mkdir(this.thumbDir, { recursive: true });
    return this;
  }

  /** Vorhandene Upload-Dateien als Set('media/<datei>') — für den Validator */
  async list() {
    const names = await readdir(this.dir).catch(() => []);
    return new Set(names.filter((n) => MEDIA_NAME_RE.test(n)).map((n) => `media/${n}`));
  }

  /** Normalisierte Bilddaten speichern → 'media/<datei>' (vorhandene Dateien werden nie überschrieben) */
  async store(id, { data, ext }) {
    let name = `${id}.${ext}`;
    const exists = async (n) => stat(path.join(this.dir, n)).then(() => true, () => false);
    if (await exists(name)) name = `${id}-${randomBytes(3).toString('hex')}.${ext}`;
    const tmp = path.join(this.dir, `.${name}.${randomBytes(4).toString('hex')}.tmp`);
    await writeFile(tmp, data, { mode: 0o640 });
    await rename(tmp, path.join(this.dir, name));
    return `media/${name}`;
  }

  /** Absoluter Pfad der Bildquelle eines Medien-Eintrags (Upload/Ersatz → /data/media, sonst src/assets) oder null */
  sourcePath(item) {
    if (!item) return null;
    const rel = item.replacedBy ?? item.file;
    if (typeof rel !== 'string') return null;
    if (rel.startsWith('media/')) {
      const name = rel.slice(6);
      return MEDIA_NAME_RE.test(name) ? path.join(this.dir, name) : null;
    }
    if (!/^(photos|placeholders)\//.test(rel) || rel.includes('..') || rel.includes('\\')) return null;
    const abs = path.resolve(this.assetsDir, rel);
    return abs.startsWith(this.assetsDir + path.sep) ? abs : null;
  }

  /**
   * Vorschaubild (WebP) aus dem Cache bzw. neu erzeugt.
   * @returns {Promise<{ file: string, etag: string, type: string }>}
   */
  async thumbnail(src, width) {
    const st = await stat(src);
    const key = createHash('sha1').update(`${src}|${st.size}|${st.mtimeMs}|${width}`).digest('hex').slice(0, 24);
    const file = path.join(this.thumbDir, `${key}.webp`);
    const etag = `"t-${key}"`;
    if (await stat(file).then(() => true, () => false)) return { file, etag, type: 'image/webp' };
    const sharp = await loadSharp(this.appDir);
    const data = await sharp(src, { failOn: 'none', limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
    this.#pruneThumbs().catch(() => {});
    return { file, etag, type: 'image/webp' };
  }

  async #pruneThumbs() {
    const names = (await readdir(this.thumbDir)).filter((n) => n.endsWith('.webp'));
    if (names.length <= MAX_THUMBS) return;
    const withTime = await Promise.all(names.map(async (n) => ({ n, t: (await stat(path.join(this.thumbDir, n)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
    withTime.sort((a, b) => a.t - b.t);
    for (const { n } of withTime.slice(0, Math.ceil(names.length * 0.2))) await unlink(path.join(this.thumbDir, n)).catch(() => {});
  }

  static mimeFor(file) {
    return EXT_MIME[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
  }

  /** <dataDir>/media → <appDir>/src/assets/media spiegeln (vor jedem Build) */
  async syncToApp() {
    const target = path.join(this.assetsDir, 'media');
    await mkdir(target, { recursive: true });
    const src = (await readdir(this.dir).catch(() => [])).filter((n) => MEDIA_NAME_RE.test(n));
    const srcSet = new Set(src);
    let copied = 0;
    let removed = 0;
    for (const name of src) {
      const a = await stat(path.join(this.dir, name));
      const b = await stat(path.join(target, name)).catch(() => null);
      if (b && b.size === a.size && Math.floor(b.mtimeMs) === Math.floor(a.mtimeMs)) continue;
      await copyFile(path.join(this.dir, name), path.join(target, name));
      await utimes(path.join(target, name), a.atime, a.mtime);
      copied++;
    }
    for (const name of await readdir(target)) {
      if (name === '.gitkeep' || srcSet.has(name)) continue;
      if (!MEDIA_NAME_RE.test(name)) continue;
      await unlink(path.join(target, name)).catch(() => {});
      removed++;
    }
    return { copied, removed, total: src.length };
  }

  /**
   * Upload-Dateien löschen, auf die nichts mehr verweist ('media/<datei>' nicht in keep). Frische Dateien
   * (jünger als minAgeMs) bleiben — ein Upload speichert erst die Datei, dann den Entwurf.
   */
  async collectGarbage(keep, { minAgeMs = 10 * 60 * 1000, nowMs = Date.now() } = {}) {
    const removed = [];
    for (const name of await readdir(this.dir).catch(() => [])) {
      if (!MEDIA_NAME_RE.test(name) || keep.has(`media/${name}`)) continue;
      const st = await stat(path.join(this.dir, name)).catch(() => null);
      if (!st || nowMs - st.mtimeMs < minAgeMs) continue;
      await unlink(path.join(this.dir, name)).catch(() => {});
      removed.push(name);
    }
    return removed;
  }
}
