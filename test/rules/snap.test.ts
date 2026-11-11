/** Issue M3-2: rotate in 90-degree steps relative to the nearest wall. Expected values worked out by hand. */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Room } from '../../src/core/index';
import type { Placement, Product } from '../../src/core/index';
import { defaultConfig, placedFixtures, quarterTurn, snapBackToBack, snapToWall, validateLayout } from '../../src/rules/index';
import { testTower, testWallShelf } from '../fixtures/products';
import { angledWall, lShapeWithColumn, protectedDoorway } from '../fixtures/rooms';
import { makeDoc, mm, place, rectRoom } from './helpers';

const FULL = 360_000_000;
const QUARTER = 90_000_000;
const at = (xMm: number, yMm: number) => ({ x: xMm * 1000, y: yMm * 1000 });

describe('quarterTurn: angled wall', () => {
  // Wall 2 runs (8000,2000) -> (6000,6000) mm; its direction is (-2000, 4000).
  const angle = Math.round(Math.atan2(4000, -2000) * (180 / Math.PI) * 1_000_000);
  const center = { x: 7_000_000, y: 3_800_000 };
  // Distance to wall 2 is 89.4 mm; to the end of wall 1 it is 2059 mm and to the end of wall 3 2417 mm.

  it('the hand angle is 116_565_051 udeg', () => {
    expect(angle).toBe(116_565_051);
  });

  it('cycles through the four wall-relative rotations from 0', () => {
    const seen: number[] = [];
    let r = 0;
    for (let i = 0; i < 5; i++) {
      r = quarterTurn(angledWall, center, r);
      seen.push(r);
    }
    expect(seen).toEqual([26_565_051, 116_565_051, 206_565_051, 296_565_051, 26_565_051]);
  });

  it('starting 1 udeg past an allowed value goes to the next one', () => {
    expect(quarterTurn(angledWall, center, 26_565_052)).toBe(116_565_051);
  });

  it('wraps past 360 degrees to the smallest allowed rotation', () => {
    expect(quarterTurn(angledWall, center, 296_565_052)).toBe(26_565_051);
    expect(quarterTurn(angledWall, center, 296_565_051)).toBe(26_565_051);
  });

  it('is strictly greater than the start, so a value on the grid moves on', () => {
    expect(quarterTurn(angledWall, center, 116_565_051)).toBe(206_565_051);
  });
});

describe('quarterTurn: axis-aligned rooms', () => {
  // protectedDoorway is 7000 x 5000 mm; from (3000, 2000) the walls 0..3 are 2000, 4000, 3000, 3000 mm away.
  it('uses wall 0 (angle 0) when it is the nearest', () => {
    const c = at(3000, 2000);
    expect(quarterTurn(protectedDoorway, c, 0)).toBe(90_000_000);
    expect(quarterTurn(protectedDoorway, c, 90_000_000)).toBe(180_000_000);
    expect(quarterTurn(protectedDoorway, c, 270_000_000)).toBe(0);
  });

  it('uses the right wall (angle 90 degrees) when it is the nearest', () => {
    // From (6500, 2500): wall 1 (x = 7000) is 500 mm away; wall 0 is 2500; wall 2 is 2500; wall 3 is 6500.
    const c = at(6500, 2500);
    expect(quarterTurn(protectedDoorway, c, 0)).toBe(90_000_000);
    expect(quarterTurn(protectedDoorway, c, 90_000_000)).toBe(180_000_000);
  });

  it('on a tie the lowest wall index wins', () => {
    // 4000 x 4000 mm square; (1000, 1000) is 1000 mm from wall 0 and wall 3.
    const square: Room = {
      ...protectedDoorway,
      outline: [at(0, 0), at(4000, 0), at(4000, 4000), at(0, 4000)],
      openings: [],
    };
    expect(quarterTurn(square, at(1000, 1000), 0)).toBe(90_000_000);
  });

  it('wraps modulo 360 degrees on the right wall', () => {
    // Right wall (90 deg): allowed 90, 180, 270, 0 (million udeg); from 270_000_000 the next is 0.
    expect(quarterTurn(protectedDoorway, at(6500, 2500), 270_000_000)).toBe(0);
  });
});

describe('quarterTurn: properties', () => {
  it('is an integer in [0, 360 000 000) and the cycle has length 4', () => {
    fc.assert(
      fc.property(
        // The part of the angled room below y = 2000 mm and left of x = 6000 mm is always inside it.
        fc.integer({ min: 0, max: 6_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: FULL - 1 }),
        (x, y, start) => {
          const c = { x, y };
          const r1 = quarterTurn(angledWall, c, start);
          let r = r1;
          for (let i = 0; i < 4; i++) {
            expect(Number.isInteger(r)).toBe(true);
            expect(r).toBeGreaterThanOrEqual(0);
            expect(r).toBeLessThan(FULL);
            r = quarterTurn(angledWall, c, r);
          }
          expect(r).toBe(r1);
          expect((r1 - quarterTurn(angledWall, c, r1) + FULL) % FULL).toBe(FULL - QUARTER);
        },
      ),
      { seed: 20261111, numRuns: 200 },
    );
  });
});

