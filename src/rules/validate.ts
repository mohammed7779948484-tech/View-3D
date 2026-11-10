/**
 * Validation of a design document against the planning rules. Pure and deterministic: the result
 * depends only on the document and the config, never on the order of the placements.
 */
import type { DesignDocument, Opening, Placement, Product, Room, Variant } from '../core/index';
import {
  differencePolygons,
  distancePointToSegment,
  insetPolygon,
  intersectPolygons,
  offsetPolygon,
  pointInPolygon,
  rectCorners,
  rectInsidePolygon,
  rectIntersectsPolygon,
  rectsOverlap,
  wallSegments,
} from '../geometry/index';
import type { OrientedRect, Point, PolygonWithHoles, WallSegment } from '../geometry/index';
import { defaultConfig } from './config';
import type { PlanningConfig } from './config';
import { entrancesOf, validateRoom } from './room';
import { accessZones, footprint, keepClearZones, openingBand } from './zones';
import type { AccessZone } from './zones';

export type RuleId =
  | 'invalid-room'
  | 'unknown-product'
  | 'overlap'
  | 'outside-room'
  | 'column'
  | 'blocked-door'
  | 'window-blocked'
  | 'wall-unit-not-on-wall'
  | 'access-blocked'
  | 'aisle-too-narrow'
  | 'unreachable'
  | 'main-aisle';

export type Violation = {
  rule: RuleId;
  severity: 'error' | 'warning';
  /** The fixture the violation is about first, then any other fixture involved. */
  placementIds: string[];
  openingId?: string;
  columnId?: string;
  /** Plain English, with numbers in mm. */
  message: string;
  measuredUm?: number;
  requiredUm?: number;
};

/** A placement with everything the rules need, worked out once. */
export type PlacedFixture = {
  placement: Placement;
  product: Product;
  variant: Variant;
  rect: OrientedRect;
  /** [back-left, back-right, front-right, front-left]. */
  corners: Point[];
  zones: AccessZone[];
};

const mmText = (um: number): string => `${Math.round(um / 1000)} mm`;
const round = (v: number): number => Math.round(v) + 0;

/** How far past the half aisle width the entrance probe point sits inside the door. */
const ENTRANCE_PROBE_EXTRA_UM = 10_000;
/** How far from the probe point the walkable floor may start and still count as the entrance. */
const ENTRANCE_SEARCH_UM = 1_000_000;

