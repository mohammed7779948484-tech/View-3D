// ---------------------------------------------------------------------------------------------
// Scoring and measuring
import { pointInPolygon, rectInsidePolygon, rectIntersectsPolygon, rectsOverlap } from '../geometry/index';
import type { OrientedRect } from '../geometry/index';
import { adjacentRect, entranceOf } from '../rules/index';
import type { MeasuredAisle, ScoreTerm } from './types';
import {
  dist,
  EVEN_USE_CELLS,
  EVEN_USE_SAMPLES,
  isShowcase,
  MEASURE_LIMIT_UM,
  MEASURE_PRECISION_UM,
  MEASURE_STEP_UM,
  round,
  VIEW_MARGIN_UM,
} from './state';
import type { Placed, State } from './state';
import { gridRows, spots } from './island-grid';
import type { Frame } from './island-grid';
import type { Entrance } from './walls';

/** Score weights; they add up to 100. First guesses, to be tuned with the owner. */
export const SCORE_WEIGHTS = {
  placed: 45,
  counterNear: 12,
  counterFacing: 8,
  showcasesNear: 10,
  rows: 10,
  evenUse: 10,
  openEntrance: 5,
} as const;

/** Clear distance straight ahead of a rectangle's front (or back) edge, up to the measuring limit. */
export function clearAhead(state: State, rect: OrientedRect, side: 'front' | 'back', ignore: Placed | null, fixtures: readonly Placed[]): number {
  let clear = 0;
  for (let d = MEASURE_STEP_UM; d <= MEASURE_LIMIT_UM; d += MEASURE_STEP_UM) {
    const probe = adjacentRect(rect, side, d);
    if (!rectInsidePolygon(probe, state.room.outline)) break;
    if (state.room.columns.some((c) => rectIntersectsPolygon(probe, c.outline))) break;
    if (fixtures.some((p) => p !== ignore && rectsOverlap(probe, p.rect))) break;
    clear = d;
  }
  if (clear >= MEASURE_LIMIT_UM) return clear;
  // Refine between the last clear step and the first blocked one, to the millimetre.
  const free = (d: number): boolean => {
    const probe = adjacentRect(rect, side, d);
    return (
      rectInsidePolygon(probe, state.room.outline) &&
      !state.room.columns.some((c) => rectIntersectsPolygon(probe, c.outline)) &&
      !fixtures.some((p) => p !== ignore && rectsOverlap(probe, p.rect))
    );
  };
  let lo = clear;
  let hi = clear + MEASURE_STEP_UM;
  while (hi - lo > MEASURE_PRECISION_UM) {
    const midway = Math.round((lo + hi) / 2);
    if (free(midway)) lo = midway;
    else hi = midway;
  }
  return Math.round(lo / MEASURE_PRECISION_UM) * MEASURE_PRECISION_UM;
}

export function measureAisles(state: State, f: Frame): MeasuredAisle[] {
  const out: MeasuredAisle[] = [];
  const add = (p: Placed, kind: MeasuredAisle['kind'], label: string): void => {
    const widthUm = clearAhead(state, p.rect, 'front', p, state.placed);
    if (widthUm === 0) return;
    const edge = adjacentRect(p.rect, 'front', 0).center;
    const far = adjacentRect(p.rect, 'front', widthUm * 2).center; // centre of a 2w-deep rect = w ahead
    out.push({ from: edge, to: far, widthUm, kind, label });
  };
  const counter = state.cashWrap.find((p) => p.product.placement === 'counter');
  if (counter !== undefined) add(counter, 'main', 'clear in front of counter');
  for (const row of gridRows(state, f)) add(row.members[0]!, 'secondary', 'aisle');
  return out;
}

/** Share of the floor cells (a 3 x 3 cut along the grid directions) that hold a fixture. */
export function evenUse(state: State, f: Frame): { value: number; used: number; cells: number } {
  const as = state.room.outline.map((p) => p.x * f.u.x + p.y * f.u.y);
  const bs = state.room.outline.map((p) => p.x * f.v.x + p.y * f.v.y);
  const a0 = Math.min(...as);
  const b0 = Math.min(...bs);
  const da = (Math.max(...as) - a0) / EVEN_USE_CELLS;
  const db = (Math.max(...bs) - b0) / EVEN_USE_CELLS;
  let cells = 0;
  let used = 0;
  for (let i = 0; i < EVEN_USE_CELLS; i++) {
    for (let j = 0; j < EVEN_USE_CELLS; j++) {
      // A cell counts as floor when at least half of its sample points are inside the room.
      let inside = 0;
      for (let s = 0; s < EVEN_USE_SAMPLES; s++) {
        for (let t = 0; t < EVEN_USE_SAMPLES; t++) {
          const a = a0 + (i + (s + 0.5) / EVEN_USE_SAMPLES) * da;
          const b = b0 + (j + (t + 0.5) / EVEN_USE_SAMPLES) * db;
          if (pointInPolygon({ x: round(a * f.u.x + b * f.v.x), y: round(a * f.u.y + b * f.v.y) }, state.room.outline) !== 'outside') inside += 1;
        }
      }
      if (inside * 2 < EVEN_USE_SAMPLES * EVEN_USE_SAMPLES) continue;
      cells += 1;
      const holds = state.placed.some((p) => {
        const a = p.rect.center.x * f.u.x + p.rect.center.y * f.u.y;
        const b = p.rect.center.x * f.v.x + p.rect.center.y * f.v.y;
        return Math.min(EVEN_USE_CELLS - 1, Math.floor((a - a0) / da)) === i && Math.min(EVEN_USE_CELLS - 1, Math.floor((b - b0) / db)) === j;
      });
      if (holds) used += 1;
    }
  }
  return { value: cells === 0 ? 1 : used / cells, used, cells };
}

