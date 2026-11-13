/** Keep-clear zones of a room and the access zones of a placed fixture. */
import type { Opening, Placement, Product, Room, Variant } from '../core/index';
import { doorSwingZone, intersectPolygons, openingSegment, wallSegment } from '../geometry/index';
import type { OrientedRect, Point } from '../geometry/index';
import type { PlanningConfig } from './config';

export type KeepClearKind = 'door-swing' | 'door-approach' | 'entrance-clear' | 'decompression';

export type KeepClearZone = {
  id: string;
  kind: KeepClearKind;
  openingId: string;
  /** Counter-clockwise, clipped to the room. */
  polygon: Point[];
  /** Plain-English reason, shown to the owner. */
  reason: string;
};

const round = (v: number): number => Math.round(v) + 0;

function clipped(
  room: Room,
  opening: Opening,
  kind: KeepClearKind,
  polygon: readonly Point[],
  reason: string,
): KeepClearZone[] {
  const pieces = intersectPolygons([polygon], [room.outline]);
  const base = `${opening.id}:${kind}`;
  return pieces.map((piece, i) => ({
    id: pieces.length === 1 ? base : `${base}#${i + 1}`,
    kind,
    openingId: opening.id,
    polygon: piece.outer,
    reason,
  }));
}

/**
 * Zones that must stay free of fixtures, in opening order: for every door its swing (when it
 * swings in) and the approach in front of it; for every entrance also the decompression zone
 * straight in from the door. Windows give no zone.
 */
export function keepClearZones(room: Room, config: PlanningConfig): KeepClearZone[] {
  const zones: KeepClearZone[] = [];
  for (const opening of room.openings) {
    const door = opening.door;
    if (opening.kind !== 'door' || door === undefined) continue;
    const name = door.isEntrance ? 'the entrance' : `door "${opening.id}"`;

    const swing = doorSwingZone(room.outline, {
      wallIndex: opening.wallIndex,
      offsetUm: opening.offsetUm,
      widthUm: opening.widthUm,
      swing: door.swing,
      hinge: door.hinge,
    });
    if (swing !== null) {
      zones.push(...clipped(room, opening, 'door-swing', swing, `The leaf of ${name} sweeps this area when it opens.`));
    }

    const wall = wallSegment(room.outline, opening.wallIndex);
    if (wall === undefined) continue;
    const latch = door.swing === 'in' ? config.doorLatchSideUm : 0;
    let from = opening.offsetUm;
    let to = opening.offsetUm + opening.widthUm;
    if (door.hinge === 'start') to += latch;
    else from -= latch;
    const depth = config.doorApproachDepthUm;
    const at = (t: number, d: number): Point => ({
      x: round(wall.start.x + wall.direction.x * t + wall.inwardNormal.x * d),
      y: round(wall.start.y + wall.direction.y * t + wall.inwardNormal.y * d),
    });
    const approach = [at(from, 0), at(to, 0), at(to, depth), at(from, depth)];
    zones.push(
      ...clipped(
        room,
        opening,
        door.isEntrance ? 'entrance-clear' : 'door-approach',
        approach,
        door.isEntrance
          ? 'Customers need clear floor just inside the entrance.'
          : `People need clear floor in front of ${name} to open it and walk through.`,
      ),
    );
    if (door.isEntrance) {
      // Decompression zone: straight in from the entrance, as wide as the door.
      const mid = at(opening.offsetUm + opening.widthUm / 2, 0);
      const shopDepth = Math.max(
        ...room.outline.map((p) => (p.x - mid.x) * wall.inwardNormal.x + (p.y - mid.y) * wall.inwardNormal.y),
      );
      const deep = Math.min(config.entranceDecompressionDepthUm, shopDepth * config.entranceDecompressionShare);
      const o0 = opening.offsetUm;
      const o1 = opening.offsetUm + opening.widthUm;
      zones.push(
        ...clipped(
          room,
          opening,
          'decompression',
          [at(o0, 0), at(o1, 0), at(o1, deep), at(o0, deep)],
          'Customers arriving need open floor and a clear view straight in from the entrance.',
        ),
      );
    }
  }
  return zones;
}

