/**
 * Output guard for the layout engine split (M3 issue 10a): same input, same output, byte for byte.
 *
 * ORACLE: by design the expected values are today's output of the engine, recorded before the
 * refactor. That is the requirement itself ("same output, byte for byte"), so recording it is
 * correct here. Each request's full JSON output is hashed (SHA-256) and its length kept.
 *
 * Determinism: JSON.stringify output of the same engine on Node 22 is identical on Linux and
 * Windows (CI runs both). If Windows ever differs, that is a finding, not something to loosen.
 *
 * An intended output change: run `pnpm snapshots:update`, then review a before/after gallery.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoLayout } from '../../src/layout/index';
import type { LayoutRequest } from '../../src/layout/index';
import { angledEntrance, benchmark, scenarios, wallsFull } from './scenarios';

const GOLDEN = resolve(import.meta.dirname, 'golden-hashes.json');

const requests: readonly LayoutRequest[] = [...scenarios, angledEntrance, wallsFull, benchmark];

type Entry = { sha256: string; length: number };

describe('layout engine golden output', () => {
  it('has 7 requests with unique ids', () => {
    const ids = requests.map((r) => r.id);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every request produces byte-identical output to the recorded hash', { timeout: 120_000 }, () => {
    const actual: Record<string, Entry> = {};
    for (const request of requests) {
      const text = JSON.stringify(autoLayout(request));
      actual[request.id] = { sha256: createHash('sha256').update(text, 'utf8').digest('hex'), length: text.length };
    }
    if (process.env['UPDATE_SNAPSHOTS'] === '1') {
      writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    if (!existsSync(GOLDEN)) throw new Error(`Missing ${GOLDEN}. Generate it with: pnpm snapshots:update`);
    const expected = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Entry>;
    expect(Object.keys(actual), 'the set of golden scenarios changed').toEqual(Object.keys(expected));
    for (const [id, entry] of Object.entries(actual)) {
      expect(
        entry,
        `layout output of scenario "${id}" changed. If the change is intended, run "pnpm snapshots:update" and review a before/after gallery.`,
      ).toEqual(expected[id]);
    }
  });
});
