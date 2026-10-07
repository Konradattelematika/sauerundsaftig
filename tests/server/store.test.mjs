import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeSeed } from '../../server/lib/model.mjs';
import { Store, readSeedItems } from '../../server/lib/store.mjs';
import { SEED, silentLog } from './helpers.mjs';

const T0 = '2026-10-07T08:00:00.000Z';
const T1 = '2026-10-08T09:00:00.000Z';

describe('mergeSeed (Regeln §2.6)', () => {
  const seed = [
    { id: 'a', title: 'A', phase: 'vor', owner: 'team' },
    { id: 'b', title: 'B', phase: 'nach', owner: 'josie', priority: 'blocker' },
  ];
  it('ergänzt fehlende Items mit Zeitstempeln und updatedBy=seed', () => {
    const { state, added, updated } = mergeSeed({ items: [], comments: [] }, seed, T0);
    expect(added).toEqual(['a', 'b']);
    expect(updated).toEqual([]);
    expect(state.items[0]).toMatchObject({
      id: 'a',
      title: 'A',
      description: '',
      status: 'offen',
      priority: 'normal',
      category: 'allgemein',
      createdAt: T0,
      updatedAt: T0,
      updatedBy: 'seed',
    });
  });
  it('aktualisiert nur unberührte Seed-Items, und nur bei Änderung', () => {
    const first = mergeSeed({ items: [], comments: [] }, seed, T0).state;
    first.items[1] = { ...first.items[1], status: 'erledigt', updatedBy: 'konrad', updatedAt: T0 };
    const changedSeed = [
      { id: 'a', title: 'A neu', phase: 'vor', owner: 'team' },
      { id: 'b', title: 'B neu', phase: 'nach', owner: 'josie' },
    ];
    const { state, added, updated } = mergeSeed(first, changedSeed, T1);
    expect(added).toEqual([]);
    expect(updated).toEqual(['a']);
    expect(state.items[0]).toMatchObject({ title: 'A neu', createdAt: T0, updatedAt: T1, updatedBy: 'seed' });
    expect(state.items[1]).toMatchObject({ title: 'B', status: 'erledigt', updatedBy: 'konrad' });
    // unverändert erneut mergen → nichts zu tun
    expect(mergeSeed(state, changedSeed, T1).updated).toEqual([]);
  });
  it('ignoriert kaputte und doppelte Seed-Einträge', () => {
    const { added } = mergeSeed({ items: [], comments: [] }, [{ id: 'x' }, { title: 'ohne id' }, { id: 'ok', title: 'Ok' }, { id: 'ok', title: 'Nochmal' }], T0);
    expect(added).toEqual(['ok']);
  });
});

describe('Store', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'sus-store-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('fehlende Seed-Datei → leere Liste, keine Datei geschrieben', async () => {
    expect(await readSeedItems(path.join(dir, 'gibtsnicht.json'), silentLog)).toEqual([]);
    const store = await new Store({ dataDir: dir, seedFile: path.join(dir, 'gibtsnicht.json'), log: silentLog }).init();
    expect(store.checklist).toEqual({ items: [], comments: [] });
    expect(await readdir(dir)).toEqual([]);
  });

  it('kaputte Seed-Datei → ignoriert', async () => {
    const f = path.join(dir, 'seed.json');
    await writeFile(f, '{ kaputt');
    expect(await readSeedItems(f, silentLog)).toEqual([]);
    await writeFile(f, '{"items": 5}');
    expect(await readSeedItems(f, silentLog)).toEqual([]);
  });

  it('Seed-Merge beim Start, Audit, Neustart ohne erneutes Schreiben', async () => {
    let now = new Date(T0);
    const opts = { dataDir: dir, seedFile: SEED, now: () => now, log: silentLog };
    const s1 = await new Store(opts).init();
    expect(s1.checklist.items.map((i) => i.id)).toEqual(['dns-www', 'fotos-josie']);
    const events = (await readFile(path.join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ user: 'seed', action: 'seed.merge', added: ['dns-www', 'fotos-josie'] });

    // Mensch ändert einen Punkt
    await s1.update('checklist', (d) => {
      d.items[0].status = 'erledigt';
      d.items[0].updatedBy = 'konrad';
      return { result: null, event: { user: 'konrad', action: 'test' } };
    });
    now = new Date(T1);
    const s2 = await new Store(opts).init();
    expect(s2.checklist.items[0]).toMatchObject({ status: 'erledigt', updatedBy: 'konrad' });
    expect(s2.checklist.items[1].updatedAt).toBe(T0);
    const lines = (await readFile(path.join(dir, 'events.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('serialisierte, atomare Schreibvorgänge (keine verlorenen Updates, keine tmp-Reste)', async () => {
    const store = await new Store({ dataDir: dir, log: silentLog }).init();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        store.update('module', (d) => {
          d.votes.push({ i });
          return { result: i, event: { user: 'test', action: 'push', i } };
        }),
      ),
    );
    const onDisk = JSON.parse(await readFile(path.join(dir, 'module.json'), 'utf8'));
    expect(onDisk.votes).toHaveLength(25);
    expect(onDisk.votes.map((v) => v.i)).toEqual([...Array(25).keys()]);
    expect((await readdir(dir)).sort()).toEqual(['events.jsonl', 'module.json']);
  });

  it('Fehler im Mutator ändert nichts und blockiert die Queue nicht', async () => {
    const store = await new Store({ dataDir: dir, log: silentLog }).init();
    await expect(
      store.update('checklist', (d) => {
        d.items.push({ id: 'halb' });
        throw new Error('nein');
      }),
    ).rejects.toThrow('nein');
    expect(store.checklist.items).toEqual([]);
    await store.update('checklist', (d) => {
      d.items.push({ id: 'ganz' });
      return { result: null };
    });
    expect(store.checklist.items.map((i) => i.id)).toEqual(['ganz']);
  });

  it('kaputte Datendatei wird gesichert statt überschrieben', async () => {
    await writeFile(path.join(dir, 'checklist.json'), '{ nicht json');
    const store = await new Store({ dataDir: dir, log: silentLog }).init();
    expect(store.checklist).toEqual({ items: [], comments: [] });
    const files = await readdir(dir);
    expect(files.some((f) => f.startsWith('checklist.json.kaputt-'))).toBe(true);
  });
});
