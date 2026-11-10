import { describe, expect, it } from 'vitest';
import {
  area2,
  distancePointToSegment,
  doorSwingZone,
  isCounterClockwise,
  isSimplePolygon,
  openingSegment,
  pointInPolygon,
  wallSegments,
  type DoorOpening,
  type Point,
} from '../../src/geometry/index.js';
import { ANGLED_ROOM, ANGLED_WALL_INDEX, L_ROOM, M, MM } from './rooms.js';

const P = (x: number, y: number): Point => ({ x, y });

describe('openingSegment', () => {
  it('on an axis-aligned wall: exact end points and inward normal', () => {
    expect(openingSegment(L_ROOM, 0, 2 * M, 900 * MM)).toEqual({
      wallIndex: 0,
      start: P(2 * M, 0),
      end: P(2_900_000, 0),
      inwardNormal: { x: 0, y: 1 },
    });
    // Wall 4 runs right-to-left along the top: offsets are measured from the wall's start corner.
    expect(openingSegment(L_ROOM, 4, 1 * M, 900 * MM)).toEqual({
      wallIndex: 4,
      start: P(5 * M, 7 * M),
      end: P(4_100_000, 7 * M),
      inwardNormal: { x: 0, y: -1 },
    });
  });

  it('on the angled wall: end points on the wall within 1 um, the right distance apart', () => {
    const wall = wallSegments(ANGLED_ROOM)[ANGLED_WALL_INDEX]!;
    const o = openingSegment(ANGLED_ROOM, ANGLED_WALL_INDEX, 1 * M, 900 * MM)!;
    expect(distancePointToSegment(o.start, wall.start, wall.end)).toBeLessThanOrEqual(1);
    expect(distancePointToSegment(o.end, wall.start, wall.end)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.hypot(o.end.x - o.start.x, o.end.y - o.start.y) - 900 * MM)).toBeLessThanOrEqual(2);
    expect(Math.abs(Math.hypot(o.start.x - wall.start.x, o.start.y - wall.start.y) - 1 * M)).toBeLessThanOrEqual(1);
    expect(o.inwardNormal).toEqual(wall.inwardNormal);
    expect(o.start).toEqual(P(7_552_786, 2_894_427));
  });

  it('an opening that does not fit on the wall, or a wall that does not exist, gives null', () => {
    expect(openingSegment(L_ROOM, 2, 2_500_000, 900 * MM)).toBeNull(); // wall 2 is 3 m long
    expect(openingSegment(L_ROOM, 2, 2_100_000, 900 * MM)).not.toBeNull(); // ends exactly at the corner
    expect(openingSegment(L_ROOM, 0, -1, 900 * MM)).toBeNull();
    expect(openingSegment(L_ROOM, 0, 0, 0)).toBeNull();
    expect(openingSegment(L_ROOM, 6, 0, 900 * MM)).toBeNull();
    expect(openingSegment(L_ROOM, -1, 0, 900 * MM)).toBeNull();
    expect(openingSegment(L_ROOM, 0.5, 0, 900 * MM)).toBeNull();
  });
});

