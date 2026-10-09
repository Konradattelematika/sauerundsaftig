/** Test-Helfer: Fixture-Pfade, Konfiguration, Server mit verstellbarer Uhr, roher HTTP-Client. */
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../../server/lib/auth.mjs';
import { loadConfig } from '../../server/lib/config.mjs';
import { startServer } from '../../server/lib/app.mjs';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const SITE = path.join(FIXTURES, 'site');
export const SEED = path.join(FIXTURES, 'seed', 'checklist.json');

export const silentLog = { info() {}, warn() {}, error() {}, log() {} };

export const PASSWORDS = { konrad: 'kruste-und-krume-42', josie: 'sauerteig-mag-zeit-7' };
// Schnelle Test-Hashes (N klein) — das Format ist dasselbe wie in Produktion.
export async function testUsers() {
  return [
    { id: 'konrad', name: 'Konrad', role: 'team', hash: await hashPassword(PASSWORDS.konrad, { N: 1024 }) },
    { id: 'josie', name: 'Josie', role: 'inhaberin', hash: await hashPassword(PASSWORDS.josie, { N: 1024 }) },
  ];
}

export const BEFORE_GO_LIVE = new Date('2026-10-08T10:00:00Z');
export const AFTER_GO_LIVE = new Date('2026-10-19T14:00:00Z');
export const EXPORT_TOKEN = 'export-token-fuer-tests-0123456789';

export async function makeConfig(extraEnv = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sus-test-'));
  const config = loadConfig({
    SUS_USERS: JSON.stringify(await testUsers()),
    SUS_SESSION_SECRET: 'test-secret-'.padEnd(48, 'x'),
    SUS_EXPORT_TOKEN: EXPORT_TOKEN,
    SUS_DIST_DIR: SITE,
    SUS_DATA_DIR: dataDir,
    SUS_SEED_FILE: SEED,
    SUS_QUIET: '1',
    ...extraEnv,
  });
  return config;
}

/** Startet einen Server auf einem freien Port; clock.set() verstellt die Uhr. */
export async function startTestServer(extraEnv = {}, { config: givenConfig, start = BEFORE_GO_LIVE } = {}) {
  const config = givenConfig ?? (await makeConfig(extraEnv));
  let current = new Date(start);
  const clock = {
    now: () => new Date(current),
    set: (d) => {
      current = new Date(d);
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
  const srv = await startServer(config, { now: clock.now, log: silentLog, port: 0, host: '127.0.0.1' });
  return {
    ...srv,
    config,
    clock,
    async stop({ keepData = false } = {}) {
      await srv.close();
      if (!keepData) await rm(config.dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Roher HTTP-Request (fetch erlaubt keinen Host-Header).
 * @returns {Promise<{ status: number, headers: Record<string, string|string[]>, body: Buffer, text: string, json: any }>}
 */
export function request(port, { method = 'GET', path: p = '/', host = 'localhost', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: p,
        headers: {
          Host: host,
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...headers,
        },
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: buf, text, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Login per Formular-POST → Cookie-Header-Wert (name=wert) */
export async function login(port, { host = 'localhost', user = 'konrad', password = PASSWORDS[user], ip = '10.0.0.1', next } = {}) {
  const form = new URLSearchParams({ user, password, ...(next ? { next } : {}) }).toString();
  const res = await request(port, {
    method: 'POST',
    path: '/login',
    host,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip },
    body: form,
  });
  const setCookie = [res.headers['set-cookie'] ?? []].flat();
  const cookie = setCookie[0]?.split(';')[0];
  return { res, cookie, setCookie };
}

export function jsonHeaders(cookie, extra = {}) {
  return { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra };
}
