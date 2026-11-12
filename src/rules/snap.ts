/** Turning a fixture by hand: quarter turns that line up with the nearest wall, whatever its angle. */
import type { Point, Room } from '../core/index';
import { distancePointToSegment, wallSegments } from '../geometry/index';
import type { OrientedRect } from '../geometry/index';
import type { PlanningConfig } from './config';
import { backIsCovered } from './validate';
import type { PlacedFixture } from './validate';

const QUARTER_TURN_UDEG = 90_000_000;
const HALF_TURN_UDEG = 180_000_000;
/** A unit turned less than this from facing its partner still counts as back to back. */
const BACK_TO_BACK_TURN_UDEG = 45_000_000;
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

const radians = (udeg: number): number => (udeg / 1_000_000) * (Math.PI / 180);
const norm = (udeg: number): number => ((udeg % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;

export type BackToBackSnap = { center: Point; rotationUdeg: number; partnerId: string };

/**
 * Back to back with another single-sided unit: when `rect` faces roughly away from a partner
 * (within 45 degrees) and its back is within the snap distance of the partner's back, it turns to
 * face exactly away, puts its back on the partner's back, and slides along it only as far as the
 * partner's back still covers its own (a wider unit is centred). Only a partner it overlaps along
 * the partner's back, and whose back is not already covered. Nearest partner; tie: lowest id.
 */
export function snapBackToBack(rect: OrientedRect, fixtures: readonly PlacedFixture[], config: PlanningConfig): BackToBackSnap | null {
  const moverBackDir = { x: Math.sin(radians(rect.rotationUdeg)), y: -Math.cos(radians(rect.rotationUdeg)) };
  const moverBack = { x: rect.center.x + (moverBackDir.x * rect.depthUm) / 2, y: rect.center.y + (moverBackDir.y * rect.depthUm) / 2 };
  let best: (BackToBackSnap & { gap: number }) | null = null;
  const partners = fixtures.filter((f) => f.product.placement === 'wall').sort((a, b) => (a.placement.id < b.placement.id ? -1 : a.placement.id > b.placement.id ? 1 : 0));
  for (const f of partners) {
    const target = norm(f.rect.rotationUdeg + HALF_TURN_UDEG);
    const off = norm(rect.rotationUdeg - target);
    if (Math.min(off, FULL_TURN_UDEG - off) > BACK_TO_BACK_TURN_UDEG) continue;
    const theta = radians(f.rect.rotationUdeg);
    const back = { x: Math.sin(theta), y: -Math.cos(theta) }; // the partner's back, outward
    const along = { x: Math.cos(theta), y: Math.sin(theta) };
    const c = f.rect.center;
    const half = f.rect.depthUm / 2;
    const gap = Math.abs((moverBack.x - c.x) * back.x + (moverBack.y - c.y) * back.y - half);
    if (gap > config.wallSnapDistanceUm || (best !== null && gap >= best.gap)) continue;
    const offset = (rect.center.x - c.x) * along.x + (rect.center.y - c.y) * along.y;
    if (Math.abs(offset) >= (f.rect.widthUm + rect.widthUm) / 2 || backIsCovered(f, fixtures, config)) continue;
    const slack = (f.rect.widthUm - rect.widthUm) / 2;
    const s = slack >= 0 ? Math.min(Math.max(offset, -slack), slack) : 0;
    const out = half + rect.depthUm / 2;
    best = {
      center: { x: Math.round(c.x + back.x * out + along.x * s) || 0, y: Math.round(c.y + back.y * out + along.y * s) || 0 },
      rotationUdeg: target,
      partnerId: f.placement.id,
      gap,
    };
  }
  return best === null ? null : { center: best.center, rotationUdeg: best.rotationUdeg, partnerId: best.partnerId };
}