/** A synthetic single-sided unit of the given size (mm); testOnly like every test product. */
function wallUnit(widthMm: number, depthMm: number): Product {
  const v = testWallShelf.variants[0]!;
  return {
    ...testWallShelf,
    id: 'test-wall-unit',
    variants: [
      {
        ...v,
        widthUm: mm(widthMm),
        depthUm: mm(depthMm),
        entered: { width: { value: widthMm, unit: 'mm' }, depth: { value: depthMm, unit: 'mm' }, height: v.entered?.height ?? null },
      },
    ],
  };
}

const placement = (id: string, product: Product, center: { x: number; y: number }, rotationUdeg: number): Placement => ({
  id,
  productId: product.id,
  variantId: 'default',
  center,
  rotationUdeg,
});

describe('snapToWall: the result always passes the wall-unit rule', () => {
  const rooms = [
    ['protectedDoorway', protectedDoorway],
    ['angledWall', angledWall],
    ['lShapeWithColumn', lShapeWithColumn],
  ] as const;

  for (const [name, room] of rooms) {
    it(`${name}: any snapped pose gives no wall-unit-not-on-wall`, () => {
      const xs = room.outline.map((p) => p.x);
      const ys = room.outline.map((p) => p.y);
      fc.assert(
        fc.property(
          fc.integer({ min: 200, max: 2000 }),
          fc.integer({ min: 100, max: 900 }),
          fc.integer({ min: 0, max: FULL - 1 }),
          fc.integer({ min: Math.min(...xs), max: Math.max(...xs) }),
          fc.integer({ min: Math.min(...ys), max: Math.max(...ys) }),
          (wMm, dMm, rotationUdeg, x, y) => {
            const snap = snapToWall(room, { center: { x, y }, widthUm: mm(wMm), depthUm: mm(dMm), rotationUdeg }, defaultConfig);
            if (snap === null) return;
            const product = wallUnit(wMm, dMm);
            const doc = makeDoc(room, [product], [placement('p', product, snap.center, snap.rotationUdeg)]);
            const bad = validateLayout(doc, defaultConfig).filter((v) => v.rule === 'wall-unit-not-on-wall');
            expect(bad).toEqual([]);
          },
        ),
        { seed: 20261111, numRuns: 300 },
      );
    });
  }
});

describe('snapToWall: hand cases', () => {
  it('slides along the wall off the entrance instead of covering the door', () => {
    // Door on wall 0 spans x 3000..4000 mm. Flush at x = 3000 the 1219.2 mm stand would span
    // 2390.4..3609.6; the nearest free centre is 3000 - 609.6 = 2390.4 (the other side is 4609.6).
    const snap = snapToWall(
      protectedDoorway,
      { center: { x: 3_000_000, y: 500_000 }, widthUm: 1_219_200, depthUm: 508_000, rotationUdeg: 0 },
      defaultConfig,
    );
    expect(snap).toEqual({ center: { x: 2_390_400, y: 254_000 }, rotationUdeg: 0, wallIndex: 0 });
  });

  it('snaps flush to the angled wall (wall 2)', () => {
    const snap = snapToWall(
      angledWall,
      { center: { x: 6_776_393, y: 3_888_197 }, widthUm: 600_000, depthUm: 600_000, rotationUdeg: 0 },
      defaultConfig,
    );
    expect(snap).not.toBeNull();
    expect(Math.abs(snap!.center.x - 6_731_672)).toBeLessThanOrEqual(1);
    expect(Math.abs(snap!.center.y - 3_865_836)).toBeLessThanOrEqual(1);
    expect(snap!.rotationUdeg).toBe(116_565_051);
    expect(snap!.wallIndex).toBe(2);
  });
});

