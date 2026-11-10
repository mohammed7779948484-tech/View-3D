/** Issue M2-10: the Node-only file helpers behind the open and save dialogs. */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile, writeProjectFile } from '../../../app/main/project-files';

let dir = '';
beforeEach(() => {
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