/** Placements in id order with their product, variant, footprint and access zones. */
export function placedFixtures(doc: DesignDocument, config: PlanningConfig): PlacedFixture[] {
  const out: PlacedFixture[] = [];
  const sorted = [...doc.placements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const placement of sorted) {
    const product = doc.products.find((p) => p.id === placement.productId);
    const variant = product?.variants.find((v) => v.id === placement.variantId);
    // Placements without a known product, variant or size are reported by validateLayout
    // ('unknown-product'); they have no footprint, so they cannot take part in the other rules.
    if (product === undefined || variant === undefined || variant.widthUm === null || variant.depthUm === null) continue;
    const rect = footprint(placement, variant);
    out.push({
      placement,
      product,
      variant,
      rect,
      corners: rectCorners(rect),
      zones: accessZones(placement, product, variant, config),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Walkable floor

/**
 * Where the centre of a walker `widthUm` wide can be: the room pulled in by half the width,
 * minus every obstacle pushed out by half the width. Each returned piece is one connected area.
 */
export function walkableRegion(
  room: Room,
  obstacles: readonly (readonly Point[])[],
  widthUm: number,
  config: PlanningConfig,
): PolygonWithHoles[] {
  const half = Math.max(0, Math.floor((widthUm - config.aisleToleranceUm) / 2));
  const floor = insetPolygon(room.outline, half);
  if (floor.length === 0) return [];
  const grown: Point[][] = [];
  for (const obstacle of obstacles) for (const piece of offsetPolygon(obstacle, half)) grown.push(piece.outer);
  if (grown.length === 0) return floor.map((outer) => ({ outer, holes: [] }));
  return differencePolygons(floor, grown);
}

function containsPoint(piece: PolygonWithHoles, p: Point): boolean {
  if (pointInPolygon(p, piece.outer) === 'outside') return false;
  return piece.holes.every((hole) => pointInPolygon(p, hole) !== 'inside');
}

function distanceToOutline(p: Point, polygon: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    best = Math.min(best, distancePointToSegment(p, polygon[i]!, polygon[(i + 1) % polygon.length]!));
  }
  return best;
}

/** The main entrance of a room (the first entrance door in document order), if it has one. */
export function entranceOf(room: Room): Opening | undefined {
  return entrancesOf(room)[0];
}

/** The connected piece of walkable floor a person stepping through `entrance` stands on. */
export function entrancePiece(
  room: Room,
  entrance: Opening,
  region: readonly PolygonWithHoles[],
  widthUm: number,
): PolygonWithHoles | undefined {
  const band = openingBand(room, entrance, widthUm / 2 + ENTRANCE_PROBE_EXTRA_UM);
  if (band === null) return undefined;
  const probe = { x: round((band[2]!.x + band[3]!.x) / 2), y: round((band[2]!.y + band[3]!.y) / 2) };
  const inside = region.find((piece) => containsPoint(piece, probe));
  if (inside !== undefined) return inside;
  let best: PolygonWithHoles | undefined;
  let bestDistance = ENTRANCE_SEARCH_UM;
  for (const piece of region) {
    const d = distanceToOutline(probe, piece.outer);
    if (d < bestDistance) {
      best = piece;
      bestDistance = d;
    }
  }
  return best;
}

/** True when the rectangle shares floor with the walkable piece. */
export function rectTouchesPiece(rect: OrientedRect, piece: PolygonWithHoles): boolean {
  const shared = intersectPolygons([rectCorners(rect)], [piece.outer]);
  if (shared.length === 0) return false;
  if (piece.holes.length === 0) return true;
  return (
    differencePolygons(
      shared.map((s) => s.outer),
      piece.holes,
    ).length > 0
  );
}

// ---------------------------------------------------------------------------------------------
// Single-fixture checks (also used by the auto-layout engine while it places)

/** The wall a rectangle's back edge lies flush on, or undefined. Doors on that wall must not be covered. */
export function flushWall(room: Room, corners: readonly Point[], config: PlanningConfig): WallSegment | undefined {
  const [backLeft, backRight] = corners as [Point, Point];
  for (const wall of wallSegments(room.outline)) {
    if (
      distancePointToSegment(backLeft, wall.start, wall.end) > config.wallSnapMaxGapUm ||
      distancePointToSegment(backRight, wall.start, wall.end) > config.wallSnapMaxGapUm
    ) {
      continue;
    }
    const along = (p: Point): number =>
      (p.x - wall.start.x) * wall.direction.x + (p.y - wall.start.y) * wall.direction.y;
    const t0 = Math.min(along(backLeft), along(backRight));
    const t1 = Math.max(along(backLeft), along(backRight));
    const acrossDoor = room.openings.some(
      (o) =>
        o.kind === 'door' &&
        o.wallIndex === wall.index &&
        Math.min(t1, o.offsetUm + o.widthUm) - Math.max(t0, o.offsetUm) > config.wallSnapMaxGapUm,
    );
    if (!acrossDoor) return wall;
  }
  return undefined;
}

export type WallSnap = { center: Point; rotationUdeg: number; wallIndex: number };

/** The pose of `rect` flush against wall `wall`, slid along so it stays on the wall, or null if the wall is too short. */
export function poseOnWall(wall: WallSegment, widthUm: number, depthUm: number, alongUm: number): WallSnap | null {
  if (wall.lengthUm < widthUm) return null;
  const t = Math.min(Math.max(alongUm, widthUm / 2), wall.lengthUm - widthUm / 2);
  return {
    center: {
      x: round(wall.start.x + wall.direction.x * t + (wall.inwardNormal.x * depthUm) / 2),
      y: round(wall.start.y + wall.direction.y * t + (wall.inwardNormal.y * depthUm) / 2),
    },
    rotationUdeg: wall.angleUdeg,
    wallIndex: wall.index,
  };
}

/**
 * The nearest pose with the rectangle's back flush against a wall and its front facing the room,
 * when its centre is within the snap distance of where it would stand; otherwise null.
 */
export function snapToWall(room: Room, rect: OrientedRect, config: PlanningConfig): WallSnap | null {
  let best: WallSnap | null = null;
  let bestGap = Infinity;
  for (const wall of wallSegments(room.outline)) {
    const dx = rect.center.x - wall.start.x;
    const dy = rect.center.y - wall.start.y;
    const fromWall = dx * wall.inwardNormal.x + dy * wall.inwardNormal.y;
    const gap = Math.abs(fromWall - rect.depthUm / 2);
    if (gap > config.wallSnapDistanceUm || gap >= bestGap) continue;
    const pose = poseOnWall(wall, rect.widthUm, rect.depthUm, dx * wall.direction.x + dy * wall.direction.y);
    if (pose === null) continue;
    best = pose;
    bestGap = gap;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// The rules

/**
 * All rule violations of a document, sorted by rule and fixture ids. [] means the layout is valid
 * and that every rule was really checked:
 * - a room that fails `validateRoom` (broken outline, opening off its wall, no entrance, ...)
 *   gives 'invalid-room' errors and nothing else, because the other rules need a sound room;
 * - a placement without a known product, variant or size gives 'unknown-product';
 * - with several entrances, every fixture must be reachable from each of them;
 * - the main-aisle rule applies only when the layout has a checkout counter, and is measured
 *   from the main (first) entrance.
 */
export function validateLayout(doc: DesignDocument, config: PlanningConfig = defaultConfig): Violation[] {
  const room = doc.room;
  const roomProblems = validateRoom(room);
  if (roomProblems.length > 0) {
    return roomProblems.map((p) => ({
      rule: 'invalid-room' as const,
      severity: 'error' as const,
      placementIds: [],
      ...(p.openingId === undefined ? {} : { openingId: p.openingId }),
      message: p.message,
    }));
  }
  const fixtures = placedFixtures(doc, config);
  const out: Violation[] = [];
  for (const placement of doc.placements) {
    const product = doc.products.find((p) => p.id === placement.productId);
    const variant = product?.variants.find((v) => v.id === placement.variantId);
    if (product === undefined || variant === undefined) {
      out.push({
        rule: 'unknown-product',
        severity: 'error',
        placementIds: [placement.id],
        message: `Placement "${placement.id}" refers to product "${placement.productId}" / "${placement.variantId}", which is not in the document.`,
      });
    } else if (variant.widthUm === null || variant.depthUm === null) {
      out.push({
        rule: 'unknown-product',
        severity: 'error',
        placementIds: [placement.id],
        message: `"${product.name}" (${placement.id}) has no known size, so it cannot be checked or drawn.`,
      });
    }
  }
  const label = (f: PlacedFixture): string => `"${f.product.name}" (${f.placement.id})`;

  // 1. overlap
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const a = fixtures[i]!;
      const b = fixtures[j]!;
      if (rectsOverlap(a.rect, b.rect)) {
        out.push({
          rule: 'overlap',
          severity: 'error',
          placementIds: [a.placement.id, b.placement.id],
          message: `${label(a)} and ${label(b)} overlap.`,
        });
      }
    }
  }

  const zones = keepClearZones(room, config);
  const blockedZones = new Set<string>(); // `${placementId}/${side}` of access zones already reported

  for (const f of fixtures) {
    const id = f.placement.id;

    // 2. outside-room
    if (!rectInsidePolygon(f.rect, room.outline)) {
      out.push({
        rule: 'outside-room',
        severity: 'error',
        placementIds: [id],
        message: `${label(f)} is not fully inside the room.`,
      });
    }

    // 3. column
    for (const column of room.columns) {
      if (rectIntersectsPolygon(f.rect, column.outline)) {
        out.push({
          rule: 'column',
          severity: 'error',
          placementIds: [id],
          columnId: column.id,
          message: `${label(f)} stands on column "${column.id}".`,
        });
      }
    }

    // 4. blocked-door (one violation per door, whatever number of its zones are hit)
    const doorsHit = new Set<string>();
    for (const zone of zones) {
      if (doorsHit.has(zone.openingId) || !rectIntersectsPolygon(f.rect, zone.polygon)) continue;
      doorsHit.add(zone.openingId);
      const isEntrance = room.openings.find((o) => o.id === zone.openingId)?.door?.isEntrance === true;
      out.push({
        rule: 'blocked-door',
        severity: 'error',
        placementIds: [id],
        openingId: zone.openingId,
        message: `${label(f)} blocks ${isEntrance ? 'the entrance' : `door "${zone.openingId}"`}. ${zone.reason}`,
      });
    }

    // 5. window-blocked
    // A fixture blocks a window when it is higher than that window's sill.
    if (f.variant.heightUm !== null) {
      for (const opening of room.openings) {
        if (opening.kind !== 'window' || f.variant.heightUm <= opening.sillHeightUm) continue;
        const band = openingBand(room, opening, config.windowBandDepthUm);
        if (band !== null && rectIntersectsPolygon(f.rect, band)) {
          out.push({
            rule: 'window-blocked',
            severity: 'error',
            placementIds: [id],
            openingId: opening.id,
            message: `${label(f)} is ${mmText(f.variant.heightUm)} high and stands in front of window "${opening.id}", whose sill is at ${mmText(opening.sillHeightUm)}.`,
            measuredUm: f.variant.heightUm,
            requiredUm: opening.sillHeightUm,
          });
        }
      }
    }

    // 6. wall-unit-not-on-wall
    if (f.product.placement === 'wall' && flushWall(room, f.corners, config) === undefined) {
      out.push({
        rule: 'wall-unit-not-on-wall',
        severity: 'error',
        placementIds: [id],
        message: `${label(f)} is a wall unit: its back must stand flush against a wall, clear of doors.`,
      });
    }

    // 7. access-blocked
    for (const zone of f.zones) {
      const who = zone.kind === 'staff' ? 'staff space' : 'aisle';
      const where = zone.side === 'front' ? 'in front of' : 'behind';
      const report = (others: string[], what: string): void => {
        blockedZones.add(`${id}/${zone.side}`);
        out.push({
          rule: 'access-blocked',
          severity: 'error',
          placementIds: [id, ...others],
          message: `The ${who} ${where} ${label(f)} needs ${mmText(zone.depthUm)} clear, but ${what}.`,
          requiredUm: zone.depthUm,
        });
      };
      if (!rectInsidePolygon(zone.rect, room.outline)) report([], 'a wall is in the way');
      for (const column of room.columns) {
        if (rectIntersectsPolygon(zone.rect, column.outline)) report([], `column "${column.id}" is in the way`);
      }
      for (const other of fixtures) {
        if (other !== f && rectsOverlap(zone.rect, other.rect)) {
          report([other.placement.id], `${label(other)} is in the way`);
        }
      }
    }
  }

  // 8 and 9. walking: unreachable, aisle-too-narrow, main-aisle
  const entrances = entrancesOf(room); // validateRoom guarantees at least one
  if (fixtures.length > 0) {
    const obstacles: Point[][] = [...fixtures.map((f) => f.corners), ...room.columns.map((c) => c.outline)];
    // For one aisle width: the floor a walker can stand on, as seen from each entrance.
    const piecesAt = (widthUm: number, from: readonly Opening[]): (PolygonWithHoles | undefined)[] => {
      const region = walkableRegion(room, obstacles, widthUm, config);
      return from.map((e) => entrancePiece(room, e, region, widthUm));
    };
    const secondary = piecesAt(config.secondaryAisleUm, entrances);
    const passage = piecesAt(config.staffPassageUm, entrances);
    // Reachable means reachable from every entrance.
    const touches = (zone: AccessZone, pieces: readonly (PolygonWithHoles | undefined)[]): boolean =>
      pieces.every((piece) => piece !== undefined && rectTouchesPiece(zone.rect, piece));

    for (const f of fixtures) {
      const open = f.zones.filter((z) => !blockedZones.has(`${f.placement.id}/${z.side}`));
      const customer = open.filter((z) => z.kind === 'customer');
      const staff = open.filter((z) => z.kind === 'staff');
      if (customer.some((z) => !touches(z, secondary))) {
        const walkable = customer.every((z) => touches(z, passage));
        out.push(
          walkable
            ? {
                rule: 'aisle-too-narrow',
                severity: 'error',
                placementIds: [f.placement.id],
                message: `The way from the entrance to ${label(f)} is narrower than ${mmText(config.secondaryAisleUm)} somewhere.`,
                requiredUm: config.secondaryAisleUm,
              }
            : {
                rule: 'unreachable',
                severity: 'error',
                placementIds: [f.placement.id],
                message: `Customers cannot walk from the entrance to ${label(f)}.`,
                requiredUm: config.secondaryAisleUm,
              },
        );
      }
      if (staff.some((z) => !touches(z, passage))) {
        out.push({
          rule: 'unreachable',
          severity: 'error',
          placementIds: [f.placement.id],
          message: `Staff cannot get behind ${label(f)}: the way in is narrower than ${mmText(config.staffPassageUm)}.`,
          requiredUm: config.staffPassageUm,
        });
      }
    }

    const counter = fixtures.find((f) => f.product.placement === 'counter');
    const front = counter?.zones.find((z) => z.kind === 'customer');
    if (counter !== undefined && front !== undefined && touches(front, secondary)) {
      if (!touches(front, piecesAt(config.mainAisleUm, entrances.slice(0, 1)))) {
        out.push({
          rule: 'main-aisle',
          severity: 'error',
          placementIds: [counter.placement.id],
          message: `The main aisle from the entrance to ${label(counter)} is narrower than ${mmText(config.mainAisleUm)} somewhere.`,
          requiredUm: config.mainAisleUm,
        });
      }
    }
  }

  const key = (v: Violation): string =>
    [v.rule, ...v.placementIds, v.openingId ?? '', v.columnId ?? '', v.message].join('\u0000');
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}
