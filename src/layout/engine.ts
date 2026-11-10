/**
 * Automatic layout: a deterministic, rule-based constructive placer with a small exhaustive
 * search over placement orders. No random numbers and no clock: the same request always gives
 * the same options, byte for byte.
 *
 * How it works (docs/decisions/0003-rule-based-layout-engine.md has the reasoning):
 *  1. The room is validated first; a bad room is reported and nothing is placed.
 *  2. Fixtures are placed in a fixed priority order:
 *     a. the checkout block: counter and glass showcases as one straight or L-shaped block,
 *        parallel to a wall with staff space behind, as near the entrance as the rules allow;
 *     b. single-sided units (wall shelving, towers, ...) along walls;
 *     c. islands on ONE grid of equally spaced row lines: double-sided gondolas, then
 *        single-sided units left over from the walls as back-to-back pairs, then other
 *        freestanding fixtures; a fixture left alone in a row is moved into a run or dropped.
 *  3. A position is accepted only if the layout still passes every validation rule: the local
 *     rules are checked directly and the walking rules by the same code `validateLayout` uses.
 *     Each finished option is checked once more with `validateLayout` itself.
 *  4. Search: every combination of counter wall, row direction, wall order, grid start side and
 *     island order (see SEARCH) is built in full; per counter wall and row direction the best
 *     is kept, scored with an inspectable weighted sum, and the options are ranked.
 *  5. Every rejected position is counted by reason; what could not be placed is reported with
 *     the causes most positions failed on.
 */
import type { DesignDocument, Placement, Product, Room, Variant } from '../core/index';
import {
  pointInPolygon,
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
  backIsCovered,
  defaultConfig,
  entranceOf,
  flushWall,
  footprint,
  keepClearZones,
  openingBand,
  validateLayout,
  validateRoom,
  walkingViolations,
} from '../rules/index';
import type { KeepClearZone, PlacedFixture, PlanningConfig, RoomProblem } from '../rules/index';

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
  | 'faces-door'
  | 'not-on-wall'
  | 'aisle-too-narrow'
  | 'unreachable'
  | 'main-aisle'
  | 'no-wall-long-enough'
  | 'needs-partner'
  | 'orphan';

export type Unplaced = {
  productId: string;
  variantId: string;
  name: string;
  quantity: number;
  /** Plain English: the causes most tried positions failed on. */
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
  /** Wall the checkout block stands at (with staff space between), or null without a counter. */
  counterWall: number | null;
  /** Island rows run along the entrance wall, or across the shop from front to back. */
  rows: 'along' | 'across';
  /** The placement order the search kept for this option. */
  walls: WallOrder;
  start: GridStart;
  islands: IslandOrder;
};

export type IslandRow = { index: number; placementIds: string[] };

