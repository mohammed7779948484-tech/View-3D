/**
 * Automatic layout: a deterministic, rule-based constructive placer. No random numbers and no
 * clock: the same request always gives the same options, byte for byte.
 *
 * How it works (see STACK.md for the methods that were considered and rejected):
 *  1. Keep-clear zones (door swings, door approaches, the entrance zone) are reserved first.
 *  2. Fixtures are placed in a fixed priority order:
 *     checkout counter -> glass showcases in line with the counter -> wall units along walls ->
 *     gondolas as island rows -> other freestanding fixtures.
 *  3. A position is accepted only if the whole layout still passes every validation rule
 *     (`validateLayout`), so every option is valid by construction.
 *  4. Several strategies (which wall the counter stands at, which way the gondola rows run) give
 *     several options; each is scored with an inspectable weighted sum and they are ranked.
 *  5. Every rejected position is counted by reason; what could not be placed is reported with
 *     the reason that the closest attempts failed on.
 */
import type { DesignDocument, Placement, Product, Room, Variant } from '../core/index';
import {
  rectCorners,
  rectInsidePolygon,
  rectIntersectsPolygon,
  rectsOverlap,
  wallSegments,
} from '../geometry/index';
import type { OrientedRect, Point, Vec, WallSegment } from '../geometry/index';
import {
  accessZones,
  adjacentRect,
  defaultConfig,
  entranceOf,
  flushWall,
  footprint,
  keepClearZones,
  openingBand,
  validateLayout,
  validateRoom,
} from '../rules/index';
import type { AccessZone, KeepClearZone, PlanningConfig, RoomProblem } from '../rules/index';

// ---------------------------------------------------------------------------------------------
// Public types

export type LayoutItem = { product: Product; variantId: string; quantity: number };

export type LayoutRequest = {
  id: string;
  name: string;
  room: Room;
  items: LayoutItem[];
  config?: PlanningConfig;
  /** How many ranked options to return at most. Default 4. */
  maxOptions?: number;
};

export type ReasonCode =
  | 'unknown-size'
  | 'outside-room'
  | 'column'
  | 'blocked-door'
  | 'overlap'
  | 'window-blocked'
  | 'own-access'
  | 'blocks-access'
  | 'not-on-wall'
  | 'aisle-too-narrow'
  | 'unreachable'
  | 'main-aisle'
  | 'no-wall-long-enough'
  | 'other';

export type Unplaced = {
  productId: string;
  variantId: string;
  name: string;
  quantity: number;
  /** Plain English: why the closest attempts failed. */
  reason: string;
  positionsTried: number;
  /** How many tried positions failed on each reason. */
  obstacles: Partial<Record<ReasonCode, number>>;
};

export type ScoreTerm = { term: string; weight: number; value: number; points: number; note: string };

export type MeasuredAisle = { from: Point; to: Point; widthUm: number; kind: 'main' | 'secondary'; label: string };

export type LayoutStrategy = {
  id: string;
  description: string;
  /** Wall the counter stands at (with staff space between), or null without a counter. */
  counterWall: number | null;
  /** Gondola rows run along the entrance wall, or across the shop from front to back. */
  rows: 'along' | 'across';
};

export type LayoutOption = {
  rank: number;
  strategy: LayoutStrategy;
  score: number;
  scoreBreakdown: ScoreTerm[];
  document: DesignDocument;
  unplaced: Unplaced[];
  aisles: MeasuredAisle[];
};

export type LayoutResult = {
  /** Ranked options, best first. Empty when the room has problems. */
  options: LayoutOption[];
  /** Why the room cannot be laid out (see `validateRoom`); empty for a sound room. */
  problems: RoomProblem[];
};

// ---------------------------------------------------------------------------------------------
// Constants (every number named)

/** Grid step for trying positions. */
const STEP_UM = 100_000;
/** Farthest clear distance measured in front of a fixture for the drawing. */
const MEASURE_LIMIT_UM = 6_000_000;
const MEASURE_STEP_UM = 50_000;
const DEFAULT_MAX_OPTIONS = 4;
/** How many counter walls are tried. */
const COUNTER_WALLS_TRIED = 3;
const QUARTER_TURN_UDEG = 90_000_000;
const FULL_TURN_UDEG = 360_000_000;

