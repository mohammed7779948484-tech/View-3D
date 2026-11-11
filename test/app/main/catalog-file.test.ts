/** Issue M3-1: the Node-only catalog file helpers (`<userData>/catalog.json`). */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCatalogFile, saveCatalogFile } from '../../../app/main/catalog-file';
import { seedCatalog, serializeCatalog } from '../../../src/catalog/index';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'view3d-catalog-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const file = (): string => join(dir, 'catalog.json');

describe('loadCatalogFile', () => {
  it('with no file, writes the seed catalog and returns its text', async () => {
    const result = await loadCatalogFile(dir);
    const expected = serializeCatalog(seedCatalog());
    expect(result).toEqual({ status: 'loaded', text: expected });
    expect(readFileSync(file(), 'utf8')).toBe(expected);
  });

  it('returns an existing valid file byte for byte and leaves it untouched', async () => {
    const text = serializeCatalog({ schemaVersion: 1, products: seedCatalog().products.slice(0, 2) });
    writeFileSync(file(), text);
    const result = await loadCatalogFile(dir);
    expect(result).toEqual({ status: 'loaded', text });
    expect(readFileSync(file(), 'utf8')).toBe(text);
    expect(readdirSync(dir)).toEqual(['catalog.json']);
  });

  it('a corrupt file is reported as not-a-catalog and its bytes stay', async () => {
    writeFileSync(file(), '{oops');
    const result = await loadCatalogFile(dir);
    expect(result).toMatchObject({ status: 'failed', code: 'not-a-catalog' });
    if (result.status === 'failed') expect(result.message.length).toBeGreaterThan(0);
    expect(readFileSync(file()).equals(Buffer.from('{oops'))).toBe(true);
    expect(readdirSync(dir)).toEqual(['catalog.json']);
  });
});

describe('concurrent calls on one folder', () => {
  const seedText = (): string => serializeCatalog(seedCatalog());
  const seedMinusLast = (): string => {
    const smaller = seedCatalog();
    smaller.products.pop();
    return serializeCatalog(smaller);
  };

  it.each([2, 5])('%i concurrent first-start loads all load the seed and leave only catalog.json', async (count) => {
    const results = await Promise.all(Array.from({ length: count }, () => loadCatalogFile(dir)));
    const expected = seedText();
    for (const result of results) expect(result).toEqual({ status: 'loaded', text: expected });
    expect(readFileSync(file(), 'utf8')).toBe(expected);
    expect(readdirSync(dir)).toEqual(['catalog.json']);
  });

  it('two saves started together both succeed; the later call wins and no temp file stays', async () => {
    const a = seedText();
    const b = seedMinusLast();
    expect(a).not.toBe(b);
    const [first, second] = await Promise.all([saveCatalogFile(dir, a), saveCatalogFile(dir, b)]);
    expect(first).toEqual({ status: 'saved' });
    expect(second).toEqual({ status: 'saved' });
    expect(readFileSync(file(), 'utf8')).toBe(b);
    expect(readdirSync(dir)).toEqual(['catalog.json']);
  });

  it('a load and a save started together on an empty folder neither fail', async () => {
    const b = seedMinusLast();
    const [loaded, saved] = await Promise.all([loadCatalogFile(dir), saveCatalogFile(dir, b)]);
    expect(loaded.status).toBe('loaded');
    expect(saved).toEqual({ status: 'saved' });
    expect(readdirSync(dir)).toEqual(['catalog.json']);
  });
});

describe('saveCatalogFile', () => {
  it('writes a valid catalog text exactly and leaves no temp file', async () => {
    const added = seedCatalog();
    added.products.pop();
    const text = serializeCatalog(added);
    writeFileSync(file(), 'old contents');
    expect(await saveCatalogFile(dir, text)).toEqual({ status: 'saved' });
    expect(readFileSync(file(), 'utf8')).toBe(text);
    expect(readdirSync(dir)).toEqual(['catalog.json']);
  });

  it('refuses an invalid text and the existing file keeps its bytes', async () => {
    const good = serializeCatalog(seedCatalog());
    writeFileSync(file(), good);
    const result = await saveCatalogFile(dir, '{"schemaVersion":1}');
    expect(result).toMatchObject({ status: 'failed', code: 'not-a-catalog' });
    if (result.status === 'failed') expect(result.message.length).toBeGreaterThan(0);
    expect(readFileSync(file(), 'utf8')).toBe(good);
    expect(readdirSync(dir)).toEqual(['catalog.json']);
  });

  it('refuses text that is not JSON', async () => {
    const result = await saveCatalogFile(dir, 'nope');
    expect(result).toMatchObject({ status: 'failed', code: 'not-a-catalog' });
    expect(readdirSync(dir)).toEqual([]);
  });
});

