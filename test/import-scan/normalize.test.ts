/**
 * Issue M2-11: messy scans, normalized. Every scan here is synthetic test data in the RoomTrace
 * shape (metres), built by hand. Expected values are worked out by hand, in um.
 */
import { describe, expect, it } from 'vitest';
import { importRoomTrace } from '../../src/import-scan/index';
import type { ScanFinding, ScanImportResult } from '../../src/import-scan/index';

type Pt = [number, number];
type WallSpec = { id: string; from: Pt; to: Pt; height?: number };
type WindowSpec = { id: string; at: Pt; width: number; height: number };

const point = ([x, y]: Pt, id: string) => ({ id, x, y });
function scan(
  walls: WallSpec[],
  opts: { height?: number | null; windows?: WindowSpec[]; doors?: unknown[] } = {},
): Record<string, unknown> {
  const room: Record<string, unknown> = {
    id: 'room-1',
    name: 'Synthetic',
    doors: opts.doors ?? [],
    windows: (opts.windows ?? []).map((w) => ({ id: w.id, centerPoint: point(w.at, `${w.id}-c`), width: w.width, height: w.height })),
    walls: walls.map((w) => ({
      id: w.id,
      height: w.height ?? 2.6,
      length: Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]),
      startPoint: point(w.from, `${w.id}-s`),
      endPoint: point(w.to, `${w.id}-e`),
    })),
  };
  if (opts.height !== null) room['height'] = opts.height ?? 2.6;
  return { schemaVersion: 2, units: { length: 'm', area: 'm²', volume: 'm³' }, rooms: [room] };
}

const RECT: WallSpec[] = [
  { id: 'bottom', from: [0, 0], to: [5, 0] },
  { id: 'right', from: [5, 0], to: [5, 4] },
  { id: 'top', from: [5, 4], to: [0, 4] },
  { id: 'left', from: [0, 4], to: [0, 0] },
];
const RECT_OUTLINE = [
  { x: 0, y: 0 },
  { x: 5_000_000, y: 0 },
  { x: 5_000_000, y: 4_000_000 },
  { x: 0, y: 4_000_000 },
];

function ok(result: ScanImportResult) {
  if (!result.ok) throw new Error(`expected a room, got errors: ${JSON.stringify(result.errors)}`);
  return result;
}
const codes = (fs: ScanFinding[]): string[] => fs.map((f) => f.code);
function near(actual: { x: number; y: number }[], expected: { x: number; y: number }[], tol = 2): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((p, i) => {
    expect(Math.abs(p.x - expected[i]!.x), `corner ${i + 1} x`).toBeLessThanOrEqual(tol);
    expect(Math.abs(p.y - expected[i]!.y), `corner ${i + 1} y`).toBeLessThanOrEqual(tol);
  });
}

describe('a clean rectangle', () => {
  it('walls out of order and one stored backwards still give the exact outline', () => {
    // Order top, left, bottom, right; the top wall is stored from (0,4) to (5,4), against the walk.
    const walls: WallSpec[] = [
      { id: 'w-top', from: [0, 4], to: [5, 4] },
      { id: 'w-left', from: [0, 4], to: [0, 0] },
      { id: 'w-bottom', from: [0, 0], to: [5, 0] },
      { id: 'w-right', from: [5, 0], to: [5, 4] },
    ];
    const r = ok(importRoomTrace(scan(walls)));
    expect(r.room.outline).toEqual(RECT_OUTLINE);
    expect(r.room.ceilingHeightUm).toBe(2_600_000);
    expect(r.room.columns).toEqual([]);
    expect(r.room.openings).toEqual([]);
    expect(r.pendingWindows).toEqual([]);
    expect(codes(r.findings)).toEqual(['no-doors', 'axes-assumed']);
    for (const f of r.findings) expect(f.message.length).toBeGreaterThan(0);
  });
});

