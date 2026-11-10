/**
 * Independent checks of the rules and of the engine's output. The oracle (./oracle.ts) shares no
 * code with the validator, and the keep-clear areas below are worked out BY HAND from the room
 * drawings, in millimetres, not taken from src/rules/zones.ts.
 */
import { describe, expect, it } from 'vitest';
import type { DesignDocument, Room } from '../../src/core/index';
import { autoLayout } from '../../src/layout/index';
import { validateLayout } from '../../src/rules/index';
import { angledWall, lShapeWithColumn, protectedDoorway, smallRectOverfull } from '../fixtures/rooms';
import { testCounterLong, testGondolaDouble, testProducts, testShowcase, testWallShelf } from '../fixtures/products';
import { scenarios, benchmark, wallsFull } from '../layout/scenarios';
import { makeDoc, place, rectRoom } from '../rules/helpers';
import { judge } from './oracle';
import type { Box, KeepClear } from './oracle';

const mm = (v: number): number => v * 1000;
const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: mm(x0), y0: mm(y0), x1: mm(x1), y1: mm(y1) });

/**
 * Hand-worked keep-clear areas for an entrance on the BOTTOM wall, hinged on its left jamb,
 * swinging in: door from x = left to x = left + width.
 *  - swing: the quarter of a disc of radius `width` centred on the hinge (left, 0) that lies
 *    to the right of the hinge and inside the room (the leaf turns from the wall line to
 *    straight in; it never passes to the left of the hinge);
 *  - approach: door width plus 455 mm on the latch (right) side, 1525 mm deep;
 *  - decompression: door width, a third of the shop depth, 3000 mm at most.
 */
function entranceZones(left: number, width: number, shopDepth: number): KeepClear[] {
  const deep = Math.min(3000, shopDepth / 3);
  return [
    { name: 'entrance swing', boxes: [], discs: [{ cx: mm(left), cy: 0, r: mm(width), within: box(left, 0, left + width, width) }] },
    { name: 'entrance approach', boxes: [box(left, 0, left + width + 455, 1525)], discs: [] },
    { name: 'entrance decompression', boxes: [box(left, 0, left + width, deep)], discs: [] },
  ];
}
const bottomEntrance = (left: number, width: number) => ({ at: { x: mm(left + width / 2), y: 0 }, inward: { x: 0, y: 1 } });

type Case = { keepClear: KeepClear[]; windows: { name: string; band: Box; sillUm: number }[]; entrance: ReturnType<typeof bottomEntrance> };
/** Per room, by hand. Rooms are in test/fixtures/rooms.ts. */
const byRoom = new Map<Room, Case>([
  // L-shape: 7 m deep at the door (x 4000..5000). Window on the left wall, y 2500..4500, sill 900.
  [lShapeWithColumn, { keepClear: entranceZones(4000, 1000, 7000), windows: [{ name: 'window-1', band: box(0, 2500, 600, 4500), sillUm: mm(900) }], entrance: bottomEntrance(4000, 1000) }],
  // Angled wall: 6 m deep at the door (x 3000..4000). Window on the left wall, y 2500..4000 (wall runs downwards from y 6000: offset 2000, width 1500).
  [angledWall, { keepClear: entranceZones(3000, 1000, 6000), windows: [{ name: 'window-1', band: box(0, 2500, 600, 4000), sillUm: mm(900) }], entrance: bottomEntrance(3000, 1000) }],
  // Small shop: 5 m deep, door x 1550..2450.
  [smallRectOverfull, { keepClear: entranceZones(1550, 900, 5000), windows: [], entrance: bottomEntrance(1550, 900) }],
  // Back-room door on the right wall, y 3000..3900, hinged at y 3000, swinging in:
  // swing: quarter disc radius 900 at the hinge (7000, 3000), into the room and up towards the latch; approach 1525 deep into the room, 455 more on the latch (upper) side.
  [protectedDoorway, {
    keepClear: [
      ...entranceZones(3000, 1000, 5000),
      { name: 'back-room swing', boxes: [], discs: [{ cx: mm(7000), cy: mm(3000), r: mm(900), within: box(7000 - 900, 3000, 7000, 3900) }] },
      { name: 'back-room approach', boxes: [box(7000 - 1525, 3000, 7000, 3900 + 455)], discs: [] },
    ],
    windows: [],
    entrance: bottomEntrance(3000, 1000),
  }],
  [wallsFull.room, { keepClear: entranceZones(3500, 1000, 8000), windows: [], entrance: bottomEntrance(3500, 1000) }],
  [benchmark.room, { keepClear: entranceZones(7000, 1000, 10000), windows: [], entrance: bottomEntrance(7000, 1000) }],
]);

const judged = (doc: DesignDocument) => {
  const c = byRoom.get(doc.room)!;
  return judge(doc, c.keepClear, c.windows, c.entrance);
};

describe('oracle agrees that the engine output is sound', () => {
  it.each([...scenarios, wallsFull, benchmark].map((s) => [s.id, s] as const))('%s: every ranked option passes the independent checks', (_id, request) => {
    const options = autoLayout(request).options;
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(judged(option.document), `${request.id} option ${option.rank}`).toEqual([]);
    }
  });
});

