/**
 * Echter Builder: `node node_modules/astro/astro.js build` im App-Verzeichnis (docs/CMS-PLAN.md §7.4).
 * Bekommt nur eine schlanke Umgebung (keine Server-Secrets), läuft in eigener Prozessgruppe und wird
 * bei Zeitüberschreitung bzw. Shutdown samt Kindprozessen beendet.
 *
 * Builder-Vertrag (auch für Fake-Builder in Tests):
 *   builder({ appDir, outDir, contentFile, cacheDir, kind: 'live'|'preview', timeoutMs, signal, onLog }) → Promise<void>
 *   wirft bei Fehlern (message = kurze deutsche Ursache)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const PASS_ENV = ['PATH', 'HOME', 'TZ', 'LANG', 'LC_ALL', 'TMPDIR', 'SUS_CMS_SEED_DIR'];

export function astroBuildEnv({ outDir, contentFile, cacheDir, kind, base = process.env }) {
  const env = {};
  for (const k of PASS_ENV) if (base[k]) env[k] = base[k];
  return {
    ...env,
    NODE_ENV: 'production',
    ASTRO_TELEMETRY_DISABLED: '1',
    SUS_CMS_FILE: contentFile,
    SUS_OUT_DIR: outDir,
    SUS_ASTRO_CACHE_DIR: cacheDir,
    // RAM-schonend (Server mit Produktions-Apps): ein libvips-Thread, kleiner libuv-Pool, Heap-Limit
    VIPS_CONCURRENCY: '1',
    UV_THREADPOOL_SIZE: '2',
    NODE_OPTIONS: '--max-old-space-size=1536',
    ...(kind === 'preview' ? { SUS_CMS_EDIT: '1' } : {}),
  };
}

/** @param {{ nodeBin?: string, killGraceMs?: number }} [opts] */
export function createAstroBuilder({ nodeBin = process.execPath, killGraceMs = 5000 } = {}) {
  return function astroBuild({ appDir, outDir, contentFile, cacheDir, kind, timeoutMs = 10 * 60 * 1000, signal, onLog = () => {} }) {
    return new Promise((resolve, reject) => {
      const astro = path.join(appDir, 'node_modules', 'astro', 'astro.js');
      const child = spawn(nodeBin, [astro, 'build'], {
        cwd: appDir,
        env: astroBuildEnv({ outDir, contentFile, cacheDir, kind }),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let reason = null;
      let killTimer = null;
      const killGroup = (why) => {
        if (reason) return;
        reason = why;
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* schon beendet */
        }
        killTimer = setTimeout(() => {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* schon beendet */
          }
        }, killGraceMs);
        killTimer.unref?.();
      };
      const timer = setTimeout(() => killGroup(`Zeitüberschreitung nach ${Math.round(timeoutMs / 60000)} Minuten`), timeoutMs);
      timer.unref?.();
      const onAbort = () => killGroup('Server wird beendet');
      signal?.addEventListener('abort', onAbort, { once: true });

      let partial = { out: '', err: '' };
      const feed = (key) => (chunk) => {
        const text = partial[key] + chunk.toString('utf8');
        const lines = text.split(/\r?\n/);
        partial[key] = lines.pop() ?? '';
        for (const line of lines) onLog(line);
      };
      child.stdout.on('data', feed('out'));
      child.stderr.on('data', feed('err'));
      child.on('error', (err) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(new Error(`Build konnte nicht gestartet werden: ${err.message}`));
      });
      child.on('close', (code, sig) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener('abort', onAbort);
        for (const key of ['out', 'err']) if (partial[key]) onLog(partial[key]);
        partial = { out: '', err: '' };
        if (reason) reject(new Error(`Build abgebrochen: ${reason}`));
        else if (code === 0) resolve();
        else reject(new Error(`Build fehlgeschlagen (${sig ? `Signal ${sig}` : `Exit-Code ${code}`}) — Details im Protokoll`));
      });
    });
  };
}
