import { describe, expect, it } from "vitest";
import {
  checkClosure,
  checkDiagonal,
  sanityWarnings,
  suspectsMatchingDiagonal,
  wallsToOutline,
  type CapturedWall,
} from "../../src/capture/index";
import { lShapeWithColumn } from "../fixtures/rooms";

const DEG = 1_000_000;

const L_WALLS: CapturedWall[] = [
  { lengthUm: 9_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 4_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 3_000_000, cornerAngleUdeg: 270 * DEG },
  { lengthUm: 3_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 6_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 7_000_000, cornerAngleUdeg: 90 * DEG },
];
const withLength = (
  walls: CapturedWall[],
  i: number,
  lengthUm: number,
): CapturedWall[] => walls.map((w, k) => (k === i ? { ...w, lengthUm } : w));
const withAngle = (
  walls: CapturedWall[],
  i: number,
  cornerAngleUdeg: number,
): CapturedWall[] =>
  walls.map((w, k) => (k === i ? { ...w, cornerAngleUdeg } : w));

describe("checkDiagonal", () => {
  const outline = lShapeWithColumn.outline;

  it("corner 0 to corner 4 is 9 219 544 um; 9 220 000 measured is ok", () => {
    // (0,0) to (6 m, 7 m): sqrt(85 000 000) mm = 9219.544457 mm.
    expect(
      checkDiagonal(outline, {
        fromCorner: 0,
        toCorner: 4,
        measuredUm: 9_220_000,
      }),
    ).toEqual({
      ok: true,
      computedUm: 9_219_544,
      differenceUm: 456,
    });
  });

  it("a measurement 100 mm too long is not ok", () => {
    expect(
      checkDiagonal(outline, {
        fromCorner: 0,
        toCorner: 4,
        measuredUm: 9_320_000,
      }),
    ).toEqual({
      ok: false,
      computedUm: 9_219_544,
      differenceUm: 100_456,
    });
  });

  it("boundary: a difference of exactly 20 000 um is ok, 20 001 is not", () => {
    const at = checkDiagonal(outline, {
      fromCorner: 0,
      toCorner: 4,
      measuredUm: 9_239_544,
    });
    expect(at.differenceUm).toBe(20_000);
    expect(at.ok).toBe(true);
    const over = checkDiagonal(outline, {
      fromCorner: 0,
      toCorner: 4,
      measuredUm: 9_239_545,
    });
    expect(over.differenceUm).toBe(20_001);
    expect(over.ok).toBe(false);
  });
});

describe("suspectsMatchingDiagonal", () => {
  const typed = withLength(L_WALLS, 4, 6_100_000);

  it("a diagonal from corner 0 to corner 3 picks wall 4 out of walls 0, 2 and 4", () => {
    // True corner 3 is (6 m, 4 m), sqrt(52 000 000) mm = 7211.103 mm. Fixing wall 0 or 2
    // instead puts it at (6.1 m, 4 m): 7294.518 mm, 83.5 mm off, rejected.
    const { suspects } = checkClosure(typed);
    expect(suspects).toHaveLength(3);
    const diagonal = { fromCorner: 0, toCorner: 3, measuredUm: 7_211_000 };
    expect(suspectsMatchingDiagonal(typed, suspects, diagonal)).toEqual([
      {
        kind: "wall-length",
        wallIndex: 4,
        correctedLengthUm: 6_000_000,
        changeUm: -100_000,
      },
    ]);
  });

  it("a diagonal from corner 1 to corner 5 cannot tell walls 2 and 4 apart", () => {
    // (9 m, 0) to (0, 7 m): sqrt(130 000 000) mm = 11 401.754 mm. Wall 0's fix gives 11 480.854 mm.
    const { suspects } = checkClosure(typed);
    const diagonal = { fromCorner: 1, toCorner: 5, measuredUm: 11_401_754 };
    expect(suspectsMatchingDiagonal(typed, suspects, diagonal)).toEqual([
      {
        kind: "wall-length",
        wallIndex: 2,
        correctedLengthUm: 2_900_000,
        changeUm: -100_000,
      },
      {
        kind: "wall-length",
        wallIndex: 4,
        correctedLengthUm: 6_000_000,
        changeUm: -100_000,
      },
    ]);
  });

  it("the corrected walls draw the real L room", () => {
    const fixed = wallsToOutline(withLength(typed, 4, 6_000_000));
    expect(fixed).toEqual({ ok: true, outline: lShapeWithColumn.outline });
  });
});

describe("sanityWarnings", () => {
  it("the L room gives no warnings", () => {
    expect(sanityWarnings(L_WALLS)).toEqual([]);
  });

  it("a 30 mm wall warns, naming wall 3 for index 2", () => {
    const w = sanityWarnings(withLength(L_WALLS, 2, 30_000));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ code: "wall-very-short", index: 2 });
    expect(w[0]!.message).toMatch(/\b3\b/);
  });

  it("a 40 m wall warns, naming wall 1 for index 0", () => {
    const w = sanityWarnings(withLength(L_WALLS, 0, 40_000_000));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ code: "wall-very-long", index: 0 });
    expect(w[0]!.message).toMatch(/\b1\b/);
  });

  it("a 2 deg corner and a 358 deg corner warn, naming corner 2 and corner 4", () => {
    const sharp = sanityWarnings(withAngle(L_WALLS, 1, 2 * DEG));
    expect(sharp).toHaveLength(1);
    expect(sharp[0]).toMatchObject({ code: "corner-very-sharp", index: 1 });
    expect(sharp[0]!.message).toMatch(/\b2\b/);
    const wide = sanityWarnings(withAngle(L_WALLS, 3, 358 * DEG));
    expect(wide).toHaveLength(1);
    expect(wide[0]).toMatchObject({ code: "corner-very-sharp", index: 3 });
    expect(wide[0]!.message).toMatch(/\b4\b/);
  });

  it("boundaries do not warn: 100 000 um, 30 000 000 um, 15 000 000 udeg, 345 000 000 udeg", () => {
    expect(sanityWarnings(withLength(L_WALLS, 3, 100_000))).toEqual([]);
    expect(sanityWarnings(withLength(L_WALLS, 3, 30_000_000))).toEqual([]);
    expect(sanityWarnings(withAngle(L_WALLS, 3, 15_000_000))).toEqual([]);
    expect(sanityWarnings(withAngle(L_WALLS, 3, 345_000_000))).toEqual([]);
  });

  it("one step past each boundary does warn", () => {
    expect(
      sanityWarnings(withLength(L_WALLS, 3, 99_999)).map((x) => x.code),
    ).toEqual(["wall-very-short"]);
    expect(
      sanityWarnings(withLength(L_WALLS, 3, 30_000_001)).map((x) => x.code),
    ).toEqual(["wall-very-long"]);
    expect(
      sanityWarnings(withAngle(L_WALLS, 3, 14_999_999)).map((x) => x.code),
    ).toEqual(["corner-very-sharp"]);
    expect(
      sanityWarnings(withAngle(L_WALLS, 3, 345_000_001)).map((x) => x.code),
    ).toEqual(["corner-very-sharp"]);
  });

  it("orders warnings by index, wall before corner for the same index; the room need not close", () => {
    const walls = withAngle(
      withLength(withLength(L_WALLS, 0, 40_000_000), 1, 50_000),
      0,
      2 * DEG,
    );
    const w = sanityWarnings(walls);
    expect(w.map((x) => [x.code, x.index])).toEqual([
      ["wall-very-long", 0],
      ["corner-very-sharp", 0],
      ["wall-very-short", 1],
    ]);
  });
});