export type LayoutOption = {
  rank: number;
  strategy: LayoutStrategy;
  score: number;
  scoreBreakdown: ScoreTerm[];
  document: DesignDocument;
  unplaced: Unplaced[];
  aisles: MeasuredAisle[];
  /** Island rows on the grid, in grid order; ids within a row run along the row. */
  rows: IslandRow[];
  /** Placement ids of the checkout block (counter and its showcases), in block order. */
  cashWrap: string[];
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
/** Measured clear widths are refined to this precision. */
const MEASURE_PRECISION_UM = 1000;
/** The view corridor from the entrance is pulled in by this much on each side. */
const VIEW_MARGIN_UM = 5_000;
const DEFAULT_MAX_OPTIONS = 4;
/** How many counter walls are tried. */
const COUNTER_WALLS_TRIED = 3;
const QUARTER_TURN_UDEG = 90_000_000;
const HALF_TURN_UDEG = 180_000_000;
const FULL_TURN_UDEG = 360_000_000;
/** Sort keys that are distances are compared in whole millimetres, so a sub-micrometre difference never decides an order. */
const SORT_QUANTUM_UM = 1000;
/** The floor is cut into this many cells each way to judge how evenly it is used. */
const EVEN_USE_CELLS = 3;
/** Sample points per cell side when deciding whether a cell is floor. */
const EVEN_USE_SAMPLES = 4;

type WallOrder = 'back-first' | 'front-first';
type GridStart = 'far' | 'near';
type IslandOrder = 'big-first' | 'small-first';

/** The placement orders the search tries for every counter wall and row direction. */
const SEARCH: { walls: WallOrder[]; start: GridStart[]; islands: IslandOrder[] } = {
  walls: ['back-first', 'front-first'],
  start: ['far', 'near'],
  islands: ['big-first', 'small-first'],
};

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

function reasonText(code: ReasonCode, config: PlanningConfig): string {
  const mm = (um: number): string => `${Math.round(um / 1000)} mm`;
  switch (code) {
    case 'unknown-size':
      return 'its dimensions are not known yet';
    case 'no-wall-long-enough':
      return 'no wall has a free stretch long enough for it';
    case 'outside-room':
      return 'it would not stand fully inside the room';
    case 'column':
      return 'a column is in the way';
    case 'blocked-door':
      return 'it would block a door or the clear zone inside the entrance';
    case 'not-on-wall':
      return 'it must stand against a wall and the place is across a door';
    case 'overlap':
      return 'another fixture is already there';
    case 'window-blocked':
      return 'it is higher than the window sill it would stand in front of';
    case 'own-access':
      return `there is not enough aisle space left in front of it (at least ${mm(config.secondaryAisleUm)})`;
    case 'blocks-access':
      return 'it would block the aisle of a fixture that is already placed';
    case 'faces-door':
      return 'its aisle would run through the approach of a door';
    case 'unreachable':
      return 'it would cut part of the shop off from the entrance';
    case 'aisle-too-narrow':
      return `it would leave an aisle narrower than ${mm(config.secondaryAisleUm)}`;
    case 'main-aisle':
      return `it would narrow the main aisle to the counter below ${mm(config.mainAisleUm)}`;
    case 'needs-partner':
      return 'it is single-sided and there is neither free wall nor a partner to stand back to back with';
    case 'orphan':
      return 'it would stand alone, away from the rows, and no row has room for it';
  }
}

/**
 * The "did not fit" sentence: the cause most tried positions failed on first, then the next two,
 * each with its number of positions.
 */
export function describeObstacles(
  obstacles: Partial<Record<ReasonCode, number>>,
  tried: number,
  config: PlanningConfig,
): string {
  const ranked = (Object.entries(obstacles) as [ReasonCode, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .slice(0, 3);
  if (ranked.length === 0) return 'There was no wall or free floor left to try it on.';
  const head = `Tried ${tried} position${tried === 1 ? '' : 's'}.`;
  const parts = ranked.map(([code, n]) => `${reasonText(code, config)} (${n})`);
  if (tried === 1 || ranked.length === 1) return `${head} ${tried === 1 ? 'It' : 'They'} failed because ${parts[0]}.`;
  return `${head} Most failed because ${parts[0]}; then because ${parts.slice(1).join('; then because ')}.`;
}

// ---------------------------------------------------------------------------------------------
// Internal state

type Unit = { product: Product; variant: Variant; widthUm: number; depthUm: number; key: string };
type Pose = { center: Point; rotationUdeg: number };
/** A placed fixture: what the rules need (`PlacedFixture`) plus the engine's own bookkeeping. */
type Placed = PlacedFixture & { unit: Unit; row: number | null };
type Ledger = Map<string, { tried: number; reasons: Map<ReasonCode, number> }>;

type State = {
  request: LayoutRequest;
  config: PlanningConfig;
  room: Room;
  walls: WallSegment[];
  keepClear: KeepClearZone[];
  /** Approach zones of inner doors: no customer aisle may run through them. */
  doorApproaches: KeepClearZone[];
  products: Product[];
  placed: Placed[];
  ledger: Ledger;
  /** Units still to place, by unit key. */
  left: Map<string, number>;
  cashWrap: Placed[];
  /**
   * Set when the wall phase ends: the fixtures placed so far, and the island positions already
   * found impossible against them. Every island run that starts from this state shares it, so a
   * position ruled out once is not worked out again in the other search runs. Adding fixtures
   * never makes such a position possible again, so sharing cannot change any result.
   */
  base: { placed: readonly Placed[]; impossible: Map<string, ReasonCode> } | null;
};

const round = (v: number): number => Math.round(v) + 0;

/** Axis-aligned box around some points; used only to skip exact tests that cannot possibly hit. */
type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxCache = new WeakMap<readonly Point[], Box>();
function boxOf(points: readonly Point[]): Box {
  let box = boxCache.get(points);
  if (box === undefined) {
    box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of points) {
      box.minX = Math.min(box.minX, p.x);
      box.minY = Math.min(box.minY, p.y);
      box.maxX = Math.max(box.maxX, p.x);
      box.maxY = Math.max(box.maxY, p.y);
    }
    boxCache.set(points, box);
  }
  return box;
}
/** True when the boxes are clearly apart, so the shapes inside them cannot touch. */
const apart = (a: Box, b: Box): boolean => a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY;
const normUdeg = (v: number): number => ((v % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
/** A distance as a sort key: whole millimetres. */
const q = (um: number): number => Math.round(um / SORT_QUANTUM_UM);
const mid = (w: WallSegment): Point => ({ x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 });

function cloneState(state: State): State {
  return {
    ...state,
    placed: [...state.placed],
    cashWrap: [...state.cashWrap],
    left: new Map(state.left),
    ledger: new Map([...state.ledger].map(([k, v]) => [k, { tried: v.tried, reasons: new Map(v.reasons) }])),
  };
}

function buildDocument(state: State, placed: readonly Placed[]): DesignDocument {
  return {
    schemaVersion: 1,
    id: state.request.id,
    name: state.request.name,
    room: state.room,
    products: state.products,
    placements: placed.map((p) => p.placement),
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

function makePlaced(state: State, unit: Unit, pose: Pose, id: string, row: number | null): Placed {
  const placement: Placement = {
    id,
    productId: unit.product.id,
    variantId: unit.variant.id,
    center: pose.center,
    rotationUdeg: normUdeg(pose.rotationUdeg),
  };
  const rect = footprint(placement, unit.variant);
  return {
    placement,
    product: unit.product,
    variant: unit.variant,
    rect,
    corners: rectCorners(rect),
    zones: accessZones(placement, unit.product, unit.variant, state.config),
    unit,
    row,
  };
}

/**
 * The local rules for one candidate against the fixtures in `others`: everything `validateLayout`
 * checks except the walking rules, plus the engine's own "nothing faces a door" preference.
 * `partners` are candidates placed together with it (a back-to-back pair or a checkout block).
 */
function localObstacle(state: State, c: Placed, others: readonly Placed[], partners: readonly Placed[]): ReasonCode | null {
  const { room, config } = state;
  const box = boxOf(c.corners);
  const hits = (polygon: readonly Point[]): boolean => !apart(box, boxOf(polygon)) && rectIntersectsPolygon(c.rect, polygon);
  const overlaps = (a: OrientedRect, aCorners: readonly Point[], b: Placed): boolean =>
    !apart(boxOf(aCorners), boxOf(b.corners)) && rectsOverlap(a, b.rect);
  if (!rectInsidePolygon(c.rect, room.outline)) return 'outside-room';
  for (const column of room.columns) if (hits(column.outline)) return 'column';
  for (const zone of state.keepClear) if (hits(zone.polygon)) return 'blocked-door';
  for (const other of others) if (overlaps(c.rect, c.corners, other)) return 'overlap';
  if (c.variant.heightUm !== null) {
    for (const opening of room.openings) {
      if (opening.kind !== 'window' || c.variant.heightUm <= opening.sillHeightUm) continue;
      const band = openingBand(room, opening, config.windowBandDepthUm);
      if (band !== null && rectIntersectsPolygon(c.rect, band)) return 'window-blocked';
    }
  }
  if (
    c.product.placement === 'wall' &&
    flushWall(room, c.corners, config) === undefined &&
    !backIsCovered(c, [...others, ...partners], config)
  ) {
    return 'not-on-wall';
  }
  for (const zone of c.zones) {
    const zoneCorners = rectCorners(zone.rect);
    const zoneBox = boxOf(zoneCorners);
    if (!rectInsidePolygon(zone.rect, room.outline)) return 'own-access';
    for (const column of room.columns) {
      if (!apart(zoneBox, boxOf(column.outline)) && rectIntersectsPolygon(zone.rect, column.outline)) return 'own-access';
    }
    for (const other of others) if (overlaps(zone.rect, zoneCorners, other)) return 'own-access';
    if (zone.kind === 'customer') {
      for (const approach of state.doorApproaches) {
        if (!apart(zoneBox, boxOf(approach.polygon)) && rectIntersectsPolygon(zone.rect, approach.polygon)) return 'faces-door';
      }
    }
  }
  for (const other of others) {
    for (const zone of other.zones) {
      if (!apart(box, zoneBoxOf(zone.rect)) && rectsOverlap(zone.rect, c.rect)) return 'blocks-access';
    }
  }
  return null;
}

const zoneBoxes = new WeakMap<OrientedRect, Box>();
function zoneBoxOf(rect: OrientedRect): Box {
  let box = zoneBoxes.get(rect);
  if (box === undefined) {
    box = boxOf(rectCorners(rect));
    zoneBoxes.set(rect, box);
  }
  return box;
}

/** The walking rules for a whole set of fixtures: null when everything is reachable. */
function walkingObstacle(state: State, all: readonly Placed[]): ReasonCode | null {
  const violations = walkingViolations(state.room, all, state.config);
  if (violations.length === 0) return null;
  const rule = violations[0]!.rule;
  return rule === 'main-aisle' ? 'main-aisle' : rule === 'aisle-too-narrow' ? 'aisle-too-narrow' : 'unreachable';
}

/**
 * Place a group of fixtures together (one fixture, a back-to-back pair, a checkout block) if every
 * rule allows it. All or nothing. Records the reason against the first unit when it fails.
 */
function tryPlaceGroup(state: State, group: readonly { unit: Unit; pose: Pose }[], row: number | null): Placed[] | null {
  const added: Placed[] = [];
  const fail = (code: ReasonCode): null => {
    note(state, group[0]!.unit, code);
    return null;
  };
  // Cheapest test first: most grid positions fall outside the room, and need nothing else worked out.
  for (const { unit, pose } of group) {
    const rect: OrientedRect = { center: pose.center, widthUm: unit.widthUm, depthUm: unit.depthUm, rotationUdeg: normUdeg(pose.rotationUdeg) };
    if (!rectInsidePolygon(rect, state.room.outline)) {
      // A grid point outside the room is not a position anyone would consider: it is skipped
      // without being counted, so the report is not drowned in them. Along a wall it does count.
      return row === null ? fail('outside-room') : null;
    }
  }
  const baseKey =
    state.base === null || row === null
      ? null
      : group.map((g) => `${g.unit.key}@${g.pose.center.x},${g.pose.center.y},${normUdeg(g.pose.rotationUdeg)}`).join('|');
  if (baseKey !== null) {
    const known = state.base!.impossible.get(baseKey);
    if (known !== undefined) return fail(known);
  }
  for (const { unit, pose } of group) {
    const id = `f${String(state.placed.length + added.length + 1).padStart(2, '0')}`;
    added.push(makePlaced(state, unit, pose, id, row));
  }
  if (baseKey !== null) {
    // Against the shared starting fixtures only; a failure here holds for every run from this base.
    for (let i = 0; i < added.length; i++) {
      const why = localObstacle(state, added[i]!, [...state.base!.placed, ...added.slice(0, i)], added);
      if (why !== null) {
        state.base!.impossible.set(baseKey, why);
        return fail(why);
      }
    }
  }
  for (let i = 0; i < added.length; i++) {
    const why = localObstacle(state, added[i]!, [...state.placed, ...added.slice(0, i)], added);
    if (why !== null) return fail(why);
  }
  const why = walkingObstacle(state, [...state.placed, ...added]);
  if (why !== null) return fail(why);
  state.placed.push(...added);
  for (const { unit } of group) state.left.set(unit.key, (state.left.get(unit.key) ?? 0) - 1);
  return added;
}

// ---------------------------------------------------------------------------------------------
// Poses along walls

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

/** Positions along a wall worth trying for something this wide: a grid, plus every spot flush with something. */
function wallStops(state: State, wall: WallSegment, widthUm: number): number[] {
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

type Entrance = { point: Point; normal: Vec; wallIndex: number };

function entranceInfo(room: Room, walls: readonly WallSegment[]): Entrance {
  const opening = entranceOf(room)!; // validateRoom guarantees an entrance on a real wall
  const band = openingBand(room, opening, 0)!;
  const wall = walls[opening.wallIndex]!;
  return {
    point: { x: round((band[0]!.x + band[1]!.x) / 2), y: round((band[0]!.y + band[1]!.y) / 2) },
    normal: wall.inwardNormal,
    wallIndex: wall.index,
  };
}

// ---------------------------------------------------------------------------------------------
// Phase a: the checkout block

/** Units side by side along `wall` from `startUm`, backs `gapUm` from the wall. */
function lineAlongWall(wall: WallSegment, units: readonly Unit[], startUm: number, gapUm: number): { unit: Unit; pose: Pose }[] {
  let t = startUm;
  return units.map((unit) => {
    const pose = poseAtWall(wall, unit, t + unit.widthUm / 2, gapUm);
    t += unit.widthUm;
    return { unit, pose };
  });
}

const widthOf = (units: readonly Unit[]): number => units.reduce((n, u) => n + u.widthUm, 0);

/**
 * Counter and showcases as one block parallel to `wall`, staff space behind. Tries a straight
 * block with every showcase first (nearest the entrance wins), then an L-shaped block around a
 * right-angled corner, then the same with one showcase fewer, and so on down to the counter alone.
 */
function placeCashWrap(state: State, wall: WallSegment, counters: readonly Unit[], showcases: readonly Unit[], entrance: Entrance): boolean {
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

// ---------------------------------------------------------------------------------------------
// Phase b: walls

/** Back flush against a wall, walls tried in the given order, first free spot along each. */
function placeOnWalls(state: State, unit: Unit, order: readonly WallSegment[]): boolean {
  let anyLongEnough = false;
  for (const wall of order) {
    const stops = wallStops(state, wall, unit.widthUm);
    if (stops.length > 0) anyLongEnough = true;
    for (const t of stops) if (tryPlaceGroup(state, [{ unit, pose: poseAtWall(wall, unit, t, 0) }], null) !== null) return true;
  }
  if (!anyLongEnough) note(state, unit, 'no-wall-long-enough');
  return false;
}

// ---------------------------------------------------------------------------------------------
// Phase c: islands on one grid

type Frame = {
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

function makeFrame(state: State, base: WallSegment, rows: 'along' | 'across', start: GridStart, pitchUm: number): Frame {
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
type RowItem = { units: Unit[]; widthUm: number };

function posesOnRow(f: Frame, item: RowItem, a: number, b: number): { unit: Unit; pose: Pose }[] {
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
function rowLines(state: State, f: Frame): { index: number; b: number }[] {
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
function placeOnGrid(state: State, f: Frame, makeItem: () => RowItem | null, count: number): number {
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
function gridRows(state: State, f: Frame): { index: number; members: Placed[] }[] {
  const rows = new Map<number, Placed[]>();
  for (const p of state.placed) if (p.row !== null) rows.set(p.row, [...(rows.get(p.row) ?? []), p]);
  const along = (p: Placed): number => p.rect.center.x * f.u.x + p.rect.center.y * f.u.y;
  return [...rows.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({ index, members: rows.get(index)!.sort((a, b) => along(a) - along(b) || cmp(a.placement.id, b.placement.id)) }));
}

/** How many separate spots a row holds (a back-to-back pair is one spot). */
const spots = (members: readonly Placed[]): number => members.reduce((n, p) => n + (p.product.placement === 'wall' ? 0.5 : 1), 0);

/**
 * No orphans: while some row is a run, a fixture standing alone in its row is moved flush onto
 * the end of a run, or taken out and reported.
 */
function resolveOrphans(state: State, f: Frame): void {
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

function renumber(p: Placed, index: number): Placed {
  const id = `f${String(index + 1).padStart(2, '0')}`;
  if (p.placement.id === id) return p;
  return { ...p, placement: { ...p.placement, id }, zones: p.zones.map((z) => ({ ...z, placementId: id })) };
}

/** Slide all island rows together to the middle of the free stretch, keeping them aligned. */
function centreGrid(state: State, f: Frame): void {
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

// ---------------------------------------------------------------------------------------------
// One run of the placer

type UnitGroup = { unit: Unit; quantity: number };

function expandUnits(request: LayoutRequest): { units: UnitGroup[]; unknown: Unplaced[] } {
  const merged = new Map<string, { item: LayoutItem; quantity: number }>();
  for (const item of request.items) {
    const key = `${item.product.id}/${item.variantId}`;
    const entry = merged.get(key);
    if (entry === undefined) merged.set(key, { item, quantity: item.quantity });
    else entry.quantity += item.quantity;
  }
  const units: UnitGroup[] = [];
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
        reason: 'Its dimensions are not known yet, so it cannot be placed. Confirm the size first.',
        positionsTried: 0,
        obstacles: { 'unknown-size': quantity },
      });
      continue;
    }
    units.push({ unit: { product: item.product, variant, widthUm: variant.widthUm, depthUm: variant.depthUm, key }, quantity });
  }
  return { units, unknown };
}

const area = (u: Unit): number => u.widthUm * u.depthUm;
const bigFirst = (a: UnitGroup, b: UnitGroup): number => area(b.unit) - area(a.unit) || cmp(a.unit.key, b.unit.key);
const isShowcase = (u: Unit): boolean => u.product.category === 'showcase' && u.product.placement === 'freestanding';

function freshState(request: LayoutRequest, units: readonly UnitGroup[]): State {
  const config = request.config ?? defaultConfig;
  const keepClear = keepClearZones(request.room, config);
  return {
    request,
    config,
    room: request.room,
    walls: wallSegments(request.room.outline),
    keepClear,
    doorApproaches: keepClear.filter((z) => z.kind === 'door-approach'),
    products: [...new Map(request.items.map((i) => [i.product.id, i.product])).values()].sort((a, b) => cmp(a.id, b.id)),
    placed: [],
    ledger: new Map(),
    left: new Map(units.map((u) => [u.unit.key, u.quantity])),
    cashWrap: [],
    base: null,
  };
}

/** Phase a for one counter wall. Returns the state after it (or with nothing placed when there is no counter). */
function cashWrapPhase(request: LayoutRequest, units: readonly UnitGroup[], counterWall: number | null): State {
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

/** Phase b: showcases that did not join the block, then every single-sided unit, along walls. */
function wallPhase(before: State, units: readonly UnitGroup[], order: WallOrder): State {
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

type RunResult = Omit<LayoutOption, 'rank'>;
type Built = { state: State; frame: Frame; strategy: LayoutStrategy };

/** Phase c for one grid direction, start side and island order. */
function islandPhase(before: State, units: readonly UnitGroup[], strategy: LayoutStrategy): Built {
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

/** The finished option for a built layout: document, score, rows, and what did not fit. */
function report(built: Built, units: readonly UnitGroup[], unknown: readonly Unplaced[], final: boolean): RunResult {
  const { state, frame: f, strategy } = built;
  const { config } = state;
  const entrance = entranceInfo(state.room, state.walls);
  const unplaced: Unplaced[] = [...unknown];
  for (const { unit } of units) {
    const quantity = state.left.get(unit.key) ?? 0;
    if (quantity <= 0) continue;
    const entry = state.ledger.get(unit.key);
    const obstacles = Object.fromEntries([...(entry?.reasons ?? new Map<ReasonCode, number>())].sort((a, b) => cmp(a[0], b[0])));
    const tried = entry?.tried ?? 0;
    unplaced.push({
      productId: unit.product.id,
      variantId: unit.variant.id,
      name: unit.product.name,
      quantity,
      reason: describeObstacles(obstacles, tried, config),
      positionsTried: tried,
      obstacles,
    });
  }
  unplaced.sort((a, b) => cmp(`${a.productId}/${a.variantId}`, `${b.productId}/${b.variantId}`));

  const document = buildDocument(state, state.placed);
  // Every placement was checked on the way; the finished option is checked once more, in full,
  // by the same function that judges hand-made layouts.
  const leftover = final ? validateLayout(document, config) : [];
  if (leftover.length > 0) {
    // The engine checks every placement, so this is a programming error, not a user error.
    throw new Error(`autoLayout produced an invalid layout (${strategy.id}): ${leftover[0]!.message}`);
  }
  const requested = state.request.items.reduce((n, i) => n + Math.max(0, i.quantity), 0);
  const scoreBreakdown = score(state, f, entrance, requested);
  return {
    strategy,
    score: Math.round(scoreBreakdown.reduce((n, t) => n + t.points, 0) * 1000) / 1000,
    scoreBreakdown,
    document,
    unplaced,
    aisles: measureAisles(state, f),
    rows: gridRows(state, f).map((r) => ({ index: r.index, placementIds: r.members.map((p) => p.placement.id) })),
    cashWrap: state.cashWrap.map((p) => p.placement.id),
  };
}

// ---------------------------------------------------------------------------------------------
// Scoring and measuring

/** Clear distance straight ahead of a rectangle's front (or back) edge, up to the measuring limit. */
function clearAhead(state: State, rect: OrientedRect, side: 'front' | 'back', ignore: Placed | null, fixtures: readonly Placed[]): number {
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

function measureAisles(state: State, f: Frame): MeasuredAisle[] {
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
function evenUse(state: State, f: Frame): { value: number; used: number; cells: number } {
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

function score(state: State, f: Frame, entrance: Entrance, requested: number): ScoreTerm[] {
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

// ---------------------------------------------------------------------------------------------
// Entry point

/** Walls worth trying for the checkout block: those where the counter can stand, best (near and facing the entrance) first. */
function counterWalls(request: LayoutRequest, units: readonly UnitGroup[]): number[] {
  const counter = units.filter((g) => g.unit.product.placement === 'counter').sort(bigFirst)[0];
  if (counter === undefined) return [];
  const ranked: { index: number; value: number }[] = [];
  const probe = freshState(request, units);
  const entrance = entranceInfo(probe.room, probe.walls);
  const xs = request.room.outline.map((p) => p.x);
  const ys = request.room.outline.map((p) => p.y);
  // The longest distance across the room; a rough but orientation-independent yardstick.
  let span = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) span = Math.max(span, Math.hypot(xs[i]! - xs[j]!, ys[i]! - ys[j]!));
  for (const wall of probe.walls) {
    const state = freshState(request, units);
    if (!placeCashWrap(state, wall, [counter.unit], [], entrance)) continue;
    const placed = state.placed[0]!;
    const c = placed.rect.center;
    const d = dist(c, entrance.point);
    const front = adjacentRect(placed.rect, 'front', placed.rect.depthUm).center;
    const facing = d === 0 ? 0 : ((front.x - c.x) * (entrance.point.x - c.x) + (front.y - c.y) * (entrance.point.y - c.y)) / (Math.hypot(front.x - c.x, front.y - c.y) * d);
    const value = SCORE_WEIGHTS.counterNear * (1 - d / span) + SCORE_WEIGHTS.counterFacing * Math.max(0, facing);
    ranked.push({ index: wall.index, value: Math.round(value * 100) / 100 });
  }
  return ranked.sort((a, b) => b.value - a.value || a.index - b.index).slice(0, COUNTER_WALLS_TRIED).map((r) => r.index);
}

/**
 * Lay out the requested fixtures in the room. Returns ranked options (best first); each is a
 * complete design document that passes every validation rule, with its score explained and a
 * list of what did not fit and why. A room with problems gives no options and the problems.
 */
export function autoLayout(request: LayoutRequest): LayoutResult {
  const problems = validateRoom(request.room);
  if (problems.length > 0) return { options: [], problems };
  const { units, unknown } = expandUnits(request);
  const wallsForCounter: (number | null)[] = counterWalls(request, units);
  if (wallsForCounter.length === 0) wallsForCounter.push(null);

  const kept: RunResult[] = [];
  for (const counterWall of wallsForCounter) {
    const afterBlock = cashWrapPhase(request, units, counterWall);
    const afterWalls = new Map(SEARCH.walls.map((walls) => [walls, wallPhase(afterBlock, units, walls)]));
    for (const rows of ['across', 'along'] as const) {
      // Search: build every combination of placement orders in full and keep the best.
      // Orders that cannot change anything are skipped: a wall order that gave the same walls as
      // an earlier one, and the second island order when there is nothing to re-order.
      let best: { built: Built; result: RunResult } | null = null;
      const wallSignatures = new Set<string>();
      for (const walls of SEARCH.walls) {
        const afterWall = afterWalls.get(walls)!;
        const wallSignature = JSON.stringify(afterWall.placed.map((p) => [p.unit.key, p.rect.center, p.rect.rotationUdeg]));
        if (wallSignatures.has(wallSignature)) continue;
        wallSignatures.add(wallSignature);
        const kinds = units.filter((g) => (afterWall.left.get(g.unit.key) ?? 0) > 0).length;
        for (const start of SEARCH.start) {
          for (const islands of kinds > 1 ? SEARCH.islands : SEARCH.islands.slice(0, 1)) {
            const id = `counter-${counterWall === null ? 'none' : `wall-${counterWall}`}_rows-${rows}`;
            const strategy: LayoutStrategy = {
              id,
              description: `${counterWall === null ? 'No counter' : `Checkout at wall ${counterWall + 1}`}; island rows run ${rows === 'across' ? 'from front to back' : 'parallel to the entrance wall'}.`,
              counterWall,
              rows,
              walls,
              start,
              islands,
            };
            const built = islandPhase(afterWall, units, strategy);
            const result = report(built, units, unknown, false);
            const better =
              best === null ||
              result.document.placements.length > best.result.document.placements.length ||
              (result.document.placements.length === best.result.document.placements.length && result.score > best.result.score);
            if (better) best = { built, result };
          }
        }
      }
      if (best !== null) {
        // Only the kept layout is centred (it is the costly step), then reported again.
        centreGrid(best.built.state, best.built.frame);
        kept.push(report(best.built, units, unknown, true));
      }
    }
  }

  const seen = new Set<string>();
  const results: RunResult[] = [];
  for (const result of kept) {
    const signature = JSON.stringify(result.document.placements.map((p) => [p.productId, p.variantId, p.center, p.rotationUdeg]).sort());
    if (seen.has(signature)) continue;
    seen.add(signature);
    results.push(result);
  }
  // Ranking: an option that places more of what was asked for always comes first; the score
  // decides between options that place the same number.
  results.sort(
    (a, b) =>
      b.document.placements.length - a.document.placements.length || b.score - a.score || cmp(a.strategy.id, b.strategy.id),
  );
  return {
    options: results.slice(0, request.maxOptions ?? DEFAULT_MAX_OPTIONS).map((r, i) => ({ rank: i + 1, ...r })),
    problems: [],
  };
}