describe('gaps', () => {
  it('a 3 mm gap is closed at its midpoint', () => {
    const walls = RECT.map((w) => (w.id === 'bottom' ? { ...w, to: [4.997, 0] as Pt } : w));
    const r = ok(importRoomTrace(scan(walls)));
    expect(r.room.outline).toEqual([
      { x: 0, y: 0 },
      { x: 4_998_500, y: 0 },
      { x: 5_000_000, y: 4_000_000 },
      { x: 0, y: 4_000_000 },
    ]);
    expect(codes(r.findings)).toEqual(['gap-closed', 'no-doors', 'axes-assumed']);
    // The wall whose end was moved is the bottom wall: outline wall 0.
    expect(r.findings[0]).toMatchObject({ code: 'gap-closed', wallIndex: 0, sizeUm: 3000 });
  });

  it('a 470 mm gap becomes its own wall: a possible doorway', () => {
    const walls: WallSpec[] = [
      { id: 'bottom', from: [0, 0], to: [5, 0] },
      { id: 'right', from: [5, 0], to: [5, 4] },
      { id: 'top', from: [4.53, 4], to: [0, 4] },
      { id: 'left', from: [0, 4], to: [0, 0] },
    ];
    const r = ok(importRoomTrace(scan(walls)));
    expect(r.room.outline).toEqual([
      { x: 0, y: 0 },
      { x: 5_000_000, y: 0 },
      { x: 5_000_000, y: 4_000_000 },
      { x: 4_530_000, y: 4_000_000 },
      { x: 0, y: 4_000_000 },
    ]);
    expect(codes(r.findings)).toEqual(['gap-filled', 'no-doors', 'axes-assumed']);
    // The new wall is outline wall 2, from (5,4) to (4.53,4).
    expect(r.findings[0]).toMatchObject({ code: 'gap-filled', wallIndex: 2, sizeUm: 470_000 });
  });
});

describe('windows', () => {
  const windows: WindowSpec[] = [
    { id: 'w-inside', at: [4.5, 2], width: 1, height: 1.2 }, // 0.5 m from the right wall, not on any wall
    { id: 'w-right', at: [5, 2], width: 1, height: 1.2 },
  ];

  it('a window away from every wall is left out; one on a wall waits for its sill', () => {
    const r = ok(importRoomTrace(scan(RECT, { windows })));
    expect(r.room.openings).toEqual([]);
    expect(r.pendingWindows).toEqual([{ id: 'w-right', wallIndex: 1, offsetUm: 1_500_000, widthUm: 1_000_000, heightUm: 1_200_000 }]);
    const off = r.findings.find((f) => f.code === 'window-not-on-wall');
    if (off?.code !== 'window-not-on-wall') throw new Error('no window-not-on-wall finding');
    expect(off.windowId).toBe('w-inside');
    expect(Math.abs(off.distanceUm - 500_000)).toBeLessThanOrEqual(2);
    expect(r.findings.find((f) => f.code === 'window-sill-unknown')).toMatchObject({ windowId: 'w-right', wallIndex: 1 });
  });

  it('window findings come after gap findings and before the door finding, sorted by window id', () => {
    const r = ok(importRoomTrace(scan(RECT, { windows })));
    expect(codes(r.findings)).toEqual(['window-not-on-wall', 'window-sill-unknown', 'no-doors', 'axes-assumed']);
  });
});

describe('a turned scan', () => {
  const turn = (deg: number): WallSpec[] => {
    const a = (deg * Math.PI) / 180;
    const rot = ([x, y]: Pt): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    return RECT.map((w) => ({ ...w, from: rot(w.from), to: rot(w.to) }));
  };

  it('turned 30 degrees clockwise (corner 1 stays the one with the smallest x) gives back the 5 m x 4 m rectangle', () => {
    const r = ok(importRoomTrace(scan(turn(-30))));
    near(r.room.outline, RECT_OUTLINE);
  });

  it('turned 30 degrees counter-clockwise the walk starts at the smallest-x corner, the old top-left: a 4 m x 5 m rectangle', () => {
    // Corners after turning: (0,0) x=0; (5,0) x=4.33; (5,4) x=2.33; (0,4) x=-2. The smallest x is (0,4),
    // where the 4 m left wall starts, so wall 1 is 4 m long and wall 2 is 5 m long.
    const r = ok(importRoomTrace(scan(turn(30))));
    near(r.room.outline, [
      { x: 0, y: 0 },
      { x: 4_000_000, y: 0 },
      { x: 4_000_000, y: 5_000_000 },
      { x: 0, y: 5_000_000 },
    ]);
  });
});

