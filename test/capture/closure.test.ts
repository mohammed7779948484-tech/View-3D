import { describe, expect, it } from "vitest";
import { checkClosure, type CapturedWall } from "../../src/capture/index";

const DEG = 1_000_000;

const L_WALLS: CapturedWall[] = [
  { lengthUm: 9_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 4_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 3_000_000, cornerAngleUdeg: 270 * DEG },
  { lengthUm: 3_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 6_000_000, cornerAngleUdeg: 90 * DEG },
  { lengthUm: 7_000_000, cornerAngleUdeg: 90 * DEG },
];

const ANGLED_WALLS: CapturedWall[] = [
  { lengthUm: 8_000_000, cornerAngleUdeg: 90_000_000 },
  { lengthUm: 2_000_000, cornerAngleUdeg: 153_434_949 },
  { lengthUm: 4_472_136, cornerAngleUdeg: 116_565_051 },
  { lengthUm: 6_000_000, cornerAngleUdeg: 90_000_000 },
  { lengthUm: 6_000_000, cornerAngleUdeg: 90_000_000 },
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

describe("checkClosure", () => {
  it("an exact L room closes with no gap and no suspects", () => {
    expect(checkClosure(L_WALLS)).toEqual({
      closes: true,
      gapUm: 0,
      angleSumErrorUdeg: 0,
      suspects: [],
    });
  });

  it("wall 4 typed 6 100 000: gap 100 mm, walls 0, 2 and 4 are the suspects", () => {
    // End point is (-100 mm, 0). Walls 0, 2 and 4 all run along x, so any of them fixes it.
    const result = checkClosure(withLength(L_WALLS, 4, 6_100_000));
    expect(result.closes).toBe(false);
    expect(result.gapUm).toBe(100_000);
    expect(result.angleSumErrorUdeg).toBe(0);
    expect(result.suspects).toEqual([
      {
        kind: "wall-length",
        wallIndex: 0,
        correctedLengthUm: 9_100_000,
        changeUm: 100_000,
      },
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

  it("corner 1 typed 95 deg: angle sum off by 5 deg, that corner is the only suspect", () => {
    const result = checkClosure(withAngle(L_WALLS, 1, 95 * DEG));
    expect(result.closes).toBe(false);
    expect(result.angleSumErrorUdeg).toBe(5_000_000);
    // End point about (-314.375, 799.623) mm, so |E| = 859.2022871 mm.
    expect(Math.abs(result.gapUm - 859_202)).toBeLessThanOrEqual(1);
    expect(result.suspects).toEqual([
      {
        kind: "corner-angle",
        cornerIndex: 1,
        correctedAngleUdeg: 90_000_000,
        changeUdeg: -5_000_000,
      },
    ]);
  });

  it("angled room with wall 2 typed 100 mm too long: exactly one suspect, wall 2", () => {
    const result = checkClosure(withLength(ANGLED_WALLS, 2, 4_572_136));
    expect(result.closes).toBe(false);
    expect(result.suspects).toHaveLength(1);
    const s = result.suspects[0]!;
    expect(s.kind).toBe("wall-length");
    if (s.kind !== "wall-length") return;
    expect(s.wallIndex).toBe(2);
    expect(Math.abs(s.correctedLengthUm - 4_472_136)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.changeUm - -100_000)).toBeLessThanOrEqual(1);
  });

  it("a gap inside the 10 mm tolerance still closes, with no suspects", () => {
    const result = checkClosure(withLength(L_WALLS, 4, 6_005_000));
    expect(result.closes).toBe(true);
    expect(result.gapUm).toBe(5_000);
    expect(result.suspects).toEqual([]);
  });

  it("two wrong values: no single fix closes, so no suspects", () => {
    const walls = withLength(withLength(L_WALLS, 0, 9_100_000), 1, 4_100_000);
    const result = checkClosure(walls);
    expect(result.closes).toBe(false);
    expect(result.suspects).toEqual([]);
  });

  it("boundary: gap of exactly 10 000 um closes, 10 001 um does not", () => {
    const at = checkClosure(withLength(L_WALLS, 4, 6_010_000));
    expect(at.gapUm).toBe(10_000);
    expect(at.closes).toBe(true);
    const over = checkClosure(withLength(L_WALLS, 4, 6_010_001));
    expect(over.gapUm).toBe(10_001);
    expect(over.closes).toBe(false);
  });
});
