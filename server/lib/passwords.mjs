/**
 * Selbst gesetzte Passwörter (Seite /passwort). Sie überschreiben den Hash aus SUS_USERS,
 * solange dieser Env-Hash unverändert ist — ein neuer Hash in Coolify setzt das Passwort
 * also wieder zurück (Admin-Reset, falls jemand sein Passwort vergisst).
 *
 * Datei: <dataDir>/passwords.json  →  { "<userId>": { "hash", "base", "changedAt" } }
 * `base` = Kurz-Fingerabdruck des Env-Hashes zum Zeitpunkt der Änderung.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './store.mjs';

export function envHashBase(envHash) {
  return createHash('sha256').update(String(envHash)).digest('base64url').slice(0, 22);
}

export class PasswordOverrides {
  /** @param {{ dataDir: string, users: { id: string, hash: string }[], now?: () => Date, log?: Console }} opts */
  constructor({ dataDir, users, now = () => new Date(), log = console }) {
    this.file = path.join(dataDir, 'passwords.json');
    this.users = users;
    this.envHashes = new Map(users.map((u) => [u.id, u.hash]));
    this.now = now;
    this.log = log;
    this.data = {};
    this.queue = Promise.resolve();
  }

  async init() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      if (err?.code !== 'ENOENT') this.log.warn(`[passwort] ${this.file} unlesbar, Env-Passwörter gelten: ${err?.message ?? err}`);
      this.data = {};
    }
    this.apply();
    return this;
  }

  /** Wirksamen Hash je Benutzer setzen (mutiert die Benutzer-Objekte aus der Config). */
  apply() {
    for (const user of this.users) {
      const envHash = this.envHashes.get(user.id);
      const override = this.data[user.id];
      const valid = override && typeof override.hash === 'string' && override.base === envHashBase(envHash);
      user.hash = valid ? override.hash : envHash;
    }
  }

  /** Neuen Hash für einen Benutzer dauerhaft speichern und sofort wirksam machen. */
  async set(userId, hash) {
    const envHash = this.envHashes.get(userId);
    if (!envHash) throw new Error(`Unbekannter Benutzer: ${userId}`);
    // Serialisiert: jede Änderung baut auf dem zuletzt geschriebenen Stand auf
    const write = this.queue.then(async () => {
      const next = { ...this.data, [userId]: { hash, base: envHashBase(envHash), changedAt: this.now().toISOString() } };
      await writeFileAtomic(this.file, JSON.stringify(next, null, 2));
      this.data = next;
      this.apply();
    });
    this.queue = write.catch(() => {});
    await write;
  }
}
