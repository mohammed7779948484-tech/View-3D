// ---------------------------------------------------------------------------------------------
// Phase a: the checkout block
import type { Point, WallSegment } from '../geometry/index';
import type { LayoutRequest } from './types';
import { bigFirst, dist, freshState, isShowcase, q, tryPlaceGroup } from './state';
import type { Pose, State, Unit, UnitGroup } from './state';
import { entranceInfo, poseAtWall, wallStops } from './walls';
import type { Entrance } from './walls';

/** Units side by side along `wall` from `startUm`, backs `gapUm` from the wall. */
export function lineAlongWall(wall: WallSegment, units: readonly Unit[], startUm: number, gapUm: number): { unit: Unit; pose: Pose }[] {
  let t = startUm;
  return units.map((unit) => {
    const pose = poseAtWall(wall, unit, t + unit.widthUm / 2, gapUm);
    t += unit.widthUm;
    return { unit, pose };
  });
}

export const widthOf = (units: readonly Unit[]): number => units.reduce((n, u) => n + u.widthUm, 0);

/**
 * Counter and showcases as one block parallel to `wall`, staff space behind. Tries a straight
 * block with every showcase first (nearest the entrance wins), then an L-shaped block around a
 * right-angled corner, then the same with one showcase fewer, and so on down to the counter alone.
 */
export function placeCashWrap(state: State, wall: WallSegment, counters: readonly Unit[], showcases: readonly Unit[], entrance: Entrance): boolean {
  const gap = state.config.staffSpaceUm;
  const counter = counters[0]!;
  const counterCentre = (group: readonly { unit: Unit; pose: Pose }[]): Point => group.find((g) => g.unit === counter)!.pose.center;
  const next = state.walls[(wall.index + 1) % state.walls.length]!;
  const prev = state.walls[(wall.index - 1 + state.walls.length) % state.walls.length]!;
  const rightAngle = (a: WallSegment, b: WallSegment): boolean => Math.abs(a.direction.x * b.direction.x + a.direction.y * b.direction.y) < 1e-6;
  // Convex (inside) corners only: the next wall's inward side looks back along this wall.
  const cornerAtEnd = rightAngle(wall, next) && next.inwardNormal.x * wall.direction.x + next.inwardNormal.y * wall.direction.y < 0;
  const cornerAtStart = rightAngle(wall, prev) && prev.inwardNormal.x * wall.direction.x + prev.inwardNormal.y * wall.direction.y > 0;

  for (let n = showcases.length; n >= 0; n--) {
    const used = showcases.slice(0, n);
    const candidates: { group: { unit: Unit; pose: Pose }[]; shape: number; order: number; t: number }[] = [];

    // Straight block: the counter at one end, showcases continuing along the wall.
    const orders = n === 0 ? [[...counters]] : [[...counters, ...used], [...used, ...counters]];
    orders.forEach((order, o) => {
      const total = widthOf(order);
      for (const t of wallStops(state, wall, total)) candidates.push({ group: lineAlongWall(wall, order, t - total / 2, gap), shape: 0, order: o, t });
    });

    // L-shaped block around a corner: one leg on this wall ending flush at the other leg's front.
    if (n >= 1) {
      for (let onOther = 1; onOther <= n; onOther++) {
        const legOther = used.slice(n - onOther);
        const legHere = [...counters, ...used.slice(0, n - onOther)];
        const depthOther = Math.max(...legOther.map((u) => u.depthUm));
        const total = widthOf(legHere);
        const lineOrders = [legHere, [...legHere].reverse()];
        if (cornerAtEnd) {
          const start = wall.lengthUm - gap - depthOther - total;
          const depthHere = Math.max(...legHere.map((u) => u.depthUm));
          void depthHere;
          lineOrders.forEach((order, o) => {
            if (start < 0 || gap + widthOf(legOther) > next.lengthUm) return;
            candidates.push({ group: [...lineAlongWall(wall, order, start, gap), ...lineAlongWall(next, legOther, gap, gap)], shape: 1, order: o, t: start });
          });
        }
        if (cornerAtStart) {
          const start = gap + depthOther;
          const otherStart = prev.lengthUm - gap - widthOf(legOther);
          lineOrders.forEach((order, o) => {
            if (start + total > wall.lengthUm || otherStart < 0) return;
            candidates.push({ group: [...lineAlongWall(wall, order, start, gap), ...lineAlongWall(prev, [...legOther].reverse(), otherStart, gap)], shape: 1, order: o, t: start });
          });
        }
      }
    }

    candidates.sort(
      (a, b) =>
        a.shape - b.shape ||
        q(dist(counterCentre(a.group), entrance.point)) - q(dist(counterCentre(b.group), entrance.point)) ||
        a.order - b.order ||
        a.t - b.t,
    );
    for (const c of candidates) {
      const placed = tryPlaceGroup(state, c.group, null);
      if (placed !== null) {
        state.cashWrap = placed;
        return true;
      }
    }
  }
  return false;
}

/** Phase a for one counter wall. Returns the state after it (or with nothing placed when there is no counter). */
export function cashWrapPhase(request: LayoutRequest, units: readonly UnitGroup[], counterWall: number | null): State {
  const state = freshState(request, units);
  if (counterWall === null) return state;
  const entrance = entranceInfo(state.room, state.walls);
  const expand = (test: (u: Unit) => boolean): Unit[] =>
    units.filter((g) => test(g.unit)).sort(bigFirst).flatMap((g) => Array.from({ length: g.quantity }, () => g.unit));
  const counters = expand((u) => u.product.placement === 'counter');
  if (counters.length === 0) return state;
  placeCashWrap(state, state.walls[counterWall]!, counters, expand(isShowcase), entrance);
  return state;
}
