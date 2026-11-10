import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Placement, Room } from '../../src/core/index';
import { wallSegments } from '../../src/geometry/index';
import { defaultConfig, footprint, snapToWall, validateLayout } from '../../src/rules/index';
import { angledWall, lShapeWithColumn, protectedDoorway } from '../fixtures/rooms';
import {
  testBin,
  testCounterLong,
  testGondolaDouble,
  testProducts,
  testShowcase,
  testTower,
  testWallShelf,
} from '../fixtures/products';
import { makeDoc, mm, ofRule, place, pt, rectRoom } from './helpers';

const rules = (room: Room, placements: Placement[]) =>
  validateLayout(makeDoc(room, testProducts, placements)).map((v) => v.rule);

describe('a sound layout has no violations', () => {
  it('wall shelf on the back wall and a gondola in the middle of a 6 m x 6 m room', () => {
    const placements = [
      place('shelf', testWallShelf, 1500, 5800, 180), // back on the top wall
      place('gondola', testGondolaDouble, 3000, 3500),
    ];
    expect(validateLayout(makeDoc(rectRoom(6000, 6000), testProducts, placements))).toEqual([]);
  });
});

describe('overlap', () => {
  it('reports two fixtures that overlap, once, naming both', () => {
    const v = ofRule(
      validateLayout(
        makeDoc(rectRoom(8000, 8000), testProducts, [
          place('a', testGondolaDouble, 3000, 5000),
          place('b', testGondolaDouble, 3500, 5200),
        ]),
      ),
      'overlap',
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.placementIds).toEqual(['a', 'b']);
    expect(v[0]!.severity).toBe('error');
  });

  it('fixtures that share an edge do not overlap', () => {
    expect(
      rules(rectRoom(8000, 8000), [
        place('a', testGondolaDouble, 3000, 5000),
        place('b', testGondolaDouble, 4200, 5000),
      ]),
    ).not.toContain('overlap');
  });
});

describe('outside-room', () => {
  it('catches a fixture straddling the notch of the L-shaped room', () => {
    // Corners at x 5400..6600, y 4550..5450: the right half is in the notch (outside).
    expect(rules(lShapeWithColumn, [place('g', testGondolaDouble, 6000, 5000)])).toContain('outside-room');
  });

  it('accepts a fixture flush in a corner', () => {
    expect(rules(lShapeWithColumn, [place('g', testGondolaDouble, 600, 6550)])).not.toContain('outside-room');
  });
});

describe('column', () => {
  it('catches a fixture standing on the column', () => {
    const v = ofRule(
      validateLayout(makeDoc(lShapeWithColumn, testProducts, [place('g', testGondolaDouble, 3200, 3200)])),
      'column',
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.columnId).toBe('column-1');
  });

  it('accepts a fixture touching the column', () => {
    // Column x 3000..3400; gondola 1200 wide centred at 4000 -> x 3400..4600.
    expect(rules(lShapeWithColumn, [place('g', testGondolaDouble, 4000, 3200)])).not.toContain('column');
  });
});

describe('blocked-door', () => {
  it('catches a fixture in the entrance swing and one in front of the back-room door', () => {
    const v = ofRule(
      validateLayout(
        makeDoc(protectedDoorway, testProducts, [
          place('in-swing', testShowcase, 3500, 600),
          place('at-back-door', testShowcase, 6000, 3500, 90),
        ]),
      ),
      'blocked-door',
    );
    expect(v.map((x) => [x.placementIds[0], x.openingId])).toEqual([
      ['at-back-door', 'back-room-door'],
      ['in-swing', 'entrance'],
    ]);
    expect(v[1]!.message).toMatch(/entrance/);
  });

  it('accepts a fixture that starts exactly where the decompression zone ends', () => {
    // The zone is a third of the 5 m shop depth: 1666.667 mm. Showcase depth 500, so its centre is 250 mm further.
    const touching = { ...place('s', testShowcase, 3500, 0), center: { x: mm(3500), y: 1_666_667 + mm(250) } };
    expect(rules(protectedDoorway, [touching])).not.toContain('blocked-door');
    const inside = { ...touching, center: { x: mm(3500), y: 1_666_667 + mm(250) - mm(10) } };
    expect(rules(protectedDoorway, [inside])).toContain('blocked-door');
  });

  it('keeps the way straight in from the entrance clear, beyond the door approach', () => {
    // 1525 mm (door approach) < 1900 mm < 2333 mm (a third of the 7 m deep L-shaped shop).
    expect(rules(lShapeWithColumn, [place('g', testGondolaDouble, 4500, 1900 + 450)])).toContain('blocked-door');
  });
});

