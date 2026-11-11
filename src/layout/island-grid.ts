// ---------------------------------------------------------------------------------------------
// Phase c: islands on one grid
import type { Point, Vec, WallSegment } from '../geometry/index';
import type { GridStart, LayoutStrategy } from './types';
import {
  bigFirst,
  cloneState,
  cmp,
  HALF_TURN_UDEG,
  localObstacle,
  makePlaced,
  MEASURE_LIMIT_UM,
  note,
  QUARTER_TURN_UDEG,
  round,
  STEP_UM,
  tryPlaceGroup,
  walkingObstacle,
} from './state';
import type { Placed, Pose, State, Unit, UnitGroup } from './state';
import { entranceInfo } from './walls';

export type Frame = {
  rotationUdeg: number;
  /** Along the rows. */
  u: Vec;
  /** Across the rows. */
  v: Vec;
  /** Positions along a row, in scan order. */
  aValues: number[];
  /** Candidate positions for the first row line, in scan order. */
  bValues: number[];
  /** +1 or -1: which way successive row lines go along v. */
  bSign: number;
  /** Row line 0, once the first row has been found. */
  b0: number | null;
  /** Distance between row lines. */
  pitchUm: number;
};

export function makeFrame(state: State, base: WallSegment, rows: 'along' | 'across', start: GridStart, pitchUm: number): Frame {
  const u: Vec = rows === 'along' ? base.direction : base.inwardNormal;
  const rotationUdeg = rows === 'along' ? base.angleUdeg : base.angleUdeg + QUARTER_TURN_UDEG;
  const v: Vec = { x: -u.y, y: u.x };
  const as = state.room.outline.map((p) => p.x * u.x + p.y * u.y);
  const bs = state.room.outline.map((p) => p.x * v.x + p.y * v.y);
  const range = (lo: number, hi: number, descending: boolean): number[] => {
    const out: number[] = [];
    for (let x = lo; x <= hi; x += STEP_UM) out.push(x);
    return descending ? out.reverse() : out;
  };
  // 'along': v points into the shop, so "far" (the back) is high b. 'across': u points into the
  // shop, so "far" is high a; rows are then stacked from one side wall to the other.
  const far = start === 'far';
  const aDescending = rows === 'across' ? far : false;
  const bDescending = rows === 'along' ? far : !far;
  return {
    rotationUdeg,
    u,
    v,
    aValues: range(Math.min(...as), Math.max(...as), aDescending),
    bValues: range(Math.min(...bs), Math.max(...bs), bDescending),
    bSign: bDescending ? -1 : 1,
    b0: null,
    pitchUm,
  };
}

/** What stands at one spot of a row: one island, or two single-sided units back to back. */
export type RowItem = { units: Unit[]; widthUm: number };

export function posesOnRow(f: Frame, item: RowItem, a: number, b: number): { unit: Unit; pose: Pose }[] {
  const at = (offsetAcross: number): Point => ({
    x: round(a * f.u.x + (b + offsetAcross) * f.v.x),
    y: round(a * f.u.y + (b + offsetAcross) * f.v.y),
  });
  if (item.units.length === 1) return [{ unit: item.units[0]!, pose: { center: at(0), rotationUdeg: f.rotationUdeg } }];
  const [front, back] = item.units as [Unit, Unit];
  // Backs meet on the row line; fronts face outwards.
  return [
    { unit: front, pose: { center: at(front.depthUm / 2), rotationUdeg: f.rotationUdeg } },
    { unit: back, pose: { center: at(-back.depthUm / 2), rotationUdeg: f.rotationUdeg + HALF_TURN_UDEG } },
  ];
}

/** Row lines in grid order: every candidate line before the grid is fixed, the fixed lines after. */
export function rowLines(state: State, f: Frame): { index: number; b: number }[] {
  if (f.b0 === null) return f.bValues.map((b) => ({ index: 0, b }));
  const bs = state.room.outline.map((p) => p.x * f.v.x + p.y * f.v.y);
  const lo = Math.min(...bs);
  const hi = Math.max(...bs);
  const lines: { index: number; b: number }[] = [];
  for (let k = 0; ; k++) {
    const b = f.b0 + f.bSign * k * f.pitchUm;
    if (b < lo || b > hi) break;
    lines.push({ index: k, b });
  }
  return lines;
}

