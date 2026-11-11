/** The placer's working state, its constants, and the rule checks for one candidate group. */
import type { DesignDocument, Placement, Product, Room, Variant } from '../core/index';
import { rectCorners, rectInsidePolygon, rectIntersectsPolygon, rectsOverlap, wallSegments } from '../geometry/index';
import type { OrientedRect, Point, WallSegment } from '../geometry/index';
import {
  accessZones,
  backIsCovered,
  defaultConfig,
  flushWall,
  footprint,
  keepClearZones,
  openingBand,
  walkingViolations,
} from '../rules/index';
import type { KeepClearZone, PlacedFixture, PlanningConfig } from '../rules/index';
import type { LayoutRequest, ReasonCode } from './types';

// ---------------------------------------------------------------------------------------------
// Constants (every number named)

/** Grid step for trying positions. */
export const STEP_UM = 100_000;
/** Farthest clear distance measured in front of a fixture for the drawing. */
export const MEASURE_LIMIT_UM = 6_000_000;
export const MEASURE_STEP_UM = 50_000;
/** Measured clear widths are refined to this precision. */
export const MEASURE_PRECISION_UM = 1000;
/** The view corridor from the entrance is pulled in by this much on each side. */
export const VIEW_MARGIN_UM = 5_000;
export const DEFAULT_MAX_OPTIONS = 4;
/** How many counter walls are tried. */
export const COUNTER_WALLS_TRIED = 3;
export const QUARTER_TURN_UDEG = 90_000_000;
export const HALF_TURN_UDEG = 180_000_000;
export const FULL_TURN_UDEG = 360_000_000;
/** Sort keys that are distances are compared in whole millimetres, so a sub-micrometre difference never decides an order. */
export const SORT_QUANTUM_UM = 1000;
/** The floor is cut into this many cells each way to judge how evenly it is used. */
export const EVEN_USE_CELLS = 3;
/** Sample points per cell side when deciding whether a cell is floor. */
export const EVEN_USE_SAMPLES = 4;

// ---------------------------------------------------------------------------------------------
// Internal state

export type Unit = { product: Product; variant: Variant; widthUm: number; depthUm: number; key: string };
export type Pose = { center: Point; rotationUdeg: number };
/** A placed fixture: what the rules need (`PlacedFixture`) plus the engine's own bookkeeping. */
export type Placed = PlacedFixture & { unit: Unit; row: number | null };
export type Ledger = Map<string, { tried: number; reasons: Map<ReasonCode, number> }>;

export type State = {
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

export const round = (v: number): number => Math.round(v) + 0;

/** Axis-aligned box around some points; used only to skip exact tests that cannot possibly hit. */
export type Box = { minX: number; minY: number; maxX: number; maxY: number };
export const boxCache = new WeakMap<readonly Point[], Box>();
export function boxOf(points: readonly Point[]): Box {
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
export const apart = (a: Box, b: Box): boolean => a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY;
export const normUdeg = (v: number): number => ((v % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
/** A distance as a sort key: whole millimetres. */
export const q = (um: number): number => Math.round(um / SORT_QUANTUM_UM);
export const mid = (w: WallSegment): Point => ({ x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 });

export function cloneState(state: State): State {
  return {
    ...state,
    placed: [...state.placed],
    cashWrap: [...state.cashWrap],
    left: new Map(state.left),
    ledger: new Map([...state.ledger].map(([k, v]) => [k, { tried: v.tried, reasons: new Map(v.reasons) }])),
  };
}

export function buildDocument(state: State, placed: readonly Placed[]): DesignDocument {
  return {
    schemaVersion: 1,
    id: state.request.id,
    name: state.request.name,
    room: state.room,
    products: state.products,
    placements: placed.map((p) => p.placement),
  };
}

export function note(state: State, unit: Unit, code: ReasonCode): void {
  let entry = state.ledger.get(unit.key);
  if (entry === undefined) {
    entry = { tried: 0, reasons: new Map() };
    state.ledger.set(unit.key, entry);
  }
  entry.tried += 1;
  entry.reasons.set(code, (entry.reasons.get(code) ?? 0) + 1);
}

export function makePlaced(state: State, unit: Unit, pose: Pose, id: string, row: number | null): Placed {
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
export function localObstacle(state: State, c: Placed, others: readonly Placed[], partners: readonly Placed[]): ReasonCode | null {
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

export const zoneBoxes = new WeakMap<OrientedRect, Box>();
export function zoneBoxOf(rect: OrientedRect): Box {
  let box = zoneBoxes.get(rect);
  if (box === undefined) {
    box = boxOf(rectCorners(rect));
    zoneBoxes.set(rect, box);
  }
  return box;
}

/** The walking rules for a whole set of fixtures: null when everything is reachable. */
export function walkingObstacle(state: State, all: readonly Placed[]): ReasonCode | null {
  const violations = walkingViolations(state.room, all, state.config);
  if (violations.length === 0) return null;
  const rule = violations[0]!.rule;
  return rule === 'main-aisle' ? 'main-aisle' : rule === 'aisle-too-narrow' ? 'aisle-too-narrow' : 'unreachable';
}

/**
 * Place a group of fixtures together (one fixture, a back-to-back pair, a checkout block) if every
 * rule allows it. All or nothing. Records the reason against the first unit when it fails.
 */
export function tryPlaceGroup(state: State, group: readonly { unit: Unit; pose: Pose }[], row: number | null): Placed[] | null {
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

export type UnitGroup = { unit: Unit; quantity: number };

export const area = (u: Unit): number => u.widthUm * u.depthUm;
export const bigFirst = (a: UnitGroup, b: UnitGroup): number => area(b.unit) - area(a.unit) || cmp(a.unit.key, b.unit.key);
export const isShowcase = (u: Unit): boolean => u.product.category === 'showcase' && u.product.placement === 'freestanding';

export function freshState(request: LayoutRequest, units: readonly UnitGroup[]): State {
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