describe('window-blocked', () => {
  // Window on the left wall (wall 5) of the L room. The wall runs from (0,7000) down to (0,0);
  // offset 2500 from its start, 2000 wide -> y 2500..4500.
  it('rejects a tall unit in front of the window', () => {
    const v = ofRule(
      validateLayout(makeDoc(lShapeWithColumn, testProducts, [place('shelf', testWallShelf, 200, 3500, 270)])),
      'window-blocked',
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.openingId).toBe('window-1');
  });

  it('rejects anything higher than the sill, even a low showcase: 1000 mm against a 900 mm sill', () => {
    const v = ofRule(validateLayout(makeDoc(lShapeWithColumn, testProducts, [place('s', testShowcase, 250, 3500, 270)])), 'window-blocked');
    expect(v).toHaveLength(1);
    expect([v[0]!.measuredUm, v[0]!.requiredUm]).toEqual([mm(1000), mm(900)]);
  });

  it('accepts a fixture that is not higher than the sill: 900 mm bin under a 900 mm sill', () => {
    expect(rules(lShapeWithColumn, [place('bin', testBin, 400, 3500, 270)])).not.toContain('window-blocked');
  });

  it('accepts a tall unit below a high window (sill above the unit)', () => {
    const room: Room = {
      ...lShapeWithColumn,
      openings: lShapeWithColumn.openings.map((o) => (o.kind === 'window' ? { ...o, sillHeightUm: mm(2200), heightUm: mm(500) } : o)),
    };
    // The shelf is 2100 mm tall; the sill is at 2200 mm.
    expect(rules(room, [place('shelf', testWallShelf, 200, 3500, 270)])).not.toContain('window-blocked');
  });

  it('accepts a tall unit on the same wall beside the window', () => {
    expect(rules(lShapeWithColumn, [place('shelf', testWallShelf, 200, 1000, 270)])).not.toContain('window-blocked');
  });
});

describe('wall-unit-not-on-wall', () => {
  it('rejects a wall unit standing in the open and one facing the wall', () => {
    expect(rules(rectRoom(6000, 6000), [place('open', testWallShelf, 3000, 4000)])).toContain('wall-unit-not-on-wall');
    // Against the top wall but rotated so its FRONT touches the wall.
    expect(rules(rectRoom(6000, 6000), [place('wrong', testWallShelf, 1500, 5800, 0)])).toContain(
      'wall-unit-not-on-wall',
    );
  });

  it('accepts a wall unit flush on the angled wall, and rejects it a quarter turn off', () => {
    const wall = wallSegments(angledWall.outline)[2]!;
    const flush = snapToWall(
      angledWall,
      { center: pt(6700, 3800), widthUm: mm(1200), depthUm: mm(400), rotationUdeg: wall.angleUdeg },
      defaultConfig,
    );
    expect(flush).not.toBeNull();
    const good: Placement = { ...place('shelf', testWallShelf, 0, 0), center: flush!.center, rotationUdeg: flush!.rotationUdeg };
    const result = rules(angledWall, [good]);
    expect(result).not.toContain('wall-unit-not-on-wall');
    expect(result).not.toContain('outside-room');

    const turned: Placement = { ...good, center: pt(5500, 3500), rotationUdeg: (flush!.rotationUdeg + 90_000_000) % 360_000_000 };
    expect(rules(angledWall, [turned])).toContain('wall-unit-not-on-wall');
  });

  it('rejects a wall unit standing across a door', () => {
    // Entrance of the 6 m room is at x 2500..3500 on the bottom wall.
    expect(rules(rectRoom(6000, 6000), [place('shelf', testWallShelf, 3000, 200)])).toContain('wall-unit-not-on-wall');
  });
});