/** Score weights; they add up to 100. */
export const SCORE_WEIGHTS = {
  placed: 50,
  counterNear: 15,
  counterFacing: 10,
  showcasesNear: 10,
  rows: 10,
  openEntrance: 5,
} as const;

/** How far a reason got: the unplaced report names the furthest one reached. */
const REASON_STAGE: Record<ReasonCode, number> = {
  'unknown-size': 0,
  'no-wall-long-enough': 0,
  'outside-room': 1,
  column: 2,
  'blocked-door': 3,
  'not-on-wall': 3,
  overlap: 4,
  'window-blocked': 5,
  'own-access': 6,
  'blocks-access': 6,
  other: 6,
  unreachable: 7,
  'aisle-too-narrow': 7,
  'main-aisle': 7,
};

function reasonText(code: ReasonCode, config: PlanningConfig): string {
  const mm = (um: number): string => `${Math.round(um / 1000)} mm`;
  switch (code) {
    case 'unknown-size':
      return 'Its dimensions are not known yet, so it cannot be placed. Confirm the size first.';
    case 'no-wall-long-enough':
      return 'no wall has a free stretch long enough for it';
    case 'outside-room':
      return 'it would not stand fully inside the room';
    case 'column':
      return 'a column is in the way';
    case 'blocked-door':
      return 'it would block a door or the clear zone inside the entrance';
    case 'not-on-wall':
      return 'it must stand against a wall and the only places left are across a door';
    case 'overlap':
      return 'another fixture is already there';
    case 'window-blocked':
      return 'it is higher than the window sill it would stand in front of';
    case 'own-access':
      return `there is not enough aisle space left in front of it (at least ${mm(config.secondaryAisleUm)})`;
    case 'blocks-access':
      return 'it would block the aisle of a fixture that is already placed';
    case 'unreachable':
      return 'it would cut part of the shop off from the entrance';
    case 'aisle-too-narrow':
      return `it would leave an aisle narrower than ${mm(config.secondaryAisleUm)}`;
    case 'main-aisle':
      return `it would narrow the main aisle to the counter below ${mm(config.mainAisleUm)}`;
    case 'other':
      return 'it would break a planning rule';
  }
}

// ---------------------------------------------------------------------------------------------
// Internal state

type Unit = { product: Product; variant: Variant; widthUm: number; depthUm: number; key: string };
type Pose = { center: Point; rotationUdeg: number };
type Placed = { placement: Placement; unit: Unit; rect: OrientedRect; zones: AccessZone[] };
type Ledger = Map<string, { tried: number; reasons: Map<ReasonCode, number> }>;

type State = {
  request: LayoutRequest;
  config: PlanningConfig;
  room: Room;
  walls: WallSegment[];
  keepClear: KeepClearZone[];
  products: Product[];
  placed: Placed[];
  ledger: Ledger;
  /** The counter line: wall, and how far along the wall it reaches at each end. */
  line: { wall: WallSegment; lo: number; hi: number } | null;
};