describe('snapBackToBack: hand cases', () => {
  // Partner 'p': wall shelf 1200 x 400 mm at (3000, 2000), rotation 0; back edge y = 1800, x 2400..3600.
  const partnerDoc = makeDoc(rectRoom(20000, 20000), [testWallShelf, testTower], [place('p', testWallShelf, 3000, 2000, 0)]);
  const partners = placedFixtures(partnerDoc, defaultConfig);
  const rect = (product: Product, xMm: number, yMm: number, rotationUdeg: number) => ({
    center: { x: mm(xMm), y: mm(yMm) },
    widthUm: product.variants[0]!.widthUm as number,
    depthUm: product.variants[0]!.depthUm as number,
    rotationUdeg,
  });

  it('a shelf 100 mm away back to back: back on the line, centred on the partner', () => {
    // Mover back at 1500 + 200 = 1700; moves 100 mm to 1800: centre y = 1800 - 200 = 1600.
    expect(snapBackToBack(rect(testWallShelf, 3100, 1500, 180_000_000), partners, defaultConfig)).toEqual({
      center: { x: 3_000_000, y: 1_600_000 },
      rotationUdeg: 180_000_000,
      partnerId: 'p',
    });
  });

  it('a narrower tower slides along the back line to stay covered (2700..3300)', () => {
    // Centre x 3400 clamps to 3600 - 300 = 3300; back at 1700 -> centre y 1800 - 300 = 1500.
    expect(snapBackToBack(rect(testTower, 3400, 1400, 180_000_000), partners, defaultConfig)).toEqual({
      center: { x: 3_300_000, y: 1_500_000 },
      rotationUdeg: 180_000_000,
      partnerId: 'p',
    });
  });

  it('a rotation within 45 degrees turns to exactly partner + 180 degrees', () => {
    const r = snapBackToBack(rect(testWallShelf, 3100, 1500, 170_000_000), partners, defaultConfig);
    expect(r).not.toBeNull();
    expect(r!.rotationUdeg).toBe(180_000_000);
  });

  it('a unit facing the same way is not a partner', () => {
    expect(snapBackToBack(rect(testWallShelf, 3100, 1500, 0), partners, defaultConfig)).toBeNull();
  });

  it('a unit whose back is 400 mm from the partner back line is too far', () => {
    // Facing down (rotation 180), the back of the 400 mm deep shelf at centre y 1200 is at 1400; the line is 1800.
    expect(snapBackToBack(rect(testWallShelf, 3100, 1200, 180_000_000), partners, defaultConfig)).toBeNull();
  });

  it('a double-sided or freestanding fixture is not a partner', () => {
    const island = { ...testWallShelf, id: 'test-island', placement: 'island' as const };
    const doc = makeDoc(rectRoom(20000, 20000), [island], [{ ...place('i', island, 3000, 2000, 0), productId: 'test-island' }]);
    expect(snapBackToBack(rect(testWallShelf, 3100, 1500, 180_000_000), placedFixtures(doc, defaultConfig), defaultConfig)).toBeNull();
  });

  it('the nearest partner wins; a tie goes to the lowest placement id', () => {
    // 'a' and 'b' have back lines at y = 1800 and y = 1900 (shelves at y 2000 and 2100); mover (centre y 1680) back at 1880.
    // Gap to 'b' (20) is smaller than to 'a' (80).
    const doc = makeDoc(rectRoom(20000, 20000), [testWallShelf], [
      place('b', testWallShelf, 3000, 2100, 0),
      place('a', testWallShelf, 3000, 2000, 0),
    ]);
    const near = snapBackToBack(rect(testWallShelf, 3000, 1680, 180_000_000), placedFixtures(doc, defaultConfig), defaultConfig);
    expect(near?.partnerId).toBe('b');
    // Two partners at the same gap: the same pose of the line, so the lowest id.
    const tie = makeDoc(rectRoom(20000, 20000), [testWallShelf], [
      place('z', testWallShelf, 3000, 2000, 0),
      place('m', testWallShelf, 3000, 2000, 0),
    ]);
    const t = snapBackToBack(rect(testWallShelf, 3000, 1600, 180_000_000), placedFixtures(tie, defaultConfig), defaultConfig);
    expect(t?.partnerId).toBe('m');
  });
});

describe('snapBackToBack: property', () => {
  it('every snapped mover no wider than the partner is back to back (no wall-unit-not-on-wall)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: FULL - 1 }),
        fc.integer({ min: 200, max: 1200 }),
        fc.integer({ min: 100, max: 900 }),
        fc.integer({ min: -1500, max: 1500 }),
        fc.integer({ min: -1500, max: 1500 }),
        fc.integer({ min: -45_000_000, max: 45_000_000 }),
        (partnerRot, wMm, dMm, dx, dy, turn) => {
          const mover = wallUnit(wMm, dMm);
          const room = rectRoom(20000, 20000);
          const partnerCenter = { x: 10_000_000, y: 10_000_000 };
          const partnerOnly = makeDoc(room, [testWallShelf], [placement('a', testWallShelf, partnerCenter, partnerRot)]);
          const moverRot = (((partnerRot + 180_000_000 + turn) % FULL) + FULL) % FULL;
          const center = { x: partnerCenter.x + mm(dx), y: partnerCenter.y + mm(dy) };
          const snap = snapBackToBack(
            { center, widthUm: mm(wMm), depthUm: mm(dMm), rotationUdeg: moverRot },
            placedFixtures(partnerOnly, defaultConfig),
            defaultConfig,
          );
          if (snap === null) return;
          const both = makeDoc(room, [testWallShelf, mover], [
            placement('a', testWallShelf, partnerCenter, partnerRot),
            placement('b', mover, snap.center, snap.rotationUdeg),
          ]);
          const bad = validateLayout(both, defaultConfig).filter(
            (v) => v.rule === 'wall-unit-not-on-wall' && v.placementIds.includes('b'),
          );
          expect(bad).toEqual([]);
        },
      ),
      { seed: 20261111, numRuns: 300 },
    );
  });
});
