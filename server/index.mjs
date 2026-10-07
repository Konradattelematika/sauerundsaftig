#!/usr/bin/env node
/**
 * Sauer & Saftig — Webserver (Node 22, keine npm-Abhängigkeiten).
 * Liefert dist/ aus, routet nach Host, Login/Go-Live-Schranke, JSON-API. Siehe server/README.md.
 */
import { loadConfig } from './lib/config.mjs';
import { startServer } from './lib/app.mjs';

const config = loadConfig(process.env);
for (const w of config.warnings) console.warn(`[config] WARNUNG: ${w}`);

const { url, close } = await startServer(config);
console.log(
  `[server] läuft auf ${url} · dist=${config.distDir} · data=${config.dataDir} · ` +
    `live=${config.liveHosts.join(',')} · tools=${Object.entries(config.toolHosts)
      .map(([h, p]) => `${h}→${p}`)
      .join(',')} · goLive=${config.goLiveAt?.toISOString() ?? 'ungültig'}${config.forcePrivate ? ' (FORCE_PRIVATE)' : ''} · ` +
    `Benutzer=${config.users.length}`,
);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[server] ${signal} empfangen — fahre herunter …`);
  const force = setTimeout(() => {
    console.error('[server] Shutdown dauert zu lange — beende hart.');
    process.exit(1);
  }, 10_000);
  force.unref();
  try {
    await close();
    console.log('[server] sauber beendet.');
    process.exit(0);
  } catch (err) {
    console.error(`[server] Fehler beim Beenden: ${err?.message ?? err}`);
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