describe('snapToWall', () => {
  it('snaps a unit near a straight wall flush onto it, facing the room', () => {
    const snapped = snapToWall(
      rectRoom(6000, 6000),
      { center: pt(1500, 5700), widthUm: mm(1200), depthUm: mm(400), rotationUdeg: 0 },
      defaultConfig,
    );
    expect(snapped).toEqual({ center: pt(1500, 5800), rotationUdeg: 180_000_000, wallIndex: 2 });
  });

  it('returns null when no wall is within the snap distance', () => {
    expect(
      snapToWall(rectRoom(6000, 6000), { center: pt(3000, 3000), widthUm: mm(1200), depthUm: mm(400), rotationUdeg: 0 }, defaultConfig),
    ).toBeNull();
  });

  it('keeps the unit on the wall: slides it along when it hangs past the corner', () => {
    const snapped = snapToWall(
      rectRoom(6000, 6000),
      { center: pt(300, 5750), widthUm: mm(1200), depthUm: mm(400), rotationUdeg: 180_000_000 },
      defaultConfig,
    );
    expect(snapped!.center).toEqual(pt(600, 5800));
  });
});

describe('access-blocked', () => {
  it('rejects two gondolas facing each other 815 mm apart and accepts 915 mm', () => {
    // Depth 900 -> front at centre + 450. a faces +y, b sits above it.
    const pair = (gapMm: number) => [
      place('a', testGondolaDouble, 6200, 3000),
      place('b', testGondolaDouble, 6200, 3000 + 900 + gapMm),
    ];
    const narrow = ofRule(validateLayout(makeDoc(rectRoom(8000, 8000), testProducts, pair(815))), 'access-blocked');
    expect(narrow.map((v) => v.placementIds)).toEqual([['a', 'b'], ['b', 'a']]);
    expect(narrow[0]!.requiredUm).toBe(mm(915));
    expect(rules(rectRoom(8000, 8000), pair(915))).toEqual([]);
  });

  it('rejects a fixture whose access zone runs through a wall', () => {
    // Gondola turned so its front faces the left wall, 150 mm away.
    const room: Room = { ...rectRoom(6000, 6000), outline: [pt(0, 0), pt(6000, 0), pt(6000, 6000), pt(1200, 6000), pt(1200, 3000), pt(0, 3000)] };
    const v = validateLayout(makeDoc(room, testProducts, [place('gondola', testGondolaDouble, 600, 2000, 90)]));
    expect(v.map((x) => x.rule)).toContain('access-blocked');
  });
});

describe('unreachable and aisle-too-narrow', () => {
  const roomOfWidth = (widthMm: number): Room => ({
    outline: [pt(0, 0), pt(widthMm, 0), pt(widthMm, 9000), pt(0, 9000)],
    ceilingHeightUm: mm(3000),
    columns: [],
    openings: [
      {
        id: 'entrance', kind: 'door', wallIndex: 0, offsetUm: mm(1000), widthUm: mm(1000), heightUm: mm(2100), sillHeightUm: 0,
        door: { isEntrance: true, swing: 'in', hinge: 'start' },
      },
    ],
  });
  // Barrier: two gondolas side by side from the left wall, x 0..2400 at y 4000. Their fronts face
  // +y, away from the entrance. Behind the barrier, a wall shelf on the top wall.
  const layout = [
    place('g1', testGondolaDouble, 600, 4000),
    place('g2', testGondolaDouble, 1800, 4000),
    place('shelf', testWallShelf, 1500, 8800, 180),
  ];

  it('passes when the gap past the barrier is 915 mm', () => {
    expect(rules(roomOfWidth(3315), layout)).toEqual([]);
  });

  it('reports aisle-too-narrow for what lies beyond a 700 mm gap', () => {
    const v = validateLayout(makeDoc(roomOfWidth(3100), testProducts, layout));
    const narrow = ofRule(v, 'aisle-too-narrow');
    expect(narrow.map((x) => x.placementIds[0])).toEqual(['g1', 'g2', 'shelf']);
    expect(narrow[0]!.requiredUm).toBe(mm(915));
    expect(ofRule(v, 'unreachable')).toEqual([]);
  });

  it('reports unreachable when the barrier closes the room', () => {
    const closed = [...layout, place('g3', testGondolaDouble, 3000, 4000)]; // x 2400..3600
    const v = validateLayout(makeDoc(roomOfWidth(3600), testProducts, closed));
    expect(ofRule(v, 'unreachable').map((x) => x.placementIds[0])).toEqual(['g1', 'g2', 'g3', 'shelf']);
    expect(ofRule(v, 'aisle-too-narrow')).toEqual([]);
  });
});

