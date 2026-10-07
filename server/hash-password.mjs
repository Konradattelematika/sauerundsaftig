#!/usr/bin/env node
/**
 * Passwort-Hash für SUS_USERS erzeugen.
 *   node server/hash-password.mjs 'geheim'
 *   printf '%s' 'geheim' | node server/hash-password.mjs
 * Ausgabe: scrypt$N$r$p$saltB64$hashB64
 */
import { hashPassword } from './lib/auth.mjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

let password = process.argv[2];
if (password === undefined) {
  if (process.stdin.isTTY) {
    console.error("Aufruf: node server/hash-password.mjs <passwort>   (oder Passwort per stdin)");
    process.exit(2);
  }
  password = await readStdin();
}
if (!password) {
  console.error('Leeres Passwort.');
  process.exit(2);
}
if (password.length < 10) console.error('Hinweis: Passwort ist kürzer als 10 Zeichen.');
console.log(await hashPassword(password));