/** The floor rectangle a placement covers. Throws when the variant has an unknown dimension. */
export function footprint(placement: Placement, variant: Variant): OrientedRect {
  if (variant.widthUm === null || variant.depthUm === null) {
    throw new RangeError(`Variant "${variant.id}" has unknown dimensions and cannot be placed.`);
  }
  return {
    center: placement.center,
    widthUm: variant.widthUm,
    depthUm: variant.depthUm,
    rotationUdeg: placement.rotationUdeg,
  };
}

export type AccessZone = {
  placementId: string;
  /** Who walks here. */
  kind: 'customer' | 'staff';
  side: 'front' | 'back';
  depthUm: number;
  rect: OrientedRect;
};

/** Unit vector pointing out of a rectangle's front, exact for quarter turns. */
export function frontDirection(rotationUdeg: number): { x: number; y: number } {
  switch (((rotationUdeg % 360_000_000) + 360_000_000) % 360_000_000) {
    case 0:
      return { x: 0, y: 1 };
    case 90_000_000:
      return { x: -1, y: 0 };
    case 180_000_000:
      return { x: 0, y: -1 };
    case 270_000_000:
      return { x: 1, y: 0 };
    default: {
      const a = (rotationUdeg * Math.PI) / 180_000_000;
      return { x: -Math.sin(a), y: Math.cos(a) };
    }
  }
}

/**
 * A rectangle `depthUm` deep lying against the front or back edge of `rect`, same width.
 * The direction comes from the rotation itself, not from the rounded corners, so a thin fixture
 * on an angled wall gets a zone that is exactly in line with it.
 */
export function adjacentRect(rect: OrientedRect, side: 'front' | 'back', depthUm: number): OrientedRect {
  const front = frontDirection(rect.rotationUdeg);
  const sign = side === 'front' ? 1 : -1;
  const reach = sign * (rect.depthUm / 2 + depthUm / 2);
  return {
    center: { x: round(rect.center.x + front.x * reach), y: round(rect.center.y + front.y * reach) },
    widthUm: rect.widthUm,
    depthUm,
    rotationUdeg: rect.rotationUdeg,
  };
}

/**
 * The floor that must stay walkable next to a fixture.
 * - wall and freestanding: customers in front (the product's front clearance, at least a secondary aisle);
 * - island: customers in front and behind (a secondary aisle each);
 * - counter: customers in front (the main aisle) and staff behind (staff space);
 * - a product served from the rear (`serviceSide: 'rear'`): also staff behind (staff space).
 */
export function accessZones(
  placement: Placement,
  product: Product,
  variant: Variant,
  config: PlanningConfig,
): AccessZone[] {
  const rect = footprint(placement, variant);
  const zone = (kind: AccessZone['kind'], side: AccessZone['side'], depthUm: number): AccessZone => ({
    placementId: placement.id,
    kind,
    side,
    depthUm,
    rect: adjacentRect(rect, side, depthUm),
  });
  switch (product.placement) {
    case 'island':
      return [zone('customer', 'front', config.secondaryAisleUm), zone('customer', 'back', config.secondaryAisleUm)];
    case 'counter':
      return [zone('customer', 'front', config.mainAisleUm), zone('staff', 'back', config.staffSpaceUm)];
    case 'wall':
    case 'freestanding': {
      const front = zone('customer', 'front', Math.max(product.clearances.frontUm, config.secondaryAisleUm));
      return product.serviceSide === 'rear' ? [front, zone('staff', 'back', config.staffSpaceUm)] : [front];
    }
  }
}

/** The piece of wall an opening occupies, pushed `depthUm` into the room: a counter-clockwise quad. */
export function openingBand(room: Room, opening: Opening, depthUm: number): Point[] | null {
  const seg = openingSegment(room.outline, opening.wallIndex, opening.offsetUm, opening.widthUm);
  if (seg === null) return null;
  const push = (p: Point): Point => ({
    x: round(p.x + seg.inwardNormal.x * depthUm),
    y: round(p.y + seg.inwardNormal.y * depthUm),
  });
  return [seg.start, seg.end, push(seg.end), push(seg.start)];
}
