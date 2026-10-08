/**
 * Build-Pipeline (docs/CMS-PLAN.md §7.4): ein Worker, Warteschlange (Live vor Vorschau; je Art höchstens
 * ein wartender Auftrag — neue Anfragen werden zusammengefasst und bauen beim Start den dann aktuellen Stand).
 *
 * Ablauf je Build: Medien-Sync → content.json → Builder (Astro) → Erfolg: Zeiger atomar umsetzen,
 * onSwitch (Static neu, Kompressions-Cache leer, Weiterleitungen neu) → alte Builds bis auf einen löschen.
 * Fehler: alter Build bleibt online, Protokoll unter builds/logs/<id>.log, logTail im Build-Status.
 *
 *   <dataDir>/builds/<id>/{content.json,dist/,build.log}   Live-Builds
 *   <dataDir>/builds/current.json                         Zeiger { id, dir, revision, codeVersion, builtAt }
 *   <dataDir>/builds/preview/<id>/…, preview/current.json  Vorschau
 *   <dataDir>/builds/state.json                           letzter Auftrag je Art (Status fürs Dashboard)
 *   <dataDir>/astro-cache/                                Astro-Cache (Bilder) über Deploys hinweg
 *
 * Ohne current.json gilt das dist/ aus dem Image als aktueller Build (Revision: siehe init()).
 */
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../store.mjs';
import { withoutMeta } from './content.mjs';

const BUILD_ID_RE = /^\d{8}-\d{6}-r\d+-[0-9a-f]{4}$/;
const TAIL_LINES = 40;
const TAIL_CHARS = 4000;
const KEEP_LOGS = 20;