describe('doorSwingZone', () => {
  const door = (over: Partial<DoorOpening> = {}): DoorOpening => ({
    wallIndex: 0,
    offsetUm: 2 * M,
    widthUm: 900 * MM,
    swing: 'in',
    hinge: 'start',
    ...over,
  });

  /** Points of the true quarter circle, every degree, rounded to um. */
  function trueArc(pivot: Point, from: { x: number; y: number }, to: { x: number; y: number }, r: number): Point[] {
    const pts: Point[] = [];
    for (let deg = 0; deg <= 90; deg++) {
      const t = (deg * Math.PI) / 180;
      pts.push(P(Math.round(pivot.x + r * (from.x * Math.cos(t) + to.x * Math.sin(t))), Math.round(pivot.y + r * (from.y * Math.cos(t) + to.y * Math.sin(t)))));
    }
    return pts;
  }

  it("'out' and 'none' have no swing zone inside the room", () => {
    expect(doorSwingZone(L_ROOM, door({ swing: 'out' }))).toBeNull();
    expect(doorSwingZone(L_ROOM, door({ swing: 'none' }))).toBeNull();
    expect(doorSwingZone(L_ROOM, door({ wallIndex: 9 }))).toBeNull();
  });

  it('hinge at start: contains the hinge, the closed leaf, the open leaf and every true arc point', () => {
    const zone = doorSwingZone(L_ROOM, door())!;
    expect(isSimplePolygon(zone)).toBe(true);
    expect(isCounterClockwise(zone)).toBe(true);
    for (const p of zone) expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    const pivot = P(2 * M, 0);
    expect(pointInPolygon(pivot, zone)).not.toBe('outside');
    expect(pointInPolygon(P(2_900_000, 0), zone)).not.toBe('outside'); // closed leaf tip
    expect(pointInPolygon(P(2 * M, 900 * MM), zone)).not.toBe('outside'); // fully open leaf tip
    for (const p of trueArc(pivot, { x: 1, y: 0 }, { x: 0, y: 1 }, 900 * MM)) {
      expect(pointInPolygon(p, zone)).not.toBe('outside');
    }
    // The leaf itself at 45 degrees, halfway along.
    expect(pointInPolygon(P(2 * M + 318_198, 318_198), zone)).toBe('inside');
  });

  it('is a tight approximation: at most 1 % larger than the true quarter circle, never smaller', () => {
    const zone = doorSwingZone(L_ROOM, door())!;
    const trueArea = (Math.PI * (900 * MM) ** 2) / 4;
    const got = Number(area2(zone)) / 2;
    expect(got).toBeGreaterThanOrEqual(trueArea);
    expect(got).toBeLessThan(trueArea * 1.01);
    // Nothing sticks out more than 5 mm beyond the door radius, and nothing more than the 2 um
    // safety pad behind the wall line.
    for (const p of zone) {
      expect(Math.hypot(p.x - 2 * M, p.y)).toBeLessThanOrEqual(900 * MM + 5 * MM);
      expect(p.y).toBeGreaterThanOrEqual(-2);
    }
    expect(zone.length).toBeLessThanOrEqual(12);
  });

  it('hinge at end: mirrored, pivoting about the other jamb', () => {
    const zone = doorSwingZone(L_ROOM, door({ hinge: 'end' }))!;
    expect(isSimplePolygon(zone)).toBe(true);
    expect(isCounterClockwise(zone)).toBe(true);
    const pivot = P(2_900_000, 0);
    for (const p of trueArc(pivot, { x: -1, y: 0 }, { x: 0, y: 1 }, 900 * MM)) {
      expect(pointInPolygon(p, zone)).not.toBe('outside');
    }
    expect(pointInPolygon(P(2_900_000 + 10 * MM, 100 * MM), zone)).toBe('outside'); // other side of the hinge
    expect(pointInPolygon(P(2 * M + 50 * MM, 800 * MM), zone)).toBe('outside'); // beyond the arc, in the far corner
  });

  it('on the angled wall: swings into the room and covers the true arc', () => {
    const wall = wallSegments(ANGLED_ROOM)[ANGLED_WALL_INDEX]!;
    for (const hinge of ['start', 'end'] as const) {
      const params = door({ wallIndex: ANGLED_WALL_INDEX, offsetUm: 1 * M, hinge });
      const zone = doorSwingZone(ANGLED_ROOM, params)!;
      const o = openingSegment(ANGLED_ROOM, ANGLED_WALL_INDEX, 1 * M, 900 * MM)!;
      const pivot = hinge === 'start' ? o.start : o.end;
      const from = hinge === 'start' ? wall.direction : { x: -wall.direction.x, y: -wall.direction.y };
      expect(isSimplePolygon(zone)).toBe(true);
      expect(isCounterClockwise(zone)).toBe(true);
      for (const p of trueArc(pivot, from, wall.inwardNormal, 900 * MM)) {
        expect(pointInPolygon(p, zone)).not.toBe('outside');
      }
      // The fully open leaf tip is inside the room.
      const tip = P(Math.round(pivot.x + wall.inwardNormal.x * 899 * MM), Math.round(pivot.y + wall.inwardNormal.y * 899 * MM));
      expect(pointInPolygon(tip, ANGLED_ROOM)).toBe('inside');
      expect(pointInPolygon(tip, zone)).not.toBe('outside');
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(doorSwingZone(ANGLED_ROOM, door({ wallIndex: 2, offsetUm: 1 * M })))).toBe(
      JSON.stringify(doorSwingZone(ANGLED_ROOM, door({ wallIndex: 2, offsetUm: 1 * M }))),
    );
  });
});
