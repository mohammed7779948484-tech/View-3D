import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  outlineToWalls,
  wallsToOutline,
  type CapturedWall,
} from "../../src/capture/index";
import { validateRoomOutline } from "../../src/geometry/index";
import type { Point } from "../../src/core/index";
import { angledWall, lShapeWithColumn } from "../fixtures/rooms";

const DEG = 1_000_000; // udeg per degree

/** L room, walls typed in order; metres in um, degrees in udeg. Worked out by hand. */
const L_WALLS: CapturedWall[] = [
  { lengthUm: 9_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 4_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 3_000_000, cornerAngleUdeg: 270 * DEG },
  { lengthUm: 3_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 6_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 7_000_000, cornerAngleUdeg: 90 * DEG },
];

/** Angled room. 4 472 135.955 um = sqrt(2000^2 + 4000^2) mm; corners 153.434948823 / 116.565051177 deg. */
const ANGLED_WALLS: CapturedWall[] = [
  { lengthUm: 8_000_000, cornerAngleUdeg: 90_000_000 },
  { lengthUm: 2_000_000, cornerAngleUdeg: 153_434_949 },
  { lengthUm: 4_472_136, cornerAngleUdeg: 116_565_051 },
  { lengthUm: 6_000_000, cornerAngleUdeg: 90_000_000 },
  { lengthUm: 6_000_000, cornerAngleUdeg: 90_000_000 },
];

describe("wallsToOutline", () => {
  it("draws the L room exactly from its walls and corners", () => {
    const result = wallsToOutline(L_WALLS);
    expect(result).toEqual({ ok: true, outline: lShapeWithColumn.outline });
  });

  it("draws the angled room exactly from its walls and corners", () => {
    const result = wallsToOutline(ANGLED_WALLS);
    expect(result).toEqual({ ok: true, outline: angledWall.outline });
  });

  it("is deterministic: the same input gives deep-equal results", () => {
    expect(wallsToOutline(ANGLED_WALLS)).toEqual(wallsToOutline(ANGLED_WALLS));
    expect(wallsToOutline(L_WALLS)).toEqual(wallsToOutline(L_WALLS));
  });
});

describe("outlineToWalls", () => {
  it("reads the L room outline back as the hand-worked walls", () => {
    expect(outlineToWalls(lShapeWithColumn.outline)).toEqual(L_WALLS);
  });

  it("reads the angled room outline back as the hand-worked walls", () => {
    expect(outlineToWalls(angledWall.outline)).toEqual(ANGLED_WALLS);
  });
});

