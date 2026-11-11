/** Issue M2-11: the owner's real RoomTrace export, read into a room. Values are hand-computed (um). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateRoom } from '../../src/rules/index';
import { importRoomTrace } from '../../src/import-scan/index';
import type { ScanImportResult } from '../../src/import-scan/index';

type Pt = { x: number; y: number };
type SampleWall = { id: string; startPoint: Pt; endPoint: Pt };
type Sample = { rooms: { walls: SampleWall[] }[] };

const SAMPLE_PATH = resolve(import.meta.dirname, '../fixtures/scans/roomtrace-sample.json');
const sampleText = readFileSync(SAMPLE_PATH, 'utf8');
const WINDOW_ID = 'A8779B7A-0783-448F-ABCE-A51AA5C11FCB';

const EXPECTED_CORNERS = [
  { x: 0, y: 0 },
  { x: 4436121, y: 0 },
  { x: 4436121, y: 3163824 },
  { x: 3636733, y: 3025436 },
  { x: 2831120, y: 3025437 },
  { x: 2362624, y: 3075643 },
  { x: 0, y: 3291713 },
];

function ok(result: ScanImportResult) {
  if (!result.ok) throw new Error(`expected a room, got errors: ${JSON.stringify(result.errors)}`);
  return result;
}

describe('the owner sample (RoomTrace schema v2)', () => {
  const result = ok(importRoomTrace(JSON.parse(sampleText)));

  it('has seven corners, corner 1 at the origin and wall 1 along +x', () => {
    expect(result.room.outline).toHaveLength(7);
    result.room.outline.forEach((p, i) => {
      expect(Number.isInteger(p.x) && Number.isInteger(p.y), `corner ${i + 1} is whole um`).toBe(true);
      expect(Math.abs(p.x - EXPECTED_CORNERS[i]!.x), `corner ${i + 1} x`).toBeLessThanOrEqual(2);
      expect(Math.abs(p.y - EXPECTED_CORNERS[i]!.y), `corner ${i + 1} y`).toBeLessThanOrEqual(2);
    });
    expect(result.room.outline[0]).toEqual({ x: 0, y: 0 });
    expect(result.room.outline[1]!.y).toBe(0);
  });

  it('takes the ceiling from the room height, with no columns and no openings', () => {
    expect(result.room.ceilingHeightUm).toBe(2_256_000);
    expect(result.room.columns).toEqual([]);
    expect(result.room.openings).toEqual([]);
  });

  it('reports the findings in the fixed order', () => {
    expect(result.findings.map((f) => f.code)).toEqual(['gap-filled', 'gap-filled', 'window-sill-unknown', 'no-doors', 'axes-assumed']);
    for (const f of result.findings) expect(f.message.length, f.code).toBeGreaterThan(0);
  });

  it('names the two filled gaps by wall and size', () => {
    const [a, b] = result.findings;
    if (a?.code !== 'gap-filled' || b?.code !== 'gap-filled') throw new Error('expected two gap-filled findings first');
    expect(a.wallIndex).toBe(2);
    expect(Math.abs(a.sizeUm - 811_278)).toBeLessThanOrEqual(2);
    expect(b.wallIndex).toBe(4);
    expect(Math.abs(b.sizeUm - 471_179)).toBeLessThanOrEqual(2);
  });

  it('the gap sizes agree with a direct measurement of the file (independent of the expected numbers)', () => {
    const file = JSON.parse(sampleText) as Sample;
    const byPrefix = (p: string): SampleWall => file.rooms[0]!.walls.find((w) => w.id.startsWith(p))!;
    const dist = (a: Pt, b: Pt): number => Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 1e6);
    const first = dist(byPrefix('E91A95F6').endPoint, byPrefix('06BD805C').startPoint);
    const second = dist(byPrefix('06BD805C').endPoint, byPrefix('8B3D2484').startPoint);
    const sizes = result.findings.flatMap((f) => (f.code === 'gap-filled' ? [f.sizeUm] : []));
    expect(Math.abs(sizes[0]! - first)).toBeLessThanOrEqual(2);
    expect(Math.abs(sizes[1]! - second)).toBeLessThanOrEqual(2);
  });

  it('holds the window back until the sill is known', () => {
    const w = result.findings.find((f) => f.code === 'window-sill-unknown');
    expect(w).toMatchObject({ code: 'window-sill-unknown', windowId: WINDOW_ID, wallIndex: 1 });
    expect(result.pendingWindows).toHaveLength(1);
    const p = result.pendingWindows[0]!;
    expect(p.id).toBe(WINDOW_ID);
    expect(p.wallIndex).toBe(1);
    expect(Math.abs(p.offsetUm - 614_403)).toBeLessThanOrEqual(2);
    expect(p.widthUm).toBe(1_970_328);
    expect(p.heightUm).toBe(1_293_709);
  });

  it('is a sound room except that nothing marks an entrance', () => {
    expect(validateRoom(result.room).map((p) => p.code)).toEqual(['no-entrance']);
  });

  it('does not change its input', () => {
    const input = JSON.parse(sampleText) as unknown;
    importRoomTrace(input);
    expect(input).toEqual(JSON.parse(sampleText));
  });

  it('gives the same result twice', () => {
    expect(importRoomTrace(JSON.parse(sampleText))).toEqual(result);
  });
});
