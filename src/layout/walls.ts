/** Poses along walls, the entrance, and phase b: single-sided units along walls. */
import type { Room } from '../core/index';
import type { Point, Vec, WallSegment } from '../geometry/index';
import { entranceOf, openingBand } from '../rules/index';
import type { WallOrder } from './types';
import { bigFirst, cloneState, dist, isShowcase, mid, note, q, round, STEP_UM, tryPlaceGroup } from './state';
import type { Pose, State, Unit, UnitGroup } from './state';

/** Pose with the back parallel to `wall`, `gapUm` away from it, centred `alongUm` along it. */
export function poseAtWall(wall: WallSegment, unit: Unit, alongUm: number, gapUm: number): Pose {
  const off = gapUm + unit.depthUm / 2;
  return {
    center: {
      x: round(wall.start.x + wall.direction.x * alongUm + wall.inwardNormal.x * off),
      y: round(wall.start.y + wall.direction.y * alongUm + wall.inwardNormal.y * off),
    },
    rotationUdeg: wall.angleUdeg,
  };
}

/** Positions along a wall worth trying for something this wide: a grid, plus every spot flush with something. */
export function wallStops(state: State, wall: WallSegment, widthUm: number): number[] {
  const lo = widthUm / 2;
  const hi = wall.lengthUm - widthUm / 2;
  if (hi < lo) return [];
  const stops = new Set<number>();
  for (let t = lo; t <= hi; t += STEP_UM) stops.add(round(t));
  stops.add(round(hi));
  const along = (p: Point): number => (p.x - wall.start.x) * wall.direction.x + (p.y - wall.start.y) * wall.direction.y;
  const edges: number[] = [];
  for (const p of state.placed) for (const c of p.corners) edges.push(along(c));
  for (const z of state.keepClear) for (const c of z.polygon) edges.push(along(c));
  for (const o of state.room.openings) {
    if (o.wallIndex === wall.index) edges.push(o.offsetUm, o.offsetUm + o.widthUm);
  }
  for (const e of edges) {
    for (const t of [e + widthUm / 2, e - widthUm / 2]) if (t >= lo && t <= hi) stops.add(round(t));
  }
  return [...stops].sort((a, b) => a - b);
}

export type Entrance = { point: Point; normal: Vec; wallIndex: number };

export function entranceInfo(room: Room, walls: readonly WallSegment[]): Entrance {
  const opening = entranceOf(room)!; // validateRoom guarantees an entrance on a real wall
  const band = openingBand(room, opening, 0)!;
  const wall = walls[opening.wallIndex]!;
  return {
    point: { x: round((band[0]!.x + band[1]!.x) / 2), y: round((band[0]!.y + band[1]!.y) / 2) },
    normal: wall.inwardNormal,
    wallIndex: wall.index,
  };
}

/** Back flush against a wall, walls tried in the given order, first free spot along each. */
export function placeOnWalls(state: State, unit: Unit, order: readonly WallSegment[]): boolean {
  let anyLongEnough = false;
  for (const wall of order) {
    const stops = wallStops(state, wall, unit.widthUm);
    if (stops.length > 0) anyLongEnough = true;
    for (const t of stops) if (tryPlaceGroup(state, [{ unit, pose: poseAtWall(wall, unit, t, 0) }], null) !== null) return true;
  }
  if (!anyLongEnough) note(state, unit, 'no-wall-long-enough');
  return false;
}

/** Phase b: showcases that did not join the block, then every single-sided unit, along walls. */
export function wallPhase(before: State, units: readonly UnitGroup[], order: WallOrder): State {
  const state = cloneState(before);
  const entrance = entranceInfo(state.room, state.walls);
  const counter = state.cashWrap.find((p) => p.product.placement === 'counter');
  const anchor = counter?.rect.center ?? entrance.point;
  const byDistance = (from: Point, sign: number) => (a: WallSegment, b: WallSegment): number =>
    sign * (q(dist(mid(a), from)) - q(dist(mid(b), from))) || a.index - b.index;
  const nearAnchor = [...state.walls].sort(byDistance(anchor, 1));
  const walls = [...state.walls].sort(byDistance(entrance.point, order === 'back-first' ? -1 : 1));
  const fill = (test: (u: Unit) => boolean, wallOrder: readonly WallSegment[]): void => {
    for (const { unit } of units.filter((g) => test(g.unit)).sort(bigFirst)) {
      while ((state.left.get(unit.key) ?? 0) > 0) if (!placeOnWalls(state, unit, wallOrder)) break;
    }
  };
  fill(isShowcase, nearAnchor);
  fill((u) => u.product.placement === 'wall' && u.product.category === 'showcase', nearAnchor);
  fill((u) => u.product.placement === 'wall' && u.product.category !== 'showcase', walls);
  state.base = { placed: [...state.placed], impossible: new Map() };
  return state;
}