describe("round trip property", () => {
  // Lengths round to 0.5 um and each angle rounds to 0.5 udeg. The heading after k corners
  // can be off by k * 0.5 udeg, which moves a later corner sideways by length * that angle.
  const HALF_UDEG_RAD = (0.5e-6 * Math.PI) / 180;
  const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

  function tol(outline: readonly Point[], m: number): number {
    let sum = 0;
    for (let k = 0; k < m; k++) {
      sum += dist(outline[k]!, outline[k + 1]!) * k * HALF_UDEG_RAD;
    }
    return 1 + 0.5 * m + sum;
  }

  const polygonArb = fc
    .record({
      a: fc.integer({ min: 2_000_000, max: 20_000_000 }),
      h: fc.integer({ min: 2_000_000, max: 10_000_000 }),
      extra: fc.integer({ min: 1, max: 10 }), // 3 to 12 vertices in total
      fractions: fc.array(fc.double({ min: 0.02, max: 0.98, noNaN: true }), {
        minLength: 10,
        maxLength: 10,
      }),
      radii: fc.array(fc.integer({ min: 3_000_000, max: 12_000_000 }), {
        minLength: 10,
        maxLength: 10,
      }),
    })
    .map(({ a, h, extra, fractions, radii }) => {
      const cx = a / 2;
      const cy = h;
      const theta1 = Math.atan2(-h, a / 2); // vertex 1 = (a, 0)
      const theta0 = Math.atan2(-h, -a / 2) + 2 * Math.PI; // vertex 0 = (0, 0)
      const chosen = fractions.slice(0, extra).sort((p, q) => p - q);
      const pts: Point[] = [
        { x: 0, y: 0 },
        { x: a, y: 0 },
      ];
      chosen.forEach((f, i) => {
        const th = theta1 + f * (theta0 - theta1);
        const r = radii[i]!;
        pts.push({
          x: Math.round(cx + r * Math.cos(th)),
          y: Math.round(cy + r * Math.sin(th)),
        });
      });
      return pts;
    });

  it("wallsToOutline(outlineToWalls(P)) stays within the rounding bound of P", () => {
    let checked = 0;
    fc.assert(
      fc.property(polygonArb, (poly) => {
        fc.pre(
          poly.every(
            (p) => Math.abs(p.x) <= 30_000_000 && Math.abs(p.y) <= 30_000_000,
          ),
        );
        fc.pre(validateRoomOutline(poly).length === 0);
        checked++;
        const result = wallsToOutline(outlineToWalls(poly));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.outline).toHaveLength(poly.length);
        for (let m = 0; m < poly.length; m++) {
          expect(dist(result.outline[m]!, poly[m]!)).toBeLessThanOrEqual(
            tol(poly, m),
          );
        }
      }),
      { seed: 20261111, numRuns: 200 },
    );
    expect(checked).toBeGreaterThan(20);
  });

  it("the bound for a 30 m, 12-corner room is under 1 mm", () => {
    // 12 vertices, every wall 30 m: m = 11 is the worst corner.
    const poly: Point[] = Array.from({ length: 12 }, (_, i) => ({
      x: i * 30_000_000,
      y: 0,
    }));
    expect(tol(poly, 11)).toBeLessThan(1000);
  });
});

describe("wallsToOutline bad input is returned as data", () => {
  const withWall = (i: number, patch: Partial<CapturedWall>): CapturedWall[] =>
    L_WALLS.map((w, k) => (k === i ? { ...w, ...patch } : w));

  function problemsOf(walls: readonly CapturedWall[]) {
    const result = wallsToOutline(walls);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected problems");
    for (const p of result.problems)
      expect(p.message.length).toBeGreaterThan(0);
    return result.problems;
  }

  it("fewer than 3 walls: too-few-walls", () => {
    const problems = problemsOf(L_WALLS.slice(0, 2));
    expect(problems.map((p) => p.code)).toContain("too-few-walls");
  });

  it("a length of 0 or negative: wall-length-not-positive with that index", () => {
    for (const bad of [0, -5_000]) {
      const problems = problemsOf(withWall(3, { lengthUm: bad }));
      expect(
        problems
          .filter((p) => p.code === "wall-length-not-positive")
          .map((p) => p.index),
      ).toEqual([3]);
    }
  });

  it("a non-integer length or angle: not-an-integer with that index", () => {
    const a = problemsOf(withWall(2, { lengthUm: 1000.5 }));
    expect(
      a.filter((p) => p.code === "not-an-integer").map((p) => p.index),
    ).toEqual([2]);
    const b = problemsOf(withWall(4, { cornerAngleUdeg: 90_000_000.5 }));
    expect(
      b.filter((p) => p.code === "not-an-integer").map((p) => p.index),
    ).toEqual([4]);
  });

  it("an angle of 0, 360 deg or more, or negative: corner-angle-out-of-range with that index", () => {
    for (const bad of [0, 360_000_000, 400_000_000, -90_000_000]) {
      const problems = problemsOf(withWall(1, { cornerAngleUdeg: bad }));
      expect(
        problems
          .filter((p) => p.code === "corner-angle-out-of-range")
          .map((p) => p.index),
      ).toEqual([1]);
    }
  });
});
