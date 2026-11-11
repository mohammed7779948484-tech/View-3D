/** Issue M3-2: rotate in 90-degree steps relative to the nearest wall. Expected values worked out by hand. */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Room } from '../../src/core/index';
import { quarterTurn } from '../../src/rules/index';
import { angledWall, protectedDoorway } from '../fixtures/rooms';

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
