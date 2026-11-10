/** Door and opening geometry on a room outline. */
import { wallSegment } from './polygon.js';
import type { Point, Vec } from './types.js';

/** Minimal structural description of an opening; the document schema's opening satisfies it. */
export type DoorOpening = {
  wallIndex: number;
  /** Distance from the wall's start corner to the opening's near jamb, along the wall. */
  offsetUm: number;
  widthUm: number;
  swing: 'in' | 'out' | 'none';
  /** Which jamb carries the hinges: the one nearer the wall's start, or the one nearer its end. */
  hinge: 'start' | 'end';
};

export type OpeningSegment = {
  wallIndex: number;
  /** Jamb nearer the wall's start corner, rounded to integer um. */
  start: Point;
  /** Jamb nearer the wall's end corner, rounded to integer um. */
  end: Point;
  /** Unit vector pointing into the room. */
  inwardNormal: Vec;
};

const roundUm = (v: number): number => Math.round(v) + 0;

/**
 * The two ends of an opening on wall `wallIndex` of a counter-clockwise outline.
 * Returns null when the wall does not exist or the opening does not fit on it
 * (negative offset, non-positive width, or running more than 0.5 um past the wall's end).
 */
export function openingSegment(
  outline: readonly Point[],
  wallIndex: number,
  offsetUm: number,
  widthUm: number,
): OpeningSegment | null {
  const wall = wallSegment(outline, wallIndex);
  if (wall === undefined) return null;
  if (!(offsetUm >= 0) || !(widthUm > 0) || !(offsetUm + widthUm <= wall.lengthUm + 0.5)) return null;
  const at = (t: number): Point => ({
    x: roundUm(wall.start.x + wall.direction.x * t),
    y: roundUm(wall.start.y + wall.direction.y * t),
  });
  return { wallIndex, start: at(offsetUm), end: at(offsetUm + widthUm), inwardNormal: wall.inwardNormal };
}

/** Number of tangent segments used to approximate the quarter-circle arc. */
export const DOOR_ARC_SEGMENTS = 8;
/** The zone is grown by this much on every side so that rounding to integer um never makes it smaller than reality. */
export const DOOR_ZONE_PAD_UM = 2;

/**
 * Floor area swept by a door leaf as wide as the opening, hinged at one jamb and swinging 90
 * degrees into the room. Returns a counter-clockwise polygon starting at the hinge, or null for
 * swing 'out' / 'none' or an opening that does not fit its wall.
 *
 * The arc is replaced by DOOR_ARC_SEGMENTS + 1 straight pieces that are TANGENT to the true arc
 * (they circumscribe it), and everything is padded by DOOR_ZONE_PAD_UM, so the zone always
 * contains the real swept area: about 0.3 % larger in area, at most about 0.5 % beyond the radius.
 * The zone is not clipped to the room.
 */
export function doorSwingZone(outline: readonly Point[], opening: DoorOpening): Point[] | null {
  if (opening.swing !== 'in') return null;
  const seg = openingSegment(outline, opening.wallIndex, opening.offsetUm, opening.widthUm);
  const wall = wallSegment(outline, opening.wallIndex);
  if (seg === null || wall === undefined) return null;

  const hingeAtStart = opening.hinge === 'start';
  const pivot = hingeAtStart ? seg.start : seg.end;
  // The leaf lies along `from` when closed and along `to` when fully open.
  const from: Vec = hingeAtStart ? wall.direction : { x: -wall.direction.x, y: -wall.direction.y };
  const to: Vec = wall.inwardNormal;
  const pad = DOOR_ZONE_PAD_UM;
  const r = opening.widthUm + pad;
  const at = (u: number, v: number): Point => ({
    x: roundUm(pivot.x + from.x * u + to.x * v),
    y: roundUm(pivot.y + from.y * u + to.y * v),
  });

  const step = Math.PI / 2 / DOOR_ARC_SEGMENTS;
  const cornerRadius = r / Math.cos(step / 2); // where neighbouring tangents meet
  const arc: Point[] = [at(r, -pad)];
  for (let k = 0; k < DOOR_ARC_SEGMENTS; k++) {
    const angle = (k + 0.5) * step;
    arc.push(at(cornerRadius * Math.cos(angle), cornerRadius * Math.sin(angle)));
  }
  arc.push(at(-pad, r));
  // from -> to is a left turn when hinged at the start, a right turn when hinged at the end.
  if (!hingeAtStart) arc.reverse();
  return [at(-pad, -pad), ...arc];
}
