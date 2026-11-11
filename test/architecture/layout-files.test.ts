/**
 * M3 issue 10a: src/layout is split by phase, no file grows past 400 lines, and the public
 * runtime API of src/layout/index.ts is unchanged (docs/ARCHITECTURE.md section 7: index.ts only
 * re-exports).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as layout from '../../src/layout/index';

const ROOT = resolve(import.meta.dirname, '../..');
const LAYOUT = join(ROOT, 'src/layout');
const MAX_LINES = 400;

const lf = (text: string): string => text.replace(/\r\n/g, '\n');
/** Lines of text: a trailing newline does not add a line. */
export function countLines(text: string): number {
  const t = lf(text);
  if (t === '') return 0;
  return (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n').length;
}

describe('countLines (helper)', () => {
  it('counts a file ending in a newline by its lines of text', () => {
    expect(countLines('a\nb\nc\n')).toBe(3);
    expect(countLines('a\nb\nc')).toBe(3);
  });
  it('treats CRLF like LF', () => {
    expect(countLines('a\r\nb\r\nc\r\n')).toBe(3);
  });
});

describe('src/layout files', () => {
  it('has no engine.ts', () => {
    expect(existsSync(join(LAYOUT, 'engine.ts')), 'src/layout/engine.ts must not exist').toBe(false);
  });

  for (const name of ['types', 'cash-wrap', 'walls', 'island-grid', 'search', 'score', 'report', 'index']) {
    it(`has ${name}.ts`, () => {
      expect(existsSync(join(LAYOUT, `${name}.ts`)), `src/layout/${name}.ts must exist`).toBe(true);
    });
  }

  it(`keeps every .ts file at ${MAX_LINES} lines or fewer`, () => {
    const tooLong = readdirSync(LAYOUT, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ts'))
      .map((e) => ({ name: e.name, lines: countLines(readFileSync(join(LAYOUT, e.name), 'utf8')) }))
      .filter((f) => f.lines > MAX_LINES)
      .map((f) => `src/layout/${f.name} has ${f.lines} lines (max ${MAX_LINES})`);
    expect(tooLong).toEqual([]);
  });

  it('index.ts only re-exports', () => {
    const file = join(LAYOUT, 'index.ts');
    expect(existsSync(file)).toBe(true);
    const offending = lf(readFileSync(file, 'utf8'))
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*') && !l.startsWith('*/'))
      .filter((l) => !l.startsWith('export '));
    expect(offending, 'src/layout/index.ts may contain only export lines').toEqual([]);
  });
});

describe('src/layout public runtime API', () => {
  it('exports the functions autoLayout and describeObstacles', () => {
    expect(typeof layout.autoLayout).toBe('function');
    expect(typeof layout.describeObstacles).toBe('function');
  });

  it('exports SCORE_WEIGHTS with the planned keys and values', () => {
    expect({ ...layout.SCORE_WEIGHTS }).toEqual({
      placed: 45,
      counterNear: 12,
      counterFacing: 8,
      showcasesNear: 10,
      rows: 10,
      evenUse: 10,
      openEntrance: 5,
    });
    expect(Object.keys(layout.SCORE_WEIGHTS)).toEqual([
      'placed', 'counterNear', 'counterFacing', 'showcasesNear', 'rows', 'evenUse', 'openEntrance',
    ]);
  });
});