describe('order independence', () => {
  const windows: WindowSpec[] = [
    { id: 'w-1', at: [5, 2], width: 1, height: 1.2 },
    { id: 'w-2', at: [2, 4], width: 0.8, height: 1 },
    { id: 'w-3', at: [4.5, 2], width: 1, height: 1 },
  ];
  const gappy: WallSpec[] = RECT.map((w) => (w.id === 'bottom' ? { ...w, to: [4.997, 0] as Pt } : w.id === 'top' ? { ...w, from: [4.6, 4] as Pt } : w));

  it('shuffling walls and windows (reversed, and rotated by one) gives a deep-equal result', () => {
    const base = importRoomTrace(scan(gappy, { windows }));
    expect(base.ok).toBe(true);
    const reversed = importRoomTrace(scan([...gappy].reverse(), { windows: [...windows].reverse() }));
    const rotated = importRoomTrace(scan([...gappy.slice(2), ...gappy.slice(0, 2)], { windows: [...windows.slice(1), windows[0]!] }));
    expect(reversed).toEqual(base);
    expect(rotated).toEqual(base);
  });
});

describe('doors', () => {
  it('a scan that lists doors says so and invents none', () => {
    const r = ok(importRoomTrace(scan(RECT, { doors: [{}, {}] })));
    expect(codes(r.findings)).toEqual(['doors-not-read', 'axes-assumed']);
    expect(r.findings[0]).toMatchObject({ code: 'doors-not-read', count: 2 });
    expect(r.room.openings).toEqual([]);
  });
});

describe('ceiling height', () => {
  const mixed = RECT.map((w, i) => ({ ...w, height: i % 2 === 0 ? 2.4 : 2.6 }));

  it('no room height and walls of 2.4 m and 2.6 m: the largest, and a finding', () => {
    const r = ok(importRoomTrace(scan(mixed, { height: null })));
    expect(r.room.ceilingHeightUm).toBe(2_600_000);
    expect(codes(r.findings)).toEqual(['no-doors', 'ceiling-height-varies', 'axes-assumed']);
    expect(r.findings[1]).toMatchObject({ code: 'ceiling-height-varies', minUm: 2_400_000, maxUm: 2_600_000 });
  });

  it('no room height and equal walls: that height, no finding', () => {
    const r = ok(importRoomTrace(scan(RECT, { height: null })));
    expect(r.room.ceilingHeightUm).toBe(2_600_000);
    expect(codes(r.findings)).toEqual(['no-doors', 'axes-assumed']);
  });

  it('a room height with walls more than 10 mm different: the room height, and a finding', () => {
    const r = ok(importRoomTrace(scan(mixed, { height: 2.5 })));
    expect(r.room.ceilingHeightUm).toBe(2_500_000);
    expect(r.findings.find((f) => f.code === 'ceiling-height-varies')).toMatchObject({ minUm: 2_400_000, maxUm: 2_600_000 });
  });

  it('a room height with walls within 10 mm: no finding', () => {
    const near10 = RECT.map((w, i) => ({ ...w, height: i === 0 ? 2.595 : 2.6 }));
    const r = ok(importRoomTrace(scan(near10, { height: 2.6 })));
    expect(codes(r.findings)).toEqual(['no-doors', 'axes-assumed']);
  });
});

