import { describe, expect, it } from 'vitest';
import type { Product, Room } from '../../src/core/index';
import { areaMm2, pointInPolygon, rectCorners } from '../../src/geometry/index';
import { accessZones, configSources, defaultConfig, footprint, keepClearZones } from '../../src/rules/index';
import { protectedDoorway } from '../fixtures/rooms';
import { testCounterLong, testGondolaDouble, testShowcase, testWallShelf } from '../fixtures/products';
import { mm, place, pt } from './helpers';

const bounds = (polygon: readonly { x: number; y: number }[]) => ({
  minX: Math.min(...polygon.map((p) => p.x)),
  maxX: Math.max(...polygon.map((p) => p.x)),
  minY: Math.min(...polygon.map((p) => p.y)),
  maxY: Math.max(...polygon.map((p) => p.y)),
});

describe('config', () => {
  it('has the planning numbers from NOTES.md, each with a source', () => {
    expect(defaultConfig.mainAisleUm).toBe(mm(1200));
    expect(defaultConfig.secondaryAisleUm).toBe(mm(900));
    expect(defaultConfig.staffSpaceUm).toBe(mm(915));
    expect(defaultConfig.doorApproachDepthUm).toBe(mm(1525));
    expect(defaultConfig.doorLatchSideUm).toBe(mm(455));
    expect(defaultConfig.entranceClearDepthUm).toBe(mm(1500));
    expect(defaultConfig.wallSnapMaxGapUm).toBe(2);
    expect(defaultConfig.wallSnapDistanceUm).toBe(mm(300));
    expect(defaultConfig.windowBandDepthUm).toBe(mm(600));
    expect(defaultConfig.staffPassageUm).toBe(mm(600));
    for (const key of Object.keys(defaultConfig)) {
      expect(configSources[key as keyof typeof defaultConfig], key).toMatch(/\S/);
    }
    expect(Object.keys(configSources).sort()).toEqual(Object.keys(defaultConfig).sort());
  });
});

describe('keepClearZones', () => {
  it('protectedDoorway: swing and approach for both doors, in opening order', () => {
    const zones = keepClearZones(protectedDoorway, defaultConfig);
    expect(zones.map((z) => [z.id, z.kind, z.openingId])).toEqual([
      ['entrance:door-swing', 'door-swing', 'entrance'],
      ['entrance:entrance-clear', 'entrance-clear', 'entrance'],
      ['back-room-door:door-swing', 'door-swing', 'back-room-door'],
      ['back-room-door:door-approach', 'door-approach', 'back-room-door'],
    ]);
    for (const zone of zones) expect(zone.reason).toMatch(/\S/);

    // Entrance: x 3000..4000, hinge at the start (x = 3000), so the latch side is the end:
    // 455 mm more to the right, and max(1525, 1500) = 1525 mm deep.
    expect(zones[1]!.polygon).toEqual([pt(3000, 0), pt(4455, 0), pt(4455, 1525), pt(3000, 1525)]);
    // Back-room door on the right wall: y 3000..3900, hinge at y = 3000, latch side up.
    expect(bounds(zones[3]!.polygon)).toEqual({ minX: mm(5475), maxX: mm(7000), minY: mm(3000), maxY: mm(4355) });

    // Swing zones are clipped to the room and cover the swept quarter disc (radius = door width).
    const swing = zones[0]!.polygon;
    expect(bounds(swing).minY).toBe(0);
    expect(pointInPolygon(pt(3700, 700), swing)).toBe('inside'); // 990 mm from the hinge
    expect(pointInPolygon(pt(3900, 900), swing)).toBe('outside'); // 1273 mm from the hinge
    const quarterDisc = (Math.PI * 1000 * 1000) / 4;
    expect(areaMm2(swing)).toBeGreaterThan(quarterDisc);
    expect(areaMm2(swing)).toBeLessThan(quarterDisc * 1.02);
  });

  it('uses the entrance clear depth when it is the larger number', () => {
    const zones = keepClearZones(protectedDoorway, { ...defaultConfig, entranceClearDepthUm: mm(2000) });
    expect(bounds(zones[1]!.polygon).maxY).toBe(mm(2000));
    expect(bounds(zones[3]!.polygon).minX).toBe(mm(7000 - 1525)); // the other door is unchanged
  });

  it('a door that swings out has no swing zone and no latch-side extension; windows give nothing', () => {
    const room: Room = {
      ...protectedDoorway,
      openings: [
        { ...protectedDoorway.openings[0]!, door: { isEntrance: true, swing: 'out', hinge: 'end' } },
        { id: 'w', kind: 'window', wallIndex: 2, offsetUm: mm(1000), widthUm: mm(1000), heightUm: mm(1000), sillHeightUm: mm(900) },
      ],
    };
    const zones = keepClearZones(room, defaultConfig);
    expect(zones.map((z) => z.id)).toEqual(['entrance:entrance-clear']);
    expect(zones[0]!.polygon).toEqual([pt(3000, 0), pt(4000, 0), pt(4000, 1525), pt(3000, 1525)]);
  });

  it('hinge at the end puts the latch-side extension toward the wall start', () => {
    const room: Room = {
      ...protectedDoorway,
      openings: [{ ...protectedDoorway.openings[0]!, door: { isEntrance: true, swing: 'in', hinge: 'end' } }],
    };
    const zones = keepClearZones(room, defaultConfig);
    expect(zones[1]!.polygon).toEqual([pt(2545, 0), pt(4000, 0), pt(4000, 1525), pt(2545, 1525)]);
  });

  it('a zone cut in pieces by the room outline gives one zone per piece with a numbered id', () => {
    // A 100 mm slot (outside the room) runs in from the left wall at y 700..800, across the door zones.
    const room: Room = {
      outline: [pt(0, 0), pt(6000, 0), pt(6000, 4000), pt(0, 4000), pt(0, 800), pt(2500, 800), pt(2500, 700), pt(0, 700)],
      ceilingHeightUm: mm(3000),
      columns: [],
      openings: [
        {
          id: 'entrance', kind: 'door', wallIndex: 0, offsetUm: mm(500), widthUm: mm(1000), heightUm: mm(2100), sillHeightUm: 0,
          door: { isEntrance: true, swing: 'in', hinge: 'start' },
        },
      ],
    };
    const zones = keepClearZones(room, defaultConfig);
    expect(zones.map((z) => z.id)).toEqual([
      'entrance:door-swing#1',
      'entrance:door-swing#2',
      'entrance:entrance-clear#1',
      'entrance:entrance-clear#2',
    ]);
    expect(zones[2]!.polygon).toEqual([pt(500, 0), pt(1955, 0), pt(1955, 700), pt(500, 700)]);
    expect(zones[3]!.polygon).toEqual([pt(500, 800), pt(1955, 800), pt(1955, 1525), pt(500, 1525)]);
  });
});