const pad = (n) => String(n).padStart(2, '0');
function buildId(date, revision) {
  const d = date;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}-r${revision}-${randomBytes(2).toString('hex')}`;
}

async function isDir(p) {
  return stat(p).then((s) => s.isDirectory(), () => false);
}

async function readJsonOrNull(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export class BuildManager {
  /**
   * @param {{ dataDir: string, appDir: string, imageDistDir: string, codeVersion: string, builder: Function,
   *           getDoc: (kind: 'live'|'preview') => object, media?: { syncToApp(): Promise<object> },
   *           onSwitch?: (kind: string, info: object) => Promise<void>|void, now?: () => Date, log?: Console,
   *           audit?: (e: object) => Promise<void>, timeoutMs?: number }} opts
   */
  constructor({ dataDir, appDir, imageDistDir, codeVersion, builder, getDoc, media, onSwitch, now = () => new Date(), log = console, audit, timeoutMs = 10 * 60 * 1000 }) {
    this.dataDir = dataDir;
    this.appDir = appDir;
    this.imageDistDir = imageDistDir;
    this.codeVersion = codeVersion;
    this.builder = builder;
    this.getDoc = getDoc;
    this.media = media;
    this.onSwitch = onSwitch ?? (() => {});
    this.now = now;
    this.log = log;
    this.audit = audit ?? (async () => {});
    this.timeoutMs = timeoutMs;
    this.dir = path.join(dataDir, 'builds');
    this.previewDir = path.join(this.dir, 'preview');
    this.logsDir = path.join(this.dir, 'logs');
    this.cacheDir = path.join(dataDir, 'astro-cache');
    this.current = null;
    this.previewCurrent = null;
    this.last = { live: null, preview: null };
    this.pending = { live: null, preview: null };
    this.running = null;
    this.runningPromise = null;
    this.abort = null;
    this.stopped = false;
    this.idleWaiters = [];
  }

  /* ---------------------------------------------------------------- Start ---------- */

  async #readPointer(file, baseDir) {
    const p = await readJsonOrNull(file);
    if (!p || typeof p.id !== 'string' || !BUILD_ID_RE.test(p.id)) return null;
    const dir = path.join(baseDir, p.id);
    if (!(await isDir(path.join(dir, 'dist')))) {
      this.log.warn(`[build] Zeiger ${file} zeigt auf fehlendes Verzeichnis ${dir} — ignoriert.`);
      return null;
    }
    return { ...p, dir };
  }

  /**
   * Astro-Bild-Cache vorwärmen: Ist <dataDir>/astro-cache/assets leer, wird der Cache aus dem Image-Build
   * (<appDir>/node_modules/.astro/assets) übernommen — sonst rechnet der erste Build nach einem frischen
   * Volume alle Bildvarianten neu (mit VIPS_CONCURRENCY=1 viele Minuten).
   */
  async #warmCache() {
    const target = path.join(this.cacheDir, 'assets');
    const source = path.join(this.appDir, 'node_modules', '.astro', 'assets');
    if ((await isDir(target)) || !(await isDir(source))) return;
    try {
      await cp(source, target, { recursive: true });
      this.log.info?.(`[build] Astro-Bild-Cache aus dem Image übernommen (${(await readdir(target)).length} Dateien).`);
    } catch (err) {
      this.log.warn(`[build] Bild-Cache konnte nicht übernommen werden: ${err.message}`);
    }
  }

  /**
   * @param {{ imageRevision: number|null }} opts  Revision, die das Image-dist abbildet (null = unbekannt/veraltet)
   */
  async init({ imageRevision = null } = {}) {
    await mkdir(this.previewDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
    await mkdir(this.cacheDir, { recursive: true });
    this.current = (await this.#readPointer(path.join(this.dir, 'current.json'), this.dir)) ?? {
      id: 'image',
      dir: null,
      revision: imageRevision,
      codeVersion: this.codeVersion,
      builtAt: null,
      image: true,
    };
    this.previewCurrent = await this.#readPointer(path.join(this.previewDir, 'current.json'), this.previewDir);
    const state = await readJsonOrNull(path.join(this.dir, 'state.json'));
    for (const kind of ['live', 'preview']) {
      const rec = state?.[kind];
      if (rec && (rec.state === 'queued' || rec.state === 'running')) {
        rec.state = 'failed';
        rec.error = 'Server wurde während des Builds neu gestartet';
        rec.finishedAt ??= this.now().toISOString();
      }
      this.last[kind] = rec ?? null;
    }
    if (!this.last.live && this.current) {
      this.last.live = { id: this.current.id, kind: 'live', state: 'ok', revision: this.current.revision, finishedAt: this.current.builtAt };
    }
    return this;
  }

  /* ---------------------------------------------------------------- Status --------- */

  liveDistDir() {
    return this.current?.image ? this.imageDistDir : path.join(this.current.dir, 'dist');
  }

  previewDistDir() {
    return this.previewCurrent ? path.join(this.previewCurrent.dir, 'dist') : null;
  }

  /** content.json des Live-Builds (null beim Image-Build) */
  liveContentFile() {
    return this.current?.image ? null : path.join(this.current.dir, 'content.json');
  }

  previewContentFile() {
    return this.previewCurrent ? path.join(this.previewCurrent.dir, 'content.json') : null;
  }

  online() {
    const c = this.current;
    return { id: c.id, revision: c.revision, codeVersion: c.codeVersion, builtAt: c.builtAt, image: Boolean(c.image) };
  }

  previewOnline() {
    const c = this.previewCurrent;
    return c ? { id: c.id, revision: c.revision, builtAt: c.builtAt } : null;
  }

  #public(rec) {
    if (!rec) return null;
    const { id, kind, state, revision, queuedAt, startedAt, finishedAt, error, logTail, requestedBy, reason } = rec;
    return { id, kind, state, revision, queuedAt, startedAt, finishedAt, error, logTail, requestedBy, reason };
  }

  /** Aktueller Auftrag je Art: wartend > laufend > zuletzt beendet */
  status() {
    const pick = (kind) => this.pending[kind] ?? (this.running?.kind === kind ? this.running : null) ?? this.last[kind];
    return { live: this.#public(pick('live')), preview: this.#public(pick('preview')) };
  }

  /** Muss nach Start/Deploy neu gebaut werden? */
  needsLiveBuild(publishedRevision) {
    return this.current.codeVersion !== this.codeVersion || this.current.revision !== publishedRevision;
  }

  async #persist() {
    try {
      await writeFileAtomic(path.join(this.dir, 'state.json'), JSON.stringify(this.status(), null, 2));
    } catch (err) {
      this.log.warn(`[build] state.json nicht schreibbar: ${err.message}`);
    }
  }

  /* ---------------------------------------------------------------- Aufträge ------- */

  /**
   * Build anfordern. Wartet schon ein Auftrag dieser Art, wird er zurückgegeben (zusammengefasst).
   * @param {'live'|'preview'} kind  @param {{ user?: string, reason?: string }} [info]
   */
  request(kind, { user = 'system', reason } = {}) {
    if (this.stopped) throw new Error('Build-Worker ist beendet');
    let rec = this.pending[kind];
    if (!rec) {
      rec = {
        id: null,
        kind,
        state: 'queued',
        revision: this.getDoc(kind)?.meta?.revision ?? null,
        queuedAt: this.now().toISOString(),
        requestedBy: user,
        reason,
      };
      this.pending[kind] = rec;
    } else {
      rec.revision = this.getDoc(kind)?.meta?.revision ?? rec.revision;
      rec.requestedBy = user;
    }
    const snapshot = this.#public(rec); // vor dem Start des Workers: Antwort zeigt „queued“
    this.#persist();
    this.#kick();
    return snapshot;
  }

  #kick() {
    if (this.runningPromise || this.stopped) return;
    this.runningPromise = (async () => {
      try {
        while (!this.stopped) {
          const kind = this.pending.live ? 'live' : this.pending.preview ? 'preview' : null;
          if (!kind) break;
          const rec = this.pending[kind];
          this.pending[kind] = null;
          this.running = rec;
          try {
            await this.#run(rec);
          } catch (err) {
            this.log.error(`[build] unerwarteter Fehler: ${err?.stack ?? err}`);
          }
          this.last[kind] = rec;
          this.running = null;
          await this.#persist();
        }
      } finally {
        this.runningPromise = null;
        for (const w of this.idleWaiters.splice(0)) w();
      }
    })();
  }

  /** Wartet, bis die Warteschlange leer ist (Tests, Shutdown) */
  idle() {
    if (!this.runningPromise && !this.pending.live && !this.pending.preview) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  async #run(rec) {
    const kind = rec.kind;
    const doc = this.getDoc(kind);
    const revision = doc?.meta?.revision ?? null;
    const startedAt = this.now();
    rec.revision = revision;
    rec.state = 'running';
    rec.startedAt = startedAt.toISOString();
    rec.id = buildId(startedAt, revision ?? 0);
    await this.#persist();

    const baseDir = kind === 'live' ? this.dir : this.previewDir;
    const dir = path.join(baseDir, rec.id);
    const outDir = path.join(dir, 'dist');
    const contentFile = path.join(dir, 'content.json');
    await mkdir(dir, { recursive: true });
    const logFile = path.join(dir, 'build.log');
    const logStream = createWriteStream(logFile, { flags: 'a' });
    const tail = [];
    const onLog = (line) => {
      logStream.write(`${line}\n`);
      tail.push(line);
      if (tail.length > TAIL_LINES * 3) tail.splice(0, tail.length - TAIL_LINES);
    };
    onLog(`[${startedAt.toISOString()}] ${kind}-Build ${rec.id} · Revision ${revision} · Code ${this.codeVersion}`);
    this.log.info?.(`[build] ${kind} ${rec.id} startet (Revision ${revision})`);
    this.abort = new AbortController();
    try {
      await this.#warmCache(); // nur beim allerersten Build (Cache-Ordner fehlt noch)
      if (this.media) {
        const sync = await this.media.syncToApp();
        onLog(`Medien-Sync: ${sync.total} Dateien, ${sync.copied} kopiert, ${sync.removed} entfernt`);
      }
      await writeFileAtomic(contentFile, JSON.stringify({ ...withoutMeta(doc), meta: { revision } }));
      await this.builder({
        appDir: this.appDir,
        outDir,
        contentFile,
        cacheDir: this.cacheDir,
        kind,
        timeoutMs: this.timeoutMs,
        signal: this.abort.signal,
        onLog,
      });
      if (!(await stat(path.join(outDir, 'index.html')).then(() => true, () => false))) {
        throw new Error('Build lieferte keine Startseite (dist/index.html fehlt)');
      }
      const builtAt = this.now().toISOString();
      const pointer = { id: rec.id, revision, codeVersion: this.codeVersion, builtAt };
      await writeFileAtomic(path.join(baseDir, 'current.json'), JSON.stringify(pointer, null, 2));
      const previous = kind === 'live' ? this.current : this.previewCurrent;
      if (kind === 'live') this.current = { ...pointer, dir };
      else this.previewCurrent = { ...pointer, dir };
      try {
        await this.onSwitch(kind, { distDir: outDir, contentFile, revision, id: rec.id });
      } catch (err) {
        this.log.error(`[build] Umschalten (${kind}) meldet Fehler: ${err?.message ?? err}`);
      }
      rec.state = 'ok';
      onLog(`[${builtAt}] fertig in ${((Date.parse(builtAt) - startedAt.getTime()) / 1000).toFixed(1)} s — online`);
      this.log.info?.(`[build] ${kind} ${rec.id} ok — umgeschaltet`);
      await this.#cleanup(baseDir, [rec.id, previous?.image ? null : previous?.id]);
      await this.audit({ user: rec.requestedBy, action: `cms.build.${kind}`, id: rec.id, revision, state: 'ok' });
    } catch (err) {
      rec.state = 'failed';
      rec.error = err?.message ?? String(err);
      onLog(`FEHLER: ${rec.error}`);
      this.log.error(`[build] ${kind} ${rec.id} fehlgeschlagen: ${rec.error}`);
      await this.audit({ user: rec.requestedBy, action: `cms.build.${kind}`, id: rec.id, revision, state: 'failed', error: rec.error });
    } finally {
      this.abort = null;
      rec.finishedAt = this.now().toISOString();
      rec.logTail = tail.slice(-TAIL_LINES).join('\n').slice(-TAIL_CHARS);
      await new Promise((resolve) => logStream.end(resolve));
      if (rec.state === 'failed') {
        await rename(logFile, path.join(this.logsDir, `${rec.id}.log`)).catch(() => {});
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      } else {
        await rename(logFile, path.join(this.logsDir, `${rec.id}.log`)).catch(() => {});
      }
      await this.#pruneLogs();
    }
  }

  async #cleanup(baseDir, keepIds) {
    const keep = new Set(keepIds.filter(Boolean));
    for (const name of await readdir(baseDir).catch(() => [])) {
      if (!BUILD_ID_RE.test(name) || keep.has(name)) continue;
      // laufende Builds liegen nie hier: der Worker baut seriell
      await rm(path.join(baseDir, name), { recursive: true, force: true }).catch((err) => this.log.warn(`[build] Aufräumen ${name}: ${err.message}`));
    }
  }

  async #pruneLogs() {
    const names = (await readdir(this.logsDir).catch(() => [])).filter((n) => n.endsWith('.log')).sort();
    for (const n of names.slice(0, Math.max(0, names.length - KEEP_LOGS))) await rm(path.join(this.logsDir, n), { force: true }).catch(() => {});
  }

  /** Shutdown: keine neuen Aufträge, laufenden Build abbrechen */
  async stop() {
    this.stopped = true;
    this.pending = { live: null, preview: null };
    this.abort?.abort();
    await this.runningPromise;
  }
}
