/** Issue M2-10: the Node-only file helpers behind the open and save dialogs. */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile, writeProjectFile } from '../../../app/main/project-files';

// Only `rename` is replaced, so a test can make it fail the way Windows does when another process holds the target open.
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return { ...real, rename: vi.fn(real.rename) };
});

const renameMock = vi.mocked(fsPromises.rename);
const realRename = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).rename;
const fail = (code: string) => Object.assign(new Error('busy'), { code });

let dir = '';
beforeEach(() => {
  renameMock.mockReset();
  renameMock.mockImplementation(realRename);
  dir = mkdtempSync(join(tmpdir(), 'view3d-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeProjectFile and readProjectFile', () => {
  it('round-trips text including Arabic, as UTF-8 without a BOM', async () => {
    const path = join(dir, 'shop.json');
    const text = '{\n  "name": "متجر الزاوية"\n}\n';
    expect(await writeProjectFile(path, text)).toEqual({ ok: true });
    expect(await readProjectFile(path)).toEqual({ ok: true, text });
    const bytes = readFileSync(path);
    expect(bytes[0]).toBe(0x7b);
    expect(bytes.equals(Buffer.from(text, 'utf8'))).toBe(true);
  });

  it('replaces an existing file and leaves no temporary file behind', async () => {
    const path = join(dir, 'shop.json');
    writeFileSync(path, 'old contents that are longer than the new ones');
    expect(await writeProjectFile(path, '{}\n')).toEqual({ ok: true });
    expect(readFileSync(path, 'utf8')).toBe('{}\n');
    expect(readdirSync(dir)).toEqual(['shop.json']);
  });

  it('reports a missing file instead of throwing', async () => {
    const result = await readProjectFile(join(dir, 'missing.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it('reports a missing folder on write instead of throwing', async () => {
    const result = await writeProjectFile(join(dir, 'no-such-folder', 'shop.json'), '{}\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('failure codes', () => {
  it('a failed read has the code read-failed and still a message', async () => {
    const result = await readProjectFile(join(dir, 'missing.json'));
    expect(result).toMatchObject({ ok: false, code: 'read-failed' });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it('a failed write has the code write-failed and still a message', async () => {
    const result = await writeProjectFile(join(dir, 'no-such-folder', 'shop.json'), '{}\n');
    expect(result).toMatchObject({ ok: false, code: 'write-failed' });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('a target that Windows holds open for a moment', () => {
  it('retries the rename after EPERM twice, then saves', async () => {
    const path = join(dir, 'shop.json');
    writeFileSync(path, 'old');
    renameMock.mockImplementationOnce(async () => { throw fail('EPERM'); });
    renameMock.mockImplementationOnce(async () => { throw fail('EPERM'); });
    expect(await writeProjectFile(path, '{"new":1}\n')).toEqual({ ok: true });
    expect(readFileSync(path, 'utf8')).toBe('{"new":1}\n');
    expect(renameMock).toHaveBeenCalledTimes(3);
    expect(readdirSync(dir)).toEqual(['shop.json']);
  });

  it('retries after EACCES once and EBUSY once, then saves', async () => {
    const path = join(dir, 'shop.json');
    writeFileSync(path, 'old');
    renameMock.mockImplementationOnce(async () => { throw fail('EACCES'); });
    renameMock.mockImplementationOnce(async () => { throw fail('EBUSY'); });
    expect(await writeProjectFile(path, '{"new":2}\n')).toEqual({ ok: true });
    expect(readFileSync(path, 'utf8')).toBe('{"new":2}\n');
    expect(renameMock).toHaveBeenCalledTimes(3);
    expect(readdirSync(dir)).toEqual(['shop.json']);
  });

  it('gives up after 10 tries, quickly, keeps the old file and leaves no temporary file', async () => {
    const path = join(dir, 'shop.json');
    writeFileSync(path, 'old bytes');
    renameMock.mockImplementation(async () => { throw fail('EPERM'); });
    const start = performance.now();
    const result = await writeProjectFile(path, '{"new":3}\n');
    const elapsed = performance.now() - start;
    expect(result).toMatchObject({ ok: false, code: 'write-failed' });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    expect(renameMock).toHaveBeenCalledTimes(10);
    expect(readFileSync(path, 'utf8')).toBe('old bytes');
    expect(readdirSync(dir)).toEqual(['shop.json']);
    expect(elapsed).toBeLessThan(3000);
  });

  it('does not retry any other error (ENOENT: one try)', async () => {
    const path = join(dir, 'shop.json');
    renameMock.mockImplementation(async () => { throw fail('ENOENT'); });
    expect(await writeProjectFile(path, '{}\n')).toMatchObject({ ok: false, code: 'write-failed' });
    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(readdirSync(dir)).toEqual([]);
  });
});