/** Fill row lines with `count` items: walk each line; after a success the next one is tried flush beside it. */
export function placeOnGrid(state: State, f: Frame, makeItem: () => RowItem | null, count: number): number {
  let placed = 0;
  const step = f.aValues.length > 1 && f.aValues[1]! < f.aValues[0]! ? -1 : 1;
  for (const line of rowLines(state, f)) {
    const searchingFirstRow = f.b0 === null;
    let i = 0;
    let a = f.aValues[0];
    while (a !== undefined && placed < count) {
      const item = makeItem();
      if (item === null) return placed;
      const centre = a + (step * item.widthUm) / 2; // `a` is the leading edge
      if (tryPlaceGroup(state, posesOnRow(f, item, centre, line.b), line.index) !== null) {
        placed += 1;
        if (f.b0 === null) f.b0 = line.b; // the first row fixes the grid
        a += step * item.widthUm; // flush beside the one just placed
        while (f.aValues[i] !== undefined && (f.aValues[i]! - a) * step < 0) i += 1;
      } else {
        if (f.aValues[i] !== undefined && (f.aValues[i]! - a) * step <= 0) i += 1;
        a = f.aValues[i];
      }
    }
    if (placed >= count) break;
    // The first row has just fixed the grid: carry on along the fixed row lines only.
    if (searchingFirstRow && f.b0 !== null) return placed + placeOnGrid(state, f, makeItem, count - placed);
  }
  return placed;
}

/** Rows of the grid with their members ordered along the row. */
export function gridRows(state: State, f: Frame): { index: number; members: Placed[] }[] {
  const rows = new Map<number, Placed[]>();
  for (const p of state.placed) if (p.row !== null) rows.set(p.row, [...(rows.get(p.row) ?? []), p]);
  const along = (p: Placed): number => p.rect.center.x * f.u.x + p.rect.center.y * f.u.y;
  return [...rows.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({ index, members: rows.get(index)!.sort((a, b) => along(a) - along(b) || cmp(a.placement.id, b.placement.id)) }));
}

/** How many separate spots a row holds (a back-to-back pair is one spot). */
export const spots = (members: readonly Placed[]): number => members.reduce((n, p) => n + (p.product.placement === 'wall' ? 0.5 : 1), 0);

/**
 * No orphans: while some row is a run, a fixture standing alone in its row is moved flush onto
 * the end of a run, or taken out and reported.
 */
export function resolveOrphans(state: State, f: Frame): void {
  for (;;) {
    const rows = gridRows(state, f);
    if (!rows.some((r) => spots(r.members) >= 2)) return;
    const orphanRow = rows.find((r) => spots(r.members) === 1);
    if (orphanRow === undefined) return;
    const orphans = orphanRow.members;
    state.placed = state.placed.filter((p) => !orphans.includes(p));
    for (const p of orphans) state.left.set(p.unit.key, (state.left.get(p.unit.key) ?? 0) + 1);
    const item: RowItem = { units: orphans.map((p) => p.unit), widthUm: Math.max(...orphans.map((p) => p.unit.widthUm)) };
    let moved = false;
    for (const row of rows) {
      if (row === orphanRow || moved) continue;
      const along = (p: Placed): number => p.rect.center.x * f.u.x + p.rect.center.y * f.u.y;
      const lo = Math.min(...row.members.map((p) => along(p) - p.unit.widthUm / 2));
      const hi = Math.max(...row.members.map((p) => along(p) + p.unit.widthUm / 2));
      const b = f.b0! + f.bSign * row.index * f.pitchUm;
      for (const centre of [hi + item.widthUm / 2, lo - item.widthUm / 2]) {
        if (tryPlaceGroup(state, posesOnRow(f, item, centre, b), row.index) !== null) {
          moved = true;
          break;
        }
      }
    }
    if (!moved) for (const p of orphans) note(state, p.unit, 'orphan');
    // Ids follow placement order; renumber so they stay f01, f02, ... without gaps.
    state.placed = state.placed.map((p, i) => renumber(p, i));
    state.cashWrap = state.cashWrap.map((c) => state.placed.find((p) => p.rect === c.rect) ?? c);
  }
}