describe('footprint', () => {
  it('is the variant size at the placement pose', () => {
    const p = place('a', testShowcase, 2000, 3000, 90);
    expect(footprint(p, testShowcase.variants[0]!)).toEqual({
      center: pt(2000, 3000), widthUm: mm(1500), depthUm: mm(500), rotationUdeg: 90_000_000,
    });
  });

  it('refuses a variant with an unknown dimension', () => {
    const p = place('a', testShowcase, 0, 0);
    expect(() => footprint(p, { ...testShowcase.variants[0]!, depthUm: null })).toThrow(RangeError);
  });
});

describe('accessZones', () => {
  const variantOf = (product: Product) => product.variants[0]!;

  it('wall unit: one customer zone in front, full width, secondary aisle deep', () => {
    const p = place('shelf', testWallShelf, 1000, 200); // back on y = 0, front at y = 400
    const zones = accessZones(p, testWallShelf, variantOf(testWallShelf), defaultConfig);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ kind: 'customer', side: 'front', depthUm: mm(900) });
    expect(rectCorners(zones[0]!.rect)).toEqual([pt(400, 400), pt(1600, 400), pt(1600, 1300), pt(400, 1300)]);
  });

  it('uses the product front clearance when it is larger than the secondary aisle', () => {
    const deep: Product = { ...testShowcase, clearances: { ...testShowcase.clearances, frontUm: mm(1000) } };
    const zones = accessZones(place('s', deep, 2000, 2000), deep, variantOf(deep), defaultConfig);
    expect(zones.map((z) => [z.kind, z.side, z.depthUm])).toEqual([['customer', 'front', mm(1000)]]);
  });

  it('island: customer zones in front and behind', () => {
    const p = place('g', testGondolaDouble, 3000, 3000, 90); // front faces -x
    const zones = accessZones(p, testGondolaDouble, variantOf(testGondolaDouble), defaultConfig);
    expect(zones.map((z) => [z.kind, z.side, z.depthUm])).toEqual([
      ['customer', 'front', mm(900)],
      ['customer', 'back', mm(900)],
    ]);
    const xs = (i: number) => rectCorners(zones[i]!.rect).map((c) => c.x);
    expect([Math.min(...xs(0)), Math.max(...xs(0))]).toEqual([mm(3000 - 450 - 900), mm(3000 - 450)]);
    expect([Math.min(...xs(1)), Math.max(...xs(1))]).toEqual([mm(3000 + 450), mm(3000 + 450 + 900)]);
  });

  it('counter: main aisle on the customer side, staff space behind', () => {
    const p = place('c', testCounterLong, 3000, 3000);
    const zones = accessZones(p, testCounterLong, variantOf(testCounterLong), defaultConfig);
    expect(zones.map((z) => [z.kind, z.side, z.depthUm])).toEqual([
      ['customer', 'front', mm(1200)],
      ['staff', 'back', mm(915)],
    ]);
    expect(rectCorners(zones[1]!.rect)).toEqual([pt(2100, 1785), pt(3900, 1785), pt(3900, 2700), pt(2100, 2700)]);
  });
});
