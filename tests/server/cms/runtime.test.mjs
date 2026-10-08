/**
 * Laufzeit-Details rund um Deploys: Code-Version, Grundbestand nachziehen (solange nie veröffentlicht),
 * Astro-Bild-Cache aus dem Image vorwärmen.
 */
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { computeCodeVersion } from '../../../server/code-version.mjs';
import { cmsApi, editDraft, loginAs, makeAppDir, startCms } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let srv;
afterEach(async () => {
  await srv?.stop();
  srv = undefined;
});

describe('Code-Version', () => {
  it('stabil, ändert sich mit Quellen, ignoriert Upload-Kopien', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sus-cv-'));
    try {
      await mkdir(path.join(dir, 'src', 'assets', 'media'), { recursive: true });
      await writeFile(path.join(dir, 'src', 'a.astro'), 'A');
      await writeFile(path.join(dir, 'package.json'), '{}');
      const v1 = computeCodeVersion(dir);
      expect(v1).toMatch(/^[0-9a-f]{16}$/);
      expect(computeCodeVersion(dir)).toBe(v1);
      await writeFile(path.join(dir, 'src', 'assets', 'media', 'upload.jpg'), 'x');
      await writeFile(path.join(dir, 'README.md'), 'egal');
      expect(computeCodeVersion(dir)).toBe(v1);
      await writeFile(path.join(dir, 'src', 'a.astro'), 'B');
      expect(computeCodeVersion(dir)).not.toBe(v1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Grundbestand nachziehen', () => {
  it('neuer Seed wird übernommen, solange nichts veröffentlicht oder geändert wurde — danach nicht mehr', async () => {
    srv = await startCms();
    const seedDir = path.join(srv.appDir, 'src', 'cms', 'seed');
    await cp(path.join(ROOT, 'src', 'cms', 'seed'), seedDir, { recursive: true });
    const settingsFile = path.join(seedDir, 'settings.json');
    const setClaim = async (claim) => {
      const s = JSON.parse(await readFile(settingsFile, 'utf8'));
      s.claim = claim;
      await writeFile(settingsFile, JSON.stringify(s));
    };
    const opts = srv.restartOpts();
    await srv.stop({ keepData: true });

    await setClaim('Neuer Seed-Claim');
    srv = await startCms(opts);
    let cookie = await loginAs(srv.port, 'konrad');
    let st = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st.draft.settings.claim).toBe('Neuer Seed-Claim');
    expect(st.publishedMeta).toMatchObject({ revision: 2, publishedBy: 'seed' });
    expect(st.online).toMatchObject({ id: 'image', revision: 2 }); // Image ist aus genau diesem Seed gebaut
    expect((await cmsApi(srv.port, cookie, 'GET', '/versions')).json).toHaveLength(2);
    expect(srv.builder.calls).toHaveLength(0);

    // Jemand ändert den Entwurf → kein Nachziehen mehr
    await editDraft(srv.port, cookie, (d) => {
      d.settings.claim = 'Von Hand';
    });
    await srv.stop({ keepData: true });
    await setClaim('Noch neuerer Seed');
    srv = await startCms(opts);
    cookie = await loginAs(srv.port, 'konrad');
    st = (await cmsApi(srv.port, cookie, 'GET', '/state')).json;
    expect(st.draft.settings.claim).toBe('Von Hand');
    expect(st.publishedMeta.revision).toBe(2);
    // Image-dist passt nicht mehr zum veröffentlichten Stand → beim Start neu gebaut
    await srv.cms.builds.idle();
    expect(srv.builder.calls).toHaveLength(1);
    expect(st.live).toMatchObject({ kind: 'live' });
  });
});

describe('Astro-Bild-Cache', () => {
  it('wird beim ersten Build aus node_modules/.astro/assets übernommen, danach nicht überschrieben', async () => {
    const appDir = await makeAppDir();
    await mkdir(path.join(appDir, 'node_modules', '.astro', 'assets'), { recursive: true });
    await writeFile(path.join(appDir, 'node_modules', '.astro', 'assets', 'bild_abc.webp'), 'cache');
    srv = await startCms({ appDir });
    const cached = path.join(srv.dataDir, 'astro-cache', 'assets', 'bild_abc.webp');
    expect(existsSync(cached)).toBe(false); // Serverstart allein kopiert nichts
    const cookie = await loginAs(srv.port, 'konrad');
    await cmsApi(srv.port, cookie, 'POST', '/preview', {});
    await srv.cms.builds.idle();
    expect(await readFile(cached, 'utf8')).toBe('cache');
    await writeFile(cached, 'neuer');
    await cmsApi(srv.port, cookie, 'POST', '/preview', {});
    await srv.cms.builds.idle();
    expect(await readFile(cached, 'utf8')).toBe('neuer');
  });
});