export function renumber(p: Placed, index: number): Placed {
  const id = `f${String(index + 1).padStart(2, '0')}`;
  if (p.placement.id === id) return p;
  return { ...p, placement: { ...p.placement, id }, zones: p.zones.map((z) => ({ ...z, placementId: id })) };
}

/** Slide all island rows together to the middle of the free stretch, keeping them aligned. */
export function centreGrid(state: State, f: Frame): void {
  const islands = state.placed.filter((p) => p.row !== null);
  if (islands.length === 0) return;
  const rest = state.placed.filter((p) => p.row === null);
  const moved = (p: Placed, shift: number): Placed =>
    makePlaced(
      state,
      p.unit,
      { center: { x: round(p.rect.center.x + f.u.x * shift), y: round(p.rect.center.y + f.u.y * shift) }, rotationUdeg: p.rect.rotationUdeg },
      p.placement.id,
      p.row,
    );
  const valid = (shift: number): boolean => {
    const shifted = islands.map((p) => moved(p, shift));
    for (let i = 0; i < shifted.length; i++) {
      const others = [...rest, ...shifted.slice(0, i), ...shifted.slice(i + 1)];
      if (localObstacle(state, shifted[i]!, others, shifted) !== null) return false;
    }
    return walkingObstacle(state, [...rest, ...shifted]) === null;
  };
  for (const direction of [1, -1]) {
    let free = 0;
    for (let k = 1; k * STEP_UM <= MEASURE_LIMIT_UM; k++) {
      if (!valid(direction * k * STEP_UM)) break;
      free = k;
    }
    const half = Math.floor(free / 2) * STEP_UM;
    if (half === 0) continue;
    const shifted = new Map(islands.map((p) => [p, moved(p, direction * half)]));
    state.placed = state.placed.map((p) => shifted.get(p) ?? p);
    return; // the slack was on this side; the grid is now centred
  }
}

export type Built = { state: State; frame: Frame; strategy: LayoutStrategy };

/** Phase c for one grid direction, start side and island order. */
export function islandPhase(before: State, units: readonly UnitGroup[], strategy: LayoutStrategy): Built {
  const state = cloneState(before);
  const { config } = state;
  const entrance = entranceInfo(state.room, state.walls);
  const remaining = (test: (u: Unit) => boolean): UnitGroup[] =>
    units
      .filter((g) => test(g.unit) && (state.left.get(g.unit.key) ?? 0) > 0)
      .sort(bigFirst)
      .map((g) => ({ unit: g.unit, quantity: state.left.get(g.unit.key)! }));
  const order = (groups: UnitGroup[]): UnitGroup[] => (strategy.islands === 'big-first' ? groups : [...groups].reverse());
  const islands = order(remaining((u) => u.product.placement === 'island'));
  const singles = order(remaining((u) => u.product.placement === 'wall'));
  const others = order(remaining((u) => u.product.placement === 'freestanding'));

  // One grid: the row pitch fits the deepest thing that will stand on a row line.
  const depths = [...islands.map((g) => g.unit.depthUm), ...singles.map((g) => g.unit.depthUm * 2), ...others.map((g) => g.unit.depthUm)];
  const base = state.walls[entrance.wallIndex]!;
  const f = makeFrame(state, base, strategy.rows, strategy.start, (depths.length === 0 ? 0 : Math.max(...depths)) + config.secondaryAisleUm);

  for (const { unit } of islands) {
    placeOnGrid(state, f, () => ({ units: [unit], widthUm: unit.widthUm }), state.left.get(unit.key)!);
  }
  // Single-sided units left over from the walls: back to back, two of the same kind per spot.
  for (const { unit } of singles) {
    const pairs = Math.floor(state.left.get(unit.key)! / 2);
    placeOnGrid(state, f, () => ({ units: [unit, unit], widthUm: unit.widthUm }), pairs);
    if ((state.left.get(unit.key) ?? 0) > 0) note(state, unit, 'needs-partner');
  }
  for (const { unit } of others) {
    placeOnGrid(state, f, () => ({ units: [unit], widthUm: unit.widthUm }), state.left.get(unit.key)!);
  }
  resolveOrphans(state, f);
  return { state, frame: f, strategy };
}