const round = (v: number): number => Math.round(v) + 0;
const normUdeg = (v: number): number => ((v % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function buildDocument(state: State, placements: readonly Placement[]): DesignDocument {
  return {
    schemaVersion: 1,
    id: state.request.id,
    name: state.request.name,
    room: state.room,
    products: state.products,
    placements: [...placements],
  };
}

function note(state: State, unit: Unit, code: ReasonCode): void {
  let entry = state.ledger.get(unit.key);
  if (entry === undefined) {
    entry = { tried: 0, reasons: new Map() };
    state.ledger.set(unit.key, entry);
  }
  entry.tried += 1;
  entry.reasons.set(code, (entry.reasons.get(code) ?? 0) + 1);
}

/** Why `unit` cannot stand at `pose`, or null when it can. Cheap checks first, then every rule. */
function obstacle(state: State, unit: Unit, placement: Placement): ReasonCode | null {
  const { room, config } = state;
  const rect = footprint(placement, unit.variant);
  if (!rectInsidePolygon(rect, room.outline)) return 'outside-room';
  for (const column of room.columns) if (rectIntersectsPolygon(rect, column.outline)) return 'column';
  for (const zone of state.keepClear) if (rectIntersectsPolygon(rect, zone.polygon)) return 'blocked-door';
  for (const other of state.placed) if (rectsOverlap(rect, other.rect)) return 'overlap';
  if (unit.variant.heightUm !== null) {
    for (const opening of room.openings) {
      if (opening.kind !== 'window' || unit.variant.heightUm <= opening.sillHeightUm) continue;
      const band = openingBand(room, opening, config.windowBandDepthUm);
      if (band !== null && rectIntersectsPolygon(rect, band)) return 'window-blocked';
    }
  }
  if (unit.product.placement === 'wall' && flushWall(room, rectCorners(rect), config) === undefined) return 'not-on-wall';
  for (const zone of accessZones(placement, unit.product, unit.variant, config)) {
    if (!rectInsidePolygon(zone.rect, room.outline)) return 'own-access';
    for (const column of room.columns) if (rectIntersectsPolygon(zone.rect, column.outline)) return 'own-access';
    for (const other of state.placed) if (rectsOverlap(zone.rect, other.rect)) return 'own-access';
  }
  for (const other of state.placed) {
    for (const zone of other.zones) if (rectsOverlap(zone.rect, rect)) return 'blocks-access';
  }
  const violations = validateLayout(buildDocument(state, [...state.placed.map((p) => p.placement), placement]), config);
  if (violations.length === 0) return null;
  const rule = violations[0]!.rule;
  return rule === 'unreachable' || rule === 'aisle-too-narrow' || rule === 'main-aisle' ? rule : 'other';
}

/** Place `unit` at `pose` if every rule allows it. Records the reason when it does not. */
function tryPlace(state: State, unit: Unit, pose: Pose): boolean {
  const placement: Placement = {
    id: `f${String(state.placed.length + 1).padStart(2, '0')}`,
    productId: unit.product.id,
    variantId: unit.variant.id,
    center: pose.center,
    rotationUdeg: normUdeg(pose.rotationUdeg),
  };
  const why = obstacle(state, unit, placement);
  if (why !== null) {
    note(state, unit, why);
    return false;
  }
  state.placed.push({
    placement,
    unit,
    rect: footprint(placement, unit.variant),
    zones: accessZones(placement, unit.product, unit.variant, state.config),
  });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Poses

/** Pose with the back parallel to `wall`, `gapUm` away from it, centred `alongUm` along it. */
function poseAtWall(wall: WallSegment, unit: Unit, alongUm: number, gapUm: number): Pose {
  const off = gapUm + unit.depthUm / 2;
  return {
    center: {
      x: round(wall.start.x + wall.direction.x * alongUm + wall.inwardNormal.x * off),
      y: round(wall.start.y + wall.direction.y * alongUm + wall.inwardNormal.y * off),
    },
    rotationUdeg: wall.angleUdeg,
  };
}

/** Positions along a wall worth trying for a unit of this width: a grid, plus every spot flush with something. */
function wallStops(state: State, wall: WallSegment, widthUm: number): number[] {
  const lo = widthUm / 2;
  const hi = wall.lengthUm - widthUm / 2;
  if (hi < lo) return [];
  const stops = new Set<number>();
  for (let t = lo; t <= hi; t += STEP_UM) stops.add(round(t));
  stops.add(round(hi));
  const along = (p: Point): number => (p.x - wall.start.x) * wall.direction.x + (p.y - wall.start.y) * wall.direction.y;
  const edges: number[] = [];
  for (const p of state.placed) for (const c of rectCorners(p.rect)) edges.push(along(c));
  for (const z of state.keepClear) for (const c of z.polygon) edges.push(along(c));
  for (const o of state.room.openings) {
    if (o.wallIndex === wall.index) edges.push(o.offsetUm, o.offsetUm + o.widthUm);
  }
  for (const e of edges) {
    for (const t of [e + widthUm / 2, e - widthUm / 2]) if (t >= lo && t <= hi) stops.add(round(t));
  }
  return [...stops].sort((a, b) => a - b);
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

type Entrance = { point: Point; normal: Vec; wallIndex: number } | null;

function entranceInfo(room: Room, walls: readonly WallSegment[]): Entrance {
  const opening = entranceOf(room);
  if (opening === undefined) return null;
  const band = openingBand(room, opening, 0);
  const wall = walls[opening.wallIndex];
  if (band === null || wall === undefined) return null;
  return {
    point: { x: round((band[0]!.x + band[1]!.x) / 2), y: round((band[0]!.y + band[1]!.y) / 2) },
    normal: wall.inwardNormal,
    wallIndex: wall.index,
  };
}

function roomDiagonal(room: Room): number {
  const xs = room.outline.map((p) => p.x);
  const ys = room.outline.map((p) => p.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

// ---------------------------------------------------------------------------------------------
// Phases

/** Counter parallel to `wall` with staff space behind it, as near the entrance as the rules allow. */
function placeCounter(state: State, unit: Unit, wall: WallSegment, entrance: Entrance): boolean {
  const target = entrance?.point ?? wall.start;
  const candidates = wallStops(state, wall, unit.widthUm)
    .map((t) => ({ t, pose: poseAtWall(wall, unit, t, state.config.staffSpaceUm) }))
    .sort((a, b) => dist(a.pose.center, target) - dist(b.pose.center, target) || a.t - b.t);
  for (const c of candidates) {
    if (tryPlace(state, unit, c.pose)) {
      state.line = { wall, lo: c.t - unit.widthUm / 2, hi: c.t + unit.widthUm / 2 };
      return true;
    }
  }
  return false;
}

/** Next to the counter, in one line with it, backs aligned: staff can supervise from behind. */
function placeInLine(state: State, unit: Unit): boolean {
  const line = state.line;
  if (line === null) return false;
  for (const end of ['hi', 'lo'] as const) {
    const t = end === 'hi' ? line.hi + unit.widthUm / 2 : line.lo - unit.widthUm / 2;
    if (t < unit.widthUm / 2 || t > line.wall.lengthUm - unit.widthUm / 2) continue;
    if (tryPlace(state, unit, poseAtWall(line.wall, unit, t, state.config.staffSpaceUm))) {
      if (end === 'hi') line.hi += unit.widthUm;
      else line.lo -= unit.widthUm;
      return true;
    }
  }
  return false;
}

/** Back flush against a wall, walls tried in the given order, first free spot along each. */
function placeOnWalls(state: State, unit: Unit, order: readonly WallSegment[]): boolean {
  let anyLongEnough = false;
  for (const wall of order) {
    const stops = wallStops(state, wall, unit.widthUm);
    if (stops.length > 0) anyLongEnough = true;
    for (const t of stops) if (tryPlace(state, unit, poseAtWall(wall, unit, t, 0))) return true;
  }
  if (!anyLongEnough) note(state, unit, 'no-wall-long-enough');
  return false;
}

type Frame = { rotationUdeg: number; u: Vec; v: Vec; aValues: number[]; bValues: number[] };

/** A grid over the room for rows whose long side runs along `u`; rows are stacked along `v`. */
function frame(state: State, u: Vec, rotationUdeg: number, aDescending: boolean, bDescending: boolean): Frame {
  const v: Vec = { x: -u.y, y: u.x };
  const as = state.room.outline.map((p) => p.x * u.x + p.y * u.y);
  const bs = state.room.outline.map((p) => p.x * v.x + p.y * v.y);
  const range = (lo: number, hi: number, descending: boolean): number[] => {
    const out: number[] = [];
    for (let x = lo; x <= hi; x += STEP_UM) out.push(x);
    return descending ? out.reverse() : out;
  };
  return {
    rotationUdeg,
    u,
    v,
    aValues: range(Math.min(...as), Math.max(...as), aDescending),
    bValues: range(Math.min(...bs), Math.max(...bs), bDescending),
  };
}

/** Fill rows: walk the grid row by row; after a success the next fixture is tried flush beside it. */
function placeInRows(state: State, unit: Unit, quantity: number, f: Frame): number {
  let placed = 0;
  const step = f.aValues.length > 1 && f.aValues[1]! < f.aValues[0]! ? -1 : 1;
  for (const b of f.bValues) {
    let i = 0;
    let a = f.aValues[0];
    while (a !== undefined && placed < quantity) {
      const pose: Pose = {
        center: { x: round(a * f.u.x + b * f.v.x), y: round(a * f.u.y + b * f.v.y) },
        rotationUdeg: f.rotationUdeg,
      };
      if (tryPlace(state, unit, pose)) {
        placed += 1;
        a += step * unit.widthUm; // flush beside the one just placed
        while (f.aValues[i] !== undefined && (f.aValues[i]! - a) * step < 0) i += 1;
        if (f.aValues[i] === undefined && (a - f.aValues[f.aValues.length - 1]!) * step > 0) break;
      } else {
        // Keep walking the grid; if we were off-grid (flush attempt), drop back onto it.
        if (f.aValues[i] !== undefined && f.aValues[i] === a) i += 1;
        a = f.aValues[i];
      }
    }
    if (placed >= quantity) break;
  }
  return placed;
}

/** Slide each gondola row to the middle of the free stretch it stands in, when the rules allow. */
function centreRows(state: State, f: Frame): void {
  const islands = state.placed.filter((p) => p.unit.product.placement === 'island');
  const rows = new Map<number, Placed[]>();
  for (const p of islands) {
    const b = round(p.placement.center.x * f.v.x + p.placement.center.y * f.v.y);
    rows.set(b, [...(rows.get(b) ?? []), p]);
  }
  const others = (row: readonly Placed[]): Placed[] => state.placed.filter((p) => !row.includes(p));
  const moved = (p: Placed, shift: number): Placed => {
    const placement: Placement = {
      ...p.placement,
      center: { x: round(p.placement.center.x + f.u.x * shift), y: round(p.placement.center.y + f.u.y * shift) },
    };
    return {
      placement,
      unit: p.unit,
      rect: footprint(placement, p.unit.variant),
      zones: accessZones(placement, p.unit.product, p.unit.variant, state.config),
    };
  };
  const valid = (all: readonly Placed[]): boolean =>
    validateLayout(buildDocument(state, all.map((p) => p.placement)), state.config).length === 0;

  for (const b of [...rows.keys()].sort((x, y) => x - y)) {
    const row = rows.get(b)!;
    const rest = others(row);
    for (const direction of [1, -1]) {
      // Largest slide in this direction that keeps the layout valid (the first failure ends the search).
      let free = 0;
      for (let k = 1; k * STEP_UM <= MEASURE_LIMIT_UM; k++) {
        if (!valid([...rest, ...row.map((p) => moved(p, direction * k * STEP_UM))])) break;
        free = k;
      }
      const half = Math.floor(free / 2) * STEP_UM;
      if (half === 0) continue;
      const shifted = row.map((p) => moved(p, direction * half));
      for (let i = 0; i < row.length; i++) state.placed[state.placed.indexOf(row[i]!)] = shifted[i]!;
      break; // slack was on this side; the row is now centred
    }
  }
}

// ---------------------------------------------------------------------------------------------
// One strategy

function expandUnits(request: LayoutRequest): { units: { unit: Unit; quantity: number }[]; unknown: Unplaced[] } {
  const merged = new Map<string, { item: LayoutItem; quantity: number }>();
  for (const item of request.items) {
    const key = `${item.product.id}/${item.variantId}`;
    const entry = merged.get(key);
    if (entry === undefined) merged.set(key, { item, quantity: item.quantity });
    else entry.quantity += item.quantity;
  }
  const units: { unit: Unit; quantity: number }[] = [];
  const unknown: Unplaced[] = [];
  for (const key of [...merged.keys()].sort(cmp)) {
    const { item, quantity } = merged.get(key)!;
    if (quantity <= 0) continue;
    const variant = item.product.variants.find((v) => v.id === item.variantId);
    if (variant === undefined || variant.widthUm === null || variant.depthUm === null || variant.heightUm === null) {
      unknown.push({
        productId: item.product.id,
        variantId: item.variantId,
        name: item.product.name,
        quantity,
        reason: reasonText('unknown-size', request.config ?? defaultConfig),
        positionsTried: 0,
        obstacles: { 'unknown-size': quantity },
      });
      continue;
    }
    units.push({ unit: { product: item.product, variant, widthUm: variant.widthUm, depthUm: variant.depthUm, key }, quantity });
  }
  return { units, unknown };
}

function runStrategy(request: LayoutRequest, strategy: LayoutStrategy): Omit<LayoutOption, 'rank'> {
  const config = request.config ?? defaultConfig;
  const room = request.room;
  const walls = wallSegments(room.outline);
  const { units, unknown } = expandUnits(request);
  const products = [...new Map(request.items.map((i) => [i.product.id, i.product])).values()].sort((a, b) => cmp(a.id, b.id));
  const state: State = {
    request,
    config,
    room,
    walls,
    keepClear: keepClearZones(room, config),
    products,
    placed: [],
    ledger: new Map(),
    line: null,
  };
  const entrance = entranceInfo(room, walls);
  const left = new Map(units.map((u) => [u.unit.key, u.quantity]));
  const take = (unit: Unit, ok: boolean): boolean => {
    if (ok) left.set(unit.key, left.get(unit.key)! - 1);
    return ok;
  };
  const bigFirst = (a: { unit: Unit }, b: { unit: Unit }): number =>
    b.unit.widthUm * b.unit.depthUm - a.unit.widthUm * a.unit.depthUm || cmp(a.unit.key, b.unit.key);
  const of = (test: (u: Unit) => boolean) => units.filter((u) => test(u.unit)).sort(bigFirst);

  // 1. Counter (further counters join the line).
  for (const { unit } of of((u) => u.product.placement === 'counter')) {
    while (left.get(unit.key)! > 0) {
      const wall = strategy.counterWall === null ? undefined : walls[strategy.counterWall];
      const ok = state.line === null ? wall !== undefined && placeCounter(state, unit, wall, entrance) : placeInLine(state, unit);
      if (!take(unit, ok)) break;
    }
  }
  const counter = state.placed.find((p) => p.unit.product.placement === 'counter');
  const anchor = counter?.placement.center ?? entrance?.point ?? room.outline[0]!;
  const nearAnchor = [...walls].sort(
    (a, b) => dist(mid(a), anchor) - dist(mid(b), anchor) || a.index - b.index,
  );
  const backFirst = [...walls].sort((a, b) => {
    const e = entrance?.point ?? anchor;
    return dist(mid(b), e) - dist(mid(a), e) || a.index - b.index;
  });

  // 2. Glass showcases: in line with the counter, else against the nearest walls.
  const isShowcase = (u: Unit): boolean => u.product.category === 'showcase' && u.product.placement === 'freestanding';
  for (const { unit } of of(isShowcase)) {
    while (left.get(unit.key)! > 0) {
      if (!take(unit, placeInLine(state, unit) || placeOnWalls(state, unit, nearAnchor))) break;
    }
  }

  // 3. Wall units: showcases-on-walls near the counter first, then the rest from the back wall.
  for (const { unit } of of((u) => u.product.placement === 'wall')) {
    const order = unit.product.category === 'showcase' ? nearAnchor : backFirst;
    while (left.get(unit.key)! > 0) if (!take(unit, placeOnWalls(state, unit, order))) break;
  }

  // 4. Gondolas in rows, then other freestanding fixtures on the same grid.
  const base = entrance === null ? longest(walls) : walls[entrance.wallIndex]!;
  const f =
    strategy.rows === 'along'
      ? frame(state, base.direction, base.angleUdeg, false, true)
      : frame(state, base.inwardNormal, base.angleUdeg + QUARTER_TURN_UDEG, true, false);
  for (const group of [of((u) => u.product.placement === 'island'), of((u) => u.product.placement === 'freestanding' && !isShowcase(u))]) {
    for (const { unit } of group) {
      const n = placeInRows(state, unit, left.get(unit.key)!, f);
      left.set(unit.key, left.get(unit.key)! - n);
    }
  }
  centreRows(state, f);

  // Report.
  const unplaced: Unplaced[] = [...unknown];
  for (const { unit } of units) {
    const quantity = left.get(unit.key)!;
    if (quantity <= 0) continue;
    const entry = state.ledger.get(unit.key);
    const reasons = [...(entry?.reasons ?? new Map<ReasonCode, number>()).entries()].sort(
      (a, b) => REASON_STAGE[b[0]] - REASON_STAGE[a[0]] || b[1] - a[1] || cmp(a[0], b[0]),
    );
    const tried = entry?.tried ?? 0;
    const top = reasons[0];
    const reason =
      top === undefined
        ? 'There was no wall or free floor to try it on (the counter it belongs with could not be placed).'
        : `Tried ${tried} position${tried === 1 ? '' : 's'}. The closest ones failed because ${reasonText(top[0], config)} (${top[1]} position${top[1] === 1 ? '' : 's'}).`;
    unplaced.push({
      productId: unit.product.id,
      variantId: unit.variant.id,
      name: unit.product.name,
      quantity,
      reason,
      positionsTried: tried,
      obstacles: Object.fromEntries(reasons.sort((a, b) => cmp(a[0], b[0]))),
    });
  }
  unplaced.sort((a, b) => cmp(`${a.productId}/${a.variantId}`, `${b.productId}/${b.variantId}`));

  // Final ids follow the placement order of this strategy.
  const document = buildDocument(state, state.placed.map((p) => p.placement));
  const requested = request.items.reduce((n, i) => n + Math.max(0, i.quantity), 0);
  const scoreBreakdown = score(state, f, entrance, requested);
  return {
    strategy,
    score: scoreBreakdown.reduce((n, t) => n + t.points, 0),
    scoreBreakdown,
    document,
    unplaced,
    aisles: measureAisles(state, f),
  };
}

const mid = (w: WallSegment): Point => ({ x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 });
const longest = (walls: readonly WallSegment[]): WallSegment =>
  [...walls].sort((a, b) => b.lengthUm - a.lengthUm || a.index - b.index)[0]!;

// ---------------------------------------------------------------------------------------------
// Scoring and measuring

/** Clear distance straight ahead of a rectangle's front (or back) edge, up to the measuring limit. */
function clearAhead(state: State, rect: OrientedRect, side: 'front' | 'back', ignore: Placed | null): number {
  let clear = 0;
  for (let d = MEASURE_STEP_UM; d <= MEASURE_LIMIT_UM; d += MEASURE_STEP_UM) {
    const probe = adjacentRect(rect, side, d);
    if (!rectInsidePolygon(probe, state.room.outline)) break;
    if (state.room.columns.some((c) => rectIntersectsPolygon(probe, c.outline))) break;
    if (state.placed.some((p) => p !== ignore && rectsOverlap(probe, p.rect))) break;
    clear = d;
  }
  return clear;
}

function measureAisles(state: State, f: Frame): MeasuredAisle[] {
  const out: MeasuredAisle[] = [];
  const add = (p: Placed, kind: MeasuredAisle['kind'], label: string): void => {
    const widthUm = clearAhead(state, p.rect, 'front', p);
    if (widthUm === 0) return;
    const edge = adjacentRect(p.rect, 'front', 0).center;
    const far = adjacentRect(p.rect, 'front', widthUm * 2).center; // centre of a 2w-deep rect = w ahead
    out.push({ from: edge, to: far, widthUm, kind, label });
  };
  const counter = state.placed.find((p) => p.unit.product.placement === 'counter');
  if (counter !== undefined) add(counter, 'main', 'in front of counter');
  const seenRows = new Set<number>();
  for (const p of state.placed) {
    if (p.unit.product.placement !== 'island') continue;
    const b = round(p.placement.center.x * f.v.x + p.placement.center.y * f.v.y);
    if (seenRows.has(b)) continue;
    seenRows.add(b);
    add(p, 'secondary', 'aisle');
  }
  return out;
}

function score(state: State, f: Frame, entrance: Entrance, requested: number): ScoreTerm[] {
  const diag = roomDiagonal(state.room);
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

  const counter = state.placed.find((p) => p.unit.product.placement === 'counter');
  if (counter === undefined || entrance === null) {
    const why = counter === undefined ? 'no counter placed' : 'room has no entrance';
    const value = counter === undefined && state.request.items.some((i) => i.product.placement === 'counter') ? 0 : 1;
    terms.push(term('Counter near the entrance', SCORE_WEIGHTS.counterNear, value, why));
    terms.push(term('Counter faces the entrance', SCORE_WEIGHTS.counterFacing, value, why));
  } else {
    const c = counter.placement.center;
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

  const showcases = state.placed.filter((p) => p.unit.product.category === 'showcase');
  if (showcases.length === 0 || counter === undefined) {
    terms.push(term('Showcases near the counter', SCORE_WEIGHTS.showcasesNear, showcases.length === 0 ? 1 : 0, showcases.length === 0 ? 'no showcases in this layout' : 'no counter placed'));
  } else {
    const mean = showcases.reduce((n, p) => n + dist(p.placement.center, counter.placement.center), 0) / showcases.length;
    terms.push(term('Showcases near the counter', SCORE_WEIGHTS.showcasesNear, 1 - mean / diag, `on average ${mm(mean)} from the counter`));
  }

  const islands = state.placed.filter((p) => p.unit.product.placement === 'island');
  const rows = new Set(islands.map((p) => round(p.placement.center.x * f.v.x + p.placement.center.y * f.v.y))).size;
  terms.push(
    term(
      'Gondolas in rows',
      SCORE_WEIGHTS.rows,
      islands.length <= 1 ? 1 : (islands.length - rows) / (islands.length - 1),
      islands.length === 0 ? 'no gondolas in this layout' : `${islands.length} gondola${islands.length === 1 ? '' : 's'} in ${rows} row${rows === 1 ? '' : 's'}`,
    ),
  );

  if (entrance === null) {
    terms.push(term('Open view from the entrance', SCORE_WEIGHTS.openEntrance, 1, 'room has no entrance'));
  } else {
    const opening = entranceOf(state.room)!;
    const door: OrientedRect = {
      center: entrance.point,
      widthUm: opening.widthUm,
      depthUm: 2,
      rotationUdeg: state.walls[entrance.wallIndex]!.angleUdeg,
    };
    const withFixtures = clearAhead(state, door, 'front', null);
    const empty = clearAhead({ ...state, placed: [] }, door, 'front', null);
    terms.push(term('Open view from the entrance', SCORE_WEIGHTS.openEntrance, empty === 0 ? 1 : withFixtures / empty, `${mm(withFixtures)} clear straight ahead of the door`));
  }
  return terms;
}

// ---------------------------------------------------------------------------------------------
// Entry point

/** Walls worth trying for the counter: those where it can stand, best (near and facing the entrance) first. */
function counterWalls(request: LayoutRequest): number[] {
  const config = request.config ?? defaultConfig;
  const walls = wallSegments(request.room.outline);
  const { units } = expandUnits(request);
  const counter = units.filter((u) => u.unit.product.placement === 'counter').sort((a, b) => cmp(a.unit.key, b.unit.key))[0];
  if (counter === undefined) return [];
  const entrance = entranceInfo(request.room, walls);
  const diag = roomDiagonal(request.room);
  const ranked: { index: number; value: number }[] = [];
  for (const wall of walls) {
    const state: State = {
      request,
      config,
      room: request.room,
      walls,
      keepClear: keepClearZones(request.room, config),
      products: [counter.unit.product],
      placed: [],
      ledger: new Map(),
      line: null,
    };
    if (!placeCounter(state, counter.unit, wall, entrance)) continue;
    const placed = state.placed[0]!;
    const c = placed.placement.center;
    const e = entrance?.point ?? c;
    const d = dist(c, e);
    const front = adjacentRect(placed.rect, 'front', placed.rect.depthUm).center;
    const facing = d === 0 ? 0 : ((front.x - c.x) * (e.x - c.x) + (front.y - c.y) * (e.y - c.y)) / (Math.hypot(front.x - c.x, front.y - c.y) * d);
    const value = SCORE_WEIGHTS.counterNear * (1 - d / diag) + SCORE_WEIGHTS.counterFacing * Math.max(0, facing);
    ranked.push({ index: wall.index, value: Math.round(value * 1000) / 1000 });
  }
  return ranked.sort((a, b) => b.value - a.value || a.index - b.index).slice(0, COUNTER_WALLS_TRIED).map((r) => r.index);
}

/**
 * Lay out the requested fixtures in the room. Returns ranked options (best first); each is a
 * complete design document that passes every validation rule, with its score explained and a
 * list of what did not fit and why.
 */
export function autoLayout(request: LayoutRequest): LayoutResult {
  const problems = validateRoom(request.room);
  if (problems.length > 0) return { options: [], problems };
  const wallsForCounter: (number | null)[] = counterWalls(request);
  if (wallsForCounter.length === 0) wallsForCounter.push(null);
  const strategies: LayoutStrategy[] = [];
  for (const counterWall of wallsForCounter) {
    for (const rows of ['across', 'along'] as const) {
      strategies.push({
        id: `counter-${counterWall === null ? 'none' : `wall-${counterWall}`}_rows-${rows}`,
        description: `${counterWall === null ? 'No counter position' : `Counter at wall ${counterWall + 1}`}; gondola rows run ${rows === 'across' ? 'from front to back' : 'parallel to the entrance wall'}.`,
        counterWall,
        rows,
      });
    }
  }
  const seen = new Set<string>();
  const results: Omit<LayoutOption, 'rank'>[] = [];
  for (const strategy of strategies) {
    const result = runStrategy(request, strategy);
    const signature = JSON.stringify(result.document.placements.map((p) => [p.productId, p.variantId, p.center, p.rotationUdeg]).sort());
    if (seen.has(signature)) continue;
    seen.add(signature);
    results.push(result);
  }
  results.sort((a, b) => b.score - a.score || cmp(a.strategy.id, b.strategy.id));
  return {
    options: results.slice(0, request.maxOptions ?? DEFAULT_MAX_OPTIONS).map((r, i) => ({ rank: i + 1, ...r })),
    problems: [],
  };
}
