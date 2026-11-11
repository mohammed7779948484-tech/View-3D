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

