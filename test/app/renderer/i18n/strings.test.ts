/** Issue M2-9: every string has an Arabic twin, and every key the code uses exists. */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');
const RENDERER = join(ROOT, 'app/renderer');
const I18N = join(RENDERER, 'i18n');

type Tree = { [key: string]: string | Tree };

function load(file: string): Tree {
  const path = join(I18N, file);
  if (!existsSync(path)) throw new Error(`${path} does not exist yet`);
  return JSON.parse(readFileSync(path, 'utf8')) as Tree;
}

function flatten(tree: Tree, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    if (typeof v === 'object' && v !== null) for (const [p, leaf] of flatten(v, path)) out.set(p, leaf);
    else out.set(path, v);
  }
  return out;
}

const placeholders = (s: string): string[] => [...new Set([...s.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]!))].sort();

const en = flatten(load('en.json'));

describe('en.json and ar.json', () => {
  it('have exactly the same keys', () => {
    const ar = flatten(load('ar.json'));
    expect([...ar.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it('have no empty value and no value that is not text', () => {
    for (const file of ['en.json', 'ar.json']) {
      for (const [key, value] of flatten(load(file))) {
        expect(typeof value, `${file} ${key}`).toBe('string');
        expect((value as string).trim().length, `${file} ${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('use the same {{placeholders}} for every key', () => {
    const ar = flatten(load('ar.json'));
    for (const [key, value] of en) {
      const twin = ar.get(key);
      expect(typeof twin, `ar.json is missing ${key}`).toBe('string');
      expect(placeholders(twin as string), `placeholders of ${key}`).toEqual(placeholders(value as string));
    }
  });

  it('write digits 0-9 in Arabic too, never Eastern Arabic digits (owner ruling)', () => {
    for (const [key, value] of flatten(load('ar.json'))) {
      expect(/[٠-٩]/.test(value as string), `ar.json ${key} has an Eastern Arabic digit`).toBe(false);
    }
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('every key the renderer uses exists in en.json', () => {
  it('finds the t() calls with a literal key and resolves each one', () => {
    const used = new Map<string, string>(); // key -> first file
    for (const file of sourceFiles(RENDERER)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*(['"`])([^'"`]+)\1/g)) {
        const key = m[2]!;
        if (key.includes('${')) continue;
        if (!used.has(key)) used.set(key, file);
      }
    }
    expect(used.size, 'the scan found no t() call at all').toBeGreaterThan(20);
    for (const [key, file] of used) {
      expect(typeof en.get(key), `${key} (used in ${file}) is not a string in en.json`).toBe('string');
    }
  });

  it('has the keys the code builds from error codes', () => {
    const room = readFileSync(join(ROOT, 'src/rules/room.ts'), 'utf8');
    const union = /export type RoomProblemCode =([^;]*);/.exec(room)?.[1] ?? '';
    const own = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
    expect(own).toEqual(expect.arrayContaining(['opening-wall-missing', 'opening-off-wall', 'openings-overlap', 'opening-above-ceiling', 'column-outside-room', 'no-entrance']));
    const roomCodes = [
      'too-few-vertices', 'non-integer-coordinate', 'coordinate-out-of-range', 'zero-length-edge', 'self-intersection', 'clockwise',
      'opening-wall-missing', 'opening-off-wall', 'openings-overlap', 'opening-above-ceiling', 'column-outside-room', 'no-entrance',
    ];
    const wanted = [
      ...roomCodes.map((c) => `problems.${c}`),
      ...['empty', 'not-a-number', 'unknown-unit', 'not-positive', 'too-large', 'use-a-point', 'out-of-range'].map((c) => `input.${c}`),
      ...['too-few-walls', 'wall-length-not-positive', 'not-an-integer', 'corner-angle-out-of-range'].map((c) => `capture.${c}`),
      ...['wall-very-short', 'wall-very-long', 'corner-very-sharp'].map((c) => `warnings.${c}`),
    ];
    for (const key of wanted) expect(typeof en.get(key), `en.json has no ${key}`).toBe('string');
  });
});