describe('main-aisle', () => {
  // Counter on the top wall side, facing the entrance (front faces -y at 180 degrees).
  const withShowcaseAt = (clearMm: number): Placement[] => [
    place('counter', testCounterLong, 3000, 4800, 180), // front edge at y = 4500, staff space 4 800+300 .. 6 015
    // Showcases either side of the route leave `clearMm` between them, right in front of the counter.
    place('left', testShowcase, 3000 - clearMm / 2 - 750, 3000),
    place('right', testShowcase, 3000 + clearMm / 2 + 750, 3000),
  ];
  const room = rectRoom(6000, 6100);

  it('passes with 1200 mm between the showcases', () => {
    expect(rules(room, withShowcaseAt(1200))).toEqual([]);
  });

  it('fails with 1000 mm: wide enough to walk, too narrow for the main aisle', () => {
    const v = validateLayout(makeDoc(room, testProducts, withShowcaseAt(1000)));
    expect(v.map((x) => x.rule)).toEqual(['main-aisle']);
    expect(v[0]!.requiredUm).toBe(mm(1200));
    expect(v[0]!.placementIds).toEqual(['counter']);
  });
});

describe('determinism', () => {
  it('gives the same violations whatever the order of the placements', () => {
    const placements = [
      place('a', testGondolaDouble, 3000, 5000),
      place('b', testGondolaDouble, 3500, 5200),
      place('c', testWallShelf, 3000, 4000),
      place('d', testShowcase, 4500, 600),
      place('e', testTower, 300, 3500, 270),
      place('f', testGondolaDouble, 6000, 5000),
    ];
    const reference = validateLayout(makeDoc(lShapeWithColumn, testProducts, placements));
    expect(reference.length).toBeGreaterThan(4);
    fc.assert(
      fc.property(fc.shuffledSubarray(placements, { minLength: placements.length }), (shuffled) => {
        expect(validateLayout(makeDoc(lShapeWithColumn, testProducts, shuffled))).toEqual(reference);
      }),
      { seed: 20261110, numRuns: 25 },
    );
  });

  it('validates 40 fixtures quickly', () => {
    const placements: Placement[] = [];
    for (let i = 0; i < 40; i++) {
      placements.push(place(`g${String(i).padStart(2, '0')}`, testGondolaDouble, 2000 + (i % 8) * 2400, 4200 + Math.floor(i / 8) * 2600));
    }
    const room = rectRoom(22000, 16000);
    const doc = makeDoc(room, testProducts, placements);
    expect(footprint(placements[0]!, testGondolaDouble.variants[0]!).widthUm).toBe(mm(1200));
    const start = performance.now();
    const v = validateLayout(doc);
    const elapsed = performance.now() - start;
    console.log(`validateLayout, 40 fixtures: ${elapsed.toFixed(1)} ms, ${v.length} violations`);
    expect(v).toEqual([]);
    expect(elapsed).toBeLessThan(1000);
  });
});