describe('oracle and validator agree on hand-built layouts', () => {
  const room6 = rectRoom(6000, 6000); // entrance x 2500..3500, 6 m deep
  const case6: Case = { keepClear: entranceZones(2500, 1000, 6000), windows: [], entrance: bottomEntrance(2500, 1000) };
  const both = (doc: DesignDocument, c: Case) => ({
    oracle: [...new Set(judge(doc, c.keepClear, c.windows, c.entrance).map((p) => p.kind))].sort(),
    validator: [...new Set(validateLayout(doc).map((v) => v.rule))].sort(),
  });

  it('a sound layout: nothing from either', () => {
    const doc = makeDoc(room6, testProducts, [place('shelf', testWallShelf, 1500, 5800, 180), place('g', testGondolaDouble, 3000, 3500)]);
    expect(both(doc, case6)).toEqual({ oracle: [], validator: [] });
  });

  it('two overlapping gondolas', () => {
    const doc = makeDoc(room6, testProducts, [place('a', testGondolaDouble, 1500, 4000), place('b', testGondolaDouble, 2000, 4200)]);
    const r = both(doc, case6);
    expect(r.oracle).toContain('overlap');
    expect(r.validator).toContain('overlap');
  });

  it('a gondola straddling the notch of the L-shaped room', () => {
    const doc = makeDoc(lShapeWithColumn, testProducts, [place('g', testGondolaDouble, 6000, 5000)]);
    expect(judged(doc).map((p) => p.kind)).toContain('outside-room');
    expect(validateLayout(doc).map((v) => v.rule)).toContain('outside-room');
  });

  it('a gondola on the column', () => {
    const doc = makeDoc(lShapeWithColumn, testProducts, [place('g', testGondolaDouble, 3200, 3200)]);
    expect(judged(doc).map((p) => p.kind)).toContain('column');
    expect(validateLayout(doc).map((v) => v.rule)).toContain('column');
  });

  it('a showcase in the decompression zone, 1.8 m straight in from the door', () => {
    // By hand: zone is x 2500..3500, y 0..2000 (a third of 6 m). Showcase 1500 x 500 centred at (3000, 1800).
    const doc = makeDoc(room6, testProducts, [place('s', testShowcase, 3000, 1800)]);
    expect(both(doc, case6)).toEqual({ oracle: ['keep-clear'], validator: ['blocked-door'] });
  });

  it('a showcase 100 mm beyond the decompression zone is fine for both', () => {
    const doc = makeDoc(room6, testProducts, [place('s', testShowcase, 3000, 2000 + 100 + 250)]);
    expect(both(doc, case6)).toEqual({ oracle: [], validator: [] });
  });

  it('a wall of gondolas closing the room: what is behind is unreachable', () => {
    // 3.6 m wide room, three 1200 mm gondolas side by side at y 4000, a shelf on the back wall.
    const room: Room = { ...rectRoom(3600, 9000) };
    const c: Case = { keepClear: entranceZones(1300, 1000, 9000), windows: [], entrance: bottomEntrance(1300, 1000) };
    const doc = makeDoc(room, testProducts, [
      place('g1', testGondolaDouble, 600, 4000), place('g2', testGondolaDouble, 1800, 4000), place('g3', testGondolaDouble, 3000, 4000),
      place('shelf', testWallShelf, 1500, 8800, 180),
    ]);
    const r = both(doc, c);
    expect(r.oracle).toContain('unreachable');
    expect(r.validator).toContain('unreachable');
    expect(judge(doc, c.keepClear, c.windows, c.entrance).filter((p) => p.kind === 'unreachable').map((p) => p.ids[0]).sort()).toEqual(['g1', 'g2', 'g3', 'shelf']);
  });

  it('a 700 mm gap is too narrow for both; a 1100 mm gap is fine for both', () => {
    const layout = [place('g1', testGondolaDouble, 600, 4000), place('g2', testGondolaDouble, 1800, 4000), place('shelf', testWallShelf, 1500, 8800, 180)];
    const narrow = makeDoc(rectRoom(3100, 9000), testProducts, layout);
    const cNarrow: Case = { keepClear: entranceZones(1050, 1000, 9000), windows: [], entrance: bottomEntrance(1050, 1000) };
    expect(judge(narrow, cNarrow.keepClear, [], cNarrow.entrance).map((p) => p.kind)).toContain('unreachable');
    expect(validateLayout(narrow).map((v) => v.rule)).toContain('aisle-too-narrow');
    const wide = makeDoc(rectRoom(3500, 9000), testProducts, layout);
    const cWide: Case = { keepClear: entranceZones(1250, 1000, 9000), windows: [], entrance: bottomEntrance(1250, 1000) };
    expect(both(wide, cWide)).toEqual({ oracle: [], validator: [] });
  });

  it('a counter with its back 300 mm from the wall: no staff space, for both', () => {
    const doc = makeDoc(room6, testProducts, [place('c', testCounterLong, 1500, 5400, 180)]); // back at y 5700
    const r = both(doc, case6);
    expect(r.oracle).toContain('access');
    expect(r.validator).toContain('access-blocked');
  });

  it('a shelf alone in the open floor has a free back, for both', () => {
    const doc = makeDoc(room6, testProducts, [place('shelf', testWallShelf, 1500, 4000)]);
    expect(both(doc, case6)).toEqual({ oracle: ['free-back'], validator: ['wall-unit-not-on-wall'] });
  });

  it('a tall shelf in front of the window, for both', () => {
    const doc = makeDoc(lShapeWithColumn, testProducts, [place('shelf', testWallShelf, 200, 3500, 270)]);
    expect(judged(doc).map((p) => p.kind)).toEqual(['window']);
    expect(validateLayout(doc).map((v) => v.rule)).toEqual(['window-blocked']);
  });
});