export function score(state: State, f: Frame, entrance: Entrance, requested: number): ScoreTerm[] {
  const xs = state.room.outline.map((p) => p.x * f.u.x + p.y * f.u.y);
  const ys = state.room.outline.map((p) => p.x * f.v.x + p.y * f.v.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const term = (name: string, weight: number, value: number, text: string): ScoreTerm => ({
    term: name,
    weight,
    value: Math.round(clamp(value) * 1000) / 1000,
    points: Math.round(clamp(value) * weight * 1000) / 1000,
    note: text,
  });
  const mm = (um: number): string => `${Math.round(um / 1000)} mm`;
  const terms: ScoreTerm[] = [];
  const placed = state.placed.length;
  terms.push(term('Fixtures placed', SCORE_WEIGHTS.placed, requested === 0 ? 1 : placed / requested, `${placed} of ${requested} placed`));

  const counter = state.cashWrap.find((p) => p.product.placement === 'counter');
  const counterWanted = state.request.items.some((i) => i.product.placement === 'counter' && i.quantity > 0);
  if (counter === undefined) {
    const value = counterWanted ? 0 : 1;
    const why = counterWanted ? 'no counter could be placed' : 'no counter requested';
    terms.push(term('Counter near the entrance', SCORE_WEIGHTS.counterNear, value, why));
    terms.push(term('Counter faces the entrance', SCORE_WEIGHTS.counterFacing, value, why));
  } else {
    const c = counter.rect.center;
    const d = dist(c, entrance.point);
    terms.push(term('Counter near the entrance', SCORE_WEIGHTS.counterNear, 1 - d / diag, `${mm(d)} from the entrance`));
    const front = adjacentRect(counter.rect, 'front', counter.rect.depthUm).center;
    const fx = front.x - c.x;
    const fy = front.y - c.y;
    const facing = (fx * (entrance.point.x - c.x) + fy * (entrance.point.y - c.y)) / (Math.hypot(fx, fy) * d || 1);
    terms.push(
      term(
        'Counter faces the entrance',
        SCORE_WEIGHTS.counterFacing,
        facing,
        facing > 0.7 ? 'the counter looks at the entrance' : facing > 0.2 ? 'the entrance is to one side of the counter' : 'the counter does not look at the entrance',
      ),
    );
  }

  const showcases = state.placed.filter((p) => isShowcase(p.unit));
  if (showcases.length === 0) {
    terms.push(term('Showcases with the counter', SCORE_WEIGHTS.showcasesNear, 1, 'no glass showcases in this layout'));
  } else {
    const inBlock = showcases.filter((p) => state.cashWrap.includes(p)).length;
    terms.push(term('Showcases with the counter', SCORE_WEIGHTS.showcasesNear, inBlock / showcases.length, `${inBlock} of ${showcases.length} in the checkout block`));
  }

  const rows = gridRows(state, f);
  const onGrid = rows.reduce((n, r) => n + spots(r.members), 0);
  terms.push(
    term(
      'Islands in rows',
      SCORE_WEIGHTS.rows,
      onGrid <= 1 ? 1 : (onGrid - rows.length) / (onGrid - 1),
      onGrid === 0 ? 'no islands in this layout' : `${onGrid} island spot${onGrid === 1 ? '' : 's'} in ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    ),
  );

  const even = evenUse(state, f);
  terms.push(term('Even use of the floor', SCORE_WEIGHTS.evenUse, even.value, `fixtures in ${even.used} of ${even.cells} parts of the floor`));

  // A corridor straight in from the door, a little narrower than the door and starting just inside
  // the wall, so that a fixture merely touching the corridor's edge or a rounded corner never
  // decides the measurement.
  const opening = entranceOf(state.room)!;
  const door: OrientedRect = {
    center: {
      x: round(entrance.point.x + entrance.normal.x * VIEW_MARGIN_UM),
      y: round(entrance.point.y + entrance.normal.y * VIEW_MARGIN_UM),
    },
    widthUm: opening.widthUm - 2 * VIEW_MARGIN_UM,
    depthUm: 2 * VIEW_MARGIN_UM,
    rotationUdeg: state.walls[entrance.wallIndex]!.angleUdeg,
  };
  const withFixtures = clearAhead(state, door, 'front', null, state.placed);
  const empty = clearAhead(state, door, 'front', null, []);
  terms.push(term('Open view from the entrance', SCORE_WEIGHTS.openEntrance, empty === 0 ? 1 : withFixtures / empty, `${mm(withFixtures)} clear straight ahead of the door`));
  return terms;
}
