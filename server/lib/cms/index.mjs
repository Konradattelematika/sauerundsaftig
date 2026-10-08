/**
 * CMS im Server verdrahten (docs/CMS-PLAN.md §7): Speicher, Benutzer, Medien, Build-Pipeline,
 * umschaltbare Auslieferung (Live/Vorschau), Weiterleitungen und API.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../http.mjs';
import { StaticFiles, StaticSwitch } from '../static.mjs';
import { loadDefinitions } from '../../../src/cms/definitions.mjs';
import { assembleSeed } from '../../../src/cms/store.mjs';
import { validateSiteDoc } from '../../../src/cms/validate.mjs';
import { createCmsApi } from './api.mjs';
import { createAstroBuilder } from './astro-builder.mjs';
import { BuildManager } from './builds.mjs';
import { contentHash, referencedFiles } from './content.mjs';
import { MediaFiles } from './media.mjs';
import { CmsStore, createAuditor } from './store.mjs';
import { UserStore } from './users.mjs';

/** Code-Version: SUS_CODE_VERSION, sonst <appDir>/.code-version (beim Image-Build erzeugt), sonst 'dev' */
export async function readCodeVersion(config) {
  if (config.codeVersion) return config.codeVersion;
  try {
    const v = (await readFile(path.join(config.appDir, '.code-version'), 'utf8')).trim();
    if (v) return v;
  } catch {
    /* lokal: keine Datei */
  }
  return 'dev';
}

/** Weiterleitungen eines Inhaltsstands → Map(from → { to, status }) */
export function redirectMap(doc) {
  const map = new Map();
  for (const r of Array.isArray(doc?.redirects) ? doc.redirects : []) {
    if (typeof r?.from === 'string' && typeof r.to === 'string' && r.from.startsWith('/')) {
      map.set(r.from, { to: r.to, status: r.status === 302 ? 302 : 301 });
    }
  }
  return map;
}

/**
 * @param {{ config: object, envUsers: object[], passwords?: object, now?: () => Date, log?: Console,
 *           builder?: Function, migrations?: object[], targetVersion?: number }} opts
 */
export async function createCms({ config, envUsers, passwords, now = () => new Date(), log = console, builder, migrations, targetVersion }) {
  const { dataDir, appDir } = config;
  const audit = createAuditor(dataDir, now, log);
  const defs = await loadDefinitions({ log });
  // Seed: SUS_CMS_SEED_DIR, sonst <appDir>/src/cms/seed, sonst neben src/cms/store.mjs
  const seedDir = config.cmsSeedDir ?? path.join(appDir, 'src', 'cms', 'seed');
  const seed = () => assembleSeed(existsSync(path.join(seedDir, 'settings.json')) ? seedDir : undefined);

  const store = await new CmsStore({ dataDir, seed, now, log, audit, ...(migrations ? { migrations } : {}), ...(targetVersion ? { targetVersion } : {}) }).init();
  const users = await new UserStore({ dataDir, envUsers, target: config.users, passwords, now, log, audit }).init();
  const media = await new MediaFiles({ dataDir, appDir, log }).init();
  const codeVersion = await readCodeVersion(config);

  const liveFiles = new StaticSwitch();
  const previewFiles = new StaticSwitch();
  let redirects = new Map();

  async function readContent(file) {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      log.warn(`[cms] ${file} unlesbar: ${err.message}`);
      return null;
    }
  }

  const builds = new BuildManager({
    dataDir,
    appDir,
    imageDistDir: config.distDir,
    codeVersion,
    builder: builder ?? createAstroBuilder(),
    getDoc: (kind) => (kind === 'live' ? store.published : store.draft),
    media,
    now,
    log,
    audit,
    timeoutMs: config.buildTimeoutMs,
    onSwitch: async (kind, info) => {
      const files = await new StaticFiles(info.distDir, { log }).init();
      if (kind === 'live') {
        liveFiles.set(files);
        redirects = redirectMap(await readContent(info.contentFile));
      } else {
        previewFiles.set(files);
      }
    },
  });

  // Das Image-dist ist aus dem Seed gebaut: es bildet den veröffentlichten Stand ab, solange der
  // Inhalt dem Seed entspricht (Erststart). Sonst gilt es als veraltet.
  let imageRevision = null;
  try {
    const seedDoc = { ...seed(), schemaVersion: store.published.schemaVersion };
    if (contentHash(seedDoc) === contentHash(store.published)) imageRevision = store.published.meta.revision;
  } catch (err) {
    log.warn(`[cms] Seed nicht lesbar: ${err.message}`);
  }
  await builds.init({ imageRevision });
  liveFiles.set(await new StaticFiles(builds.liveDistDir(), { log }).init());
  if (builds.previewDistDir()) previewFiles.set(await new StaticFiles(builds.previewDistDir(), { log }).init());
  redirects = redirectMap(builds.liveContentFile() ? await readContent(builds.liveContentFile()) : store.published);

  const cms = {
    config,
    appDir,
    defs,
    store,
    users,
    media,
    builds,
    codeVersion,
    now,
    log,
    liveFiles,
    previewFiles,

    /** → { errors, warnings } */
    validate(doc, mode, mediaFiles) {
      return validateSiteDoc(doc, defs, { mode, mediaFiles });
    },

    /** wirft 422 { errors, warnings } bei Fehlern */
    validateOrThrow(doc, mode, mediaFiles) {
      const result = validateSiteDoc(doc, defs, { mode, mediaFiles });
      if (result.errors.length) {
        const n = result.errors.length;
        const err = new HttpError(422, n === 1 ? 'Der Inhalt enthält einen Fehler.' : `Der Inhalt enthält ${n} Fehler.`);
        err.body = result;
        throw err;
      }
      return result;
    },

    /** Upload-Dateien löschen, auf die weder Entwurf noch veröffentlichter Stand verweisen */
    async gcMedia() {
      const keep = new Set([...referencedFiles(store.draft), ...referencedFiles(store.published)]);
      const removed = await media.collectGarbage(keep, { nowMs: now().getTime() });
      if (removed.length) await audit({ user: 'system', action: 'cms.media.gc', files: removed });
    },

    /** Weiterleitung für einen Pfad (aktueller Live-Build) oder null */
    redirectFor(p) {
      return redirects.get(p) ?? null;
    },

    async close() {
      await builds.stop();
      await store.drain();
      await users.drain();
    },
  };
  cms.handleApi = createCmsApi(cms);

  if (config.buildOnStart && builds.needsLiveBuild(store.published.meta.revision)) {
    const why = builds.current.codeVersion !== codeVersion ? `neuer Code (${builds.current.codeVersion} → ${codeVersion})` : `Inhalt r${builds.current.revision ?? '?'} → r${store.published.meta.revision}`;
    log.info?.(`[cms] Live-Build beim Start nötig: ${why} — bis dahin bleibt der vorige Build online.`);
    builds.request('live', { reason: `start: ${why}` });
  }
  return cms;
}
