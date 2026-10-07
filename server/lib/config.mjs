/**
 * Konfiguration aus Umgebungsvariablen (siehe server/README.md).
 * Reine Funktion: loadConfig(env) → Konfigurationsobjekt; Warnungen landen in config.warnings,
 * damit index.mjs sie loggen und Tests sie prüfen können.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo- bzw. App-Wurzel (Elternordner von server/) — im Container /app. */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULT_GO_LIVE_AT = '2026-10-10T16:00:00+02:00';
export const DEFAULT_LIVE_HOSTS = ['sauerundsaftig.de'];
export const DEFAULT_WWW_HOSTS = ['www.sauerundsaftig.de'];
export const DEFAULT_TOOL_HOSTS = {
  'checkliste.sauerundsaftig.de': 'checkliste',
  'module.sauerundsaftig.de': 'module',
};
export const DEFAULT_COOKIE_DOMAIN = 'sauerundsaftig.de';
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
export const ROLES = ['team', 'inhaberin'];

const HOST_RE = /^[a-z0-9.-]+$/;
const USER_ID_RE = /^[a-z0-9_-]{1,32}$/;

function parseHostList(value, fallback, warnings, name) {
  if (value === undefined || value.trim() === '') return [...fallback];
  const hosts = value
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const bad = hosts.filter((h) => !HOST_RE.test(h));
  if (bad.length) warnings.push(`${name}: ungültige Hosts ignoriert: ${bad.join(', ')}`);
  return hosts.filter((h) => HOST_RE.test(h));
}

/** "checkliste.example.de=checkliste,module.example.de=module" → { host: prefix } */
function parseToolHosts(value, warnings) {
  if (value === undefined || value.trim() === '') return { ...DEFAULT_TOOL_HOSTS };
  const map = {};
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [host, prefix] = trimmed.split('=').map((s) => (s ?? '').trim().toLowerCase());
    if (!host || !prefix || !HOST_RE.test(host) || !/^[a-z0-9-]+$/.test(prefix)) {
      warnings.push(`SUS_TOOL_HOSTS: Eintrag „${trimmed}" ignoriert (Format host=präfix)`);
      continue;
    }
    map[host] = prefix;
  }
  return map;
}

/** SUS_USERS: JSON-Array [{ id, name, role, hash }] → validierte Liste (ungültige Einträge werden verworfen). */
export function parseUsers(value, warnings = []) {
  if (value === undefined || value.trim() === '') {
    warnings.push('SUS_USERS ist leer — niemand kann sich anmelden.');
    return [];
  }
  let raw;
  try {
    raw = JSON.parse(value);
  } catch {
    warnings.push('SUS_USERS ist kein gültiges JSON — niemand kann sich anmelden.');
    return [];
  }
  if (!Array.isArray(raw)) {
    warnings.push('SUS_USERS muss ein JSON-Array sein — niemand kann sich anmelden.');
    return [];
  }
  const users = [];
  const seen = new Set();
  for (const u of raw) {
    const id = typeof u?.id === 'string' ? u.id.trim().toLowerCase() : '';
    if (!USER_ID_RE.test(id)) {
      warnings.push(`SUS_USERS: Eintrag ohne gültige id ignoriert (${JSON.stringify(u?.id ?? null)})`);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`SUS_USERS: doppelte id „${id}" ignoriert`);
      continue;
    }
    if (typeof u.hash !== 'string' || !u.hash.startsWith('scrypt$')) {
      warnings.push(`SUS_USERS: „${id}" hat keinen scrypt-Hash — ignoriert`);
      continue;
    }
    const role = ROLES.includes(u.role) ? u.role : 'team';
    if (u.role !== undefined && !ROLES.includes(u.role)) {
      warnings.push(`SUS_USERS: „${id}" hat unbekannte Rolle „${u.role}" — als „team" behandelt`);
    }
    const name = typeof u.name === 'string' && u.name.trim() ? u.name.trim().slice(0, 60) : id;
    seen.add(id);
    users.push({ id, name, role, hash: u.hash });
  }
  return users;
}

function parseBool(value) {
  return value !== undefined && ['1', 'true', 'yes', 'ja', 'on'].includes(value.trim().toLowerCase());
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ appRoot?: string }} [opts]
 */
export function loadConfig(env = process.env, opts = {}) {
  const appRoot = opts.appRoot ?? APP_ROOT;
  const warnings = [];

  const port = Number.parseInt(env.PORT ?? '3000', 10);

  // Go-Live: ungültiges Datum → Schranke bleibt zu (fail closed), Warnung.
  const goLiveRaw = env.SUS_GO_LIVE_AT?.trim() || DEFAULT_GO_LIVE_AT;
  let goLiveAt = new Date(goLiveRaw);
  if (Number.isNaN(goLiveAt.getTime())) {
    warnings.push(`SUS_GO_LIVE_AT „${goLiveRaw}" ist kein gültiges Datum — Live-Host bleibt privat.`);
    goLiveAt = null;
  }

  let sessionSecret = env.SUS_SESSION_SECRET ?? '';
  let sessionSecretEphemeral = false;
  if (!sessionSecret) {
    sessionSecret = randomBytes(32).toString('base64url');
    sessionSecretEphemeral = true;
    warnings.push('SUS_SESSION_SECRET fehlt — zufälliges Secret erzeugt; Sessions gelten nur bis zum Neustart.');
  } else if (sessionSecret.length < 32) {
    warnings.push('SUS_SESSION_SECRET ist kürzer als 32 Zeichen — bitte ein längeres Secret setzen.');
  }

  const exportToken = env.SUS_EXPORT_TOKEN?.trim() || null;
  if (exportToken && exportToken.length < 24) {
    warnings.push('SUS_EXPORT_TOKEN ist kürzer als 24 Zeichen — bitte ein längeres Token setzen.');
  }

  const users = parseUsers(env.SUS_USERS, warnings);

  const cookieDomainRaw = env.SUS_COOKIE_DOMAIN?.trim().toLowerCase().replace(/^\./, '');
  const cookieDomain = cookieDomainRaw === undefined ? DEFAULT_COOKIE_DOMAIN : cookieDomainRaw || null;

  return {
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    listenHost: env.HOST?.trim() || '0.0.0.0',
    distDir: path.resolve(appRoot, env.SUS_DIST_DIR?.trim() || 'dist'),
    dataDir: path.resolve(appRoot, env.SUS_DATA_DIR?.trim() || '/data'),
    seedFile: path.resolve(appRoot, env.SUS_SEED_FILE?.trim() || 'server/seed/checklist.json'),
    liveHosts: parseHostList(env.SUS_LIVE_HOSTS, DEFAULT_LIVE_HOSTS, warnings, 'SUS_LIVE_HOSTS'),
    wwwHosts: parseHostList(env.SUS_WWW_HOSTS, DEFAULT_WWW_HOSTS, warnings, 'SUS_WWW_HOSTS'),
    toolHosts: parseToolHosts(env.SUS_TOOL_HOSTS, warnings),
    goLiveAt,
    forcePrivate: parseBool(env.SUS_FORCE_PRIVATE),
    users,
    sessionSecret,
    sessionSecretEphemeral,
    sessionMaxAgeS: SESSION_MAX_AGE_S,
    cookieName: 'sus_session',
    cookieDomain,
    exportToken,
    loginRateLimit: { max: 10, windowMs: 10 * 60 * 1000 },
    writeRateLimit: { max: 300, windowMs: 5 * 60 * 1000 },
    accessLog: !parseBool(env.SUS_QUIET),
    warnings,
  };
}
