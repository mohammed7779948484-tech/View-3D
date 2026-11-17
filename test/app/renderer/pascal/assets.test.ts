/** Phase 1 of docs/decisions/0008: only asset files whose licence is verified (Pascal's MIT repository files) are bundled. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(import.meta.dirname, '../../../../app/renderer/public');

function list(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(resolve(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

describe('app/renderer/public', () => {
  const files = list(PUBLIC);

  it('holds only cursor.svg, LICENSE-pascal.txt, icons/ and audios/', () => {
    const stray = files.filter((f) => f !== 'cursor.svg' && f !== 'LICENSE-pascal.txt' && !f.startsWith('icons/') && !f.startsWith('audios/'));
    expect(stray).toEqual([]);
  });

  it('has no material/ folder (no texture files without a verified licence)', () => {
    expect(files.filter((f) => f.startsWith('material/'))).toEqual([]);
  });

  it('keeps Pascal\'s MIT licence text', () => {
    const file = resolve(PUBLIC, 'LICENSE-pascal.txt');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('MIT License');
    expect(text).toContain('Pascal Group Inc.');
  });
});