describe('errors are data, never thrown', () => {
  const errorCodes = (input: unknown): string[] => {
    const r = importRoomTrace(input);
    if (r.ok) throw new Error('expected errors');
    for (const e of r.errors) expect(e.message.length).toBeGreaterThan(0);
    return r.errors.map((e) => e.code);
  };
  const base = (): Record<string, unknown> => scan(RECT);
  type Mutable = { schemaVersion?: unknown; units: { length: unknown }; rooms: Record<string, unknown>[] };

  it('schemaVersion 3', () => {
    const s = base() as unknown as Mutable;
    s.schemaVersion = 3;
    expect(errorCodes(s)).toEqual(['unsupported-version']);
  });
  it('units in feet', () => {
    const s = base() as unknown as Mutable;
    s.units.length = 'ft';
    expect(errorCodes(s)).toEqual(['unsupported-units']);
  });
  it('no rooms', () => {
    const s = base() as unknown as Mutable;
    s.rooms = [];
    expect(errorCodes(s)).toEqual(['no-rooms']);
  });
  it('two rooms', () => {
    const s = base() as unknown as Mutable;
    s.rooms = [s.rooms[0]!, s.rooms[0]!];
    expect(errorCodes(s)).toEqual(['several-rooms']);
  });
  it('a wall without an end point', () => {
    const s = base() as unknown as Mutable;
    delete (s.rooms[0]!['walls'] as Record<string, unknown>[])[1]!['endPoint'];
    expect(errorCodes(s)).toEqual(['bad-wall']);
  });
  it('a wall with a coordinate that is not a number', () => {
    const s = base() as unknown as Mutable;
    ((s.rooms[0]!['walls'] as { startPoint: { x: unknown } }[])[0]!).startPoint.x = 'five';
    expect(errorCodes(s)).toEqual(['bad-wall']);
  });
  it('two walls', () => {
    expect(errorCodes(scan(RECT.slice(0, 2)))).toEqual(['too-few-walls']);
  });
  it('anything that is not a RoomTrace file', () => {
    expect(errorCodes(null)).toEqual(['not-roomtrace']);
    expect(errorCodes('a string')).toEqual(['not-roomtrace']);
    expect(errorCodes({})).toEqual(['not-roomtrace']);
    expect(errorCodes({ schemaVersion: 2, units: { length: 'm' }, rooms: 'none' })).toEqual(['not-roomtrace']);
  });
  it('walls that fold into a crossing outline', () => {
    // A bow tie: the walk 0,0 -> 4,4 -> 4,0 -> 0,4 -> back crosses itself.
    const bow: WallSpec[] = [
      { id: 'a', from: [0, 0], to: [4, 4] },
      { id: 'b', from: [4, 4], to: [4, 0] },
      { id: 'c', from: [4, 0], to: [0, 4] },
      { id: 'd', from: [0, 4], to: [0, 0] },
    ];
    expect(errorCodes(scan(bow))).toEqual(['outline-invalid']);
  });
});

describe('a window that overhangs its wall', () => {
  it('is moved onto the wall, and the move is reported before the sill finding', () => {
    // Centred at x 0.4 on the bottom wall (0,0)-(5,0), 1.2 m wide: it spans -0.2 to 1.0, so 0.2 m hangs past the start.
    const r = ok(importRoomTrace(scan(RECT, { windows: [{ id: 'w-edge', at: [0.4, 0], width: 1.2, height: 1.2 }] })));
    expect(r.pendingWindows).toEqual([{ id: 'w-edge', wallIndex: 0, offsetUm: 0, widthUm: 1_200_000, heightUm: 1_200_000 }]);
    expect(codes(r.findings)).toEqual(['window-moved', 'window-sill-unknown', 'no-doors', 'axes-assumed']);
    expect(r.findings[0]).toMatchObject({ code: 'window-moved', windowId: 'w-edge', wallIndex: 0, movedUm: 200_000 });
    expect(r.findings[0]!.message.length).toBeGreaterThan(0);
  });

  it('a window wider than its wall is left out as not on the wall', () => {
    const r = ok(importRoomTrace(scan(RECT, { windows: [{ id: 'w-wide', at: [2.5, 0], width: 6, height: 1.2 }] })));
    expect(r.pendingWindows).toEqual([]);
    expect(codes(r.findings)).toContain('window-not-on-wall');
    expect(r.findings.find((f) => f.code === 'window-not-on-wall')).toMatchObject({ windowId: 'w-wide' });
  });
});

describe('a scan with no height', () => {
  it('walls without a height and no room height give the error no-height', () => {
    const s = scan(RECT, { height: null }) as { rooms: { walls: Record<string, unknown>[] }[] };
    for (const w of s.rooms[0]!.walls) delete w['height'];
    const r = importRoomTrace(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.code)).toEqual(['no-height']);
      expect(r.errors[0]!.message.length).toBeGreaterThan(0);
    }
  });
});
