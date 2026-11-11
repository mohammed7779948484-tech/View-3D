/** Turning a fixture by hand: quarter turns that line up with the nearest wall, whatever its angle. */
import type { Point, Room } from '../core/index';
import { distancePointToSegment, wallSegments } from '../geometry/index';

const QUARTER_TURN_UDEG = 90_000_000;
const FULL_TURN_UDEG = 360_000_000;

/**
 * The next rotation, counter-clockwise, among the four that are parallel or square to the wall
 * nearest `center` (on a tie, the wall with the lowest index). Four turns come back to the start.
 */
export function quarterTurn(room: Room, center: Point, rotationUdeg: number): number {
  let nearest: { distance: number; angleUdeg: number } | null = null;
  for (const wall of wallSegments(room.outline)) {
    const distance = distancePointToSegment(center, wall.start, wall.end);
    if (nearest === null || distance < nearest.distance) nearest = { distance, angleUdeg: wall.angleUdeg };
  }
  if (nearest === null) throw new RangeError('quarterTurn: the room has no walls');
  const base = nearest.angleUdeg % QUARTER_TURN_UDEG;
  const current = ((rotationUdeg % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
  const steps = Math.floor((current - base) / QUARTER_TURN_UDEG) + 1;
  return (((base + steps * QUARTER_TURN_UDEG) % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
}
