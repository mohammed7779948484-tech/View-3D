/**
 * An independent judge of layouts. It shares NO code with src/geometry, src/rules or the layout
 * engine: it uses plain floating-point maths, point sampling and a flood fill over a grid. It is
 * slower and coarser than the real rules, which is the point: a mistake in the real rules cannot
 * hide here, because nothing is reused.
 *
 * It only imports the document types.
 */
import type { DesignDocument, Placement, Point, Product, Variant } from '../../src/core/index';

const MM = 1000;
/** Sampling step for fixtures and zones. */
const SAMPLE = 25 * MM;
/** Cell size of the walking grid. */
const CELL = 50 * MM;
/** Samples this close to an edge are ignored, so touching is never called overlapping. */
const EDGE = 5 * MM;

export type Box = { x0: number; y0: number; x1: number; y1: number };
/** Part of a disc: the points within `r` of the centre that also lie inside `within` (a door leaf sweeps a quarter, not a full circle). */
export type Disc = { cx: number; cy: number; r: number; within: Box };
/** Keep-clear areas written out by hand for a room (see the test file). */
export type KeepClear = { name: string; boxes: Box[]; discs: Disc[] };

type Fixture = { placement: Placement; product: Product; variant: Variant; w: number; d: number; cos: number; sin: number };

export function fixturesOf(doc: DesignDocument): Fixture[] {
  return doc.placements.map((placement) => {
    const product = doc.products.find((p) => p.id === placement.productId)!;
    const variant = product.variants.find((v) => v.id === placement.variantId)!;
    const a = (placement.rotationUdeg / 1e6) * (Math.PI / 180);
    return { placement, product, variant, w: variant.widthUm!, d: variant.depthUm!, cos: Math.cos(a), sin: Math.sin(a) };
  });
}

/** A point in the fixture's own frame: x along the width, y from back (-) to front (+). */
function local(f: Fixture, p: Point): Point {
  const dx = p.x - f.placement.center.x;
  const dy = p.y - f.placement.center.y;
  return { x: dx * f.cos + dy * f.sin, y: -dx * f.sin + dy * f.cos };
}
function world(f: Fixture, p: Point): Point {
  return { x: f.placement.center.x + p.x * f.cos - p.y * f.sin, y: f.placement.center.y + p.x * f.sin + p.y * f.cos };
}
const insideFixture = (f: Fixture, p: Point, margin: number): boolean => {
  const q = local(f, p);
  return Math.abs(q.x) < f.w / 2 - margin && Math.abs(q.y) < f.d / 2 - margin;
};

/** Even-odd ray casting. */
export function insidePolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}
function distanceToPolygonEdge(p: Point, polygon: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) best = Math.min(best, distanceToSegment(p, polygon[i]!, polygon[(i + 1) % polygon.length]!));
  return best;
}
/** Distance from a point to a fixture's footprint (0 inside). */
function distanceToFixture(f: Fixture, p: Point): number {
  const q = local(f, p);
  return Math.hypot(Math.max(0, Math.abs(q.x) - f.w / 2), Math.max(0, Math.abs(q.y) - f.d / 2));
}

/** Sample points over a rectangle given in a fixture's own frame. */
function samples(f: Fixture, x0: number, x1: number, y0: number, y1: number): Point[] {
  const out: Point[] = [];
  for (let x = x0 + EDGE; x <= x1 - EDGE; x += SAMPLE) for (let y = y0 + EDGE; y <= y1 - EDGE; y += SAMPLE) out.push(world(f, { x, y }));
  return out;
}

/** Which sides of a fixture people need to reach, and how deep the clear floor must be. */
function accessSides(f: Fixture, aisle: number, mainAisle: number, staff: number): { side: 1 | -1; depth: number; staff: boolean }[] {
  switch (f.product.placement) {
    case 'island':
      return [{ side: 1, depth: aisle, staff: false }, { side: -1, depth: aisle, staff: false }];
    case 'counter':
      return [{ side: 1, depth: mainAisle, staff: false }, { side: -1, depth: staff, staff: true }];
    default:
      return [{ side: 1, depth: Math.max(aisle, f.product.clearances.frontUm), staff: false }];
  }
}

export type OracleProblem = { kind: string; ids: string[]; detail: string };

export type OracleSettings = { aisleMm: number; mainAisleMm: number; staffMm: number; staffPassageMm: number; windowBandMm: number };
export const SETTINGS: OracleSettings = { aisleMm: 915, mainAisleMm: 1200, staffMm: 915, staffPassageMm: 600, windowBandMm: 600 };

/**
 * Everything the oracle can find wrong with a layout. `keepClear` and `windows` are written out
 * by hand per room in the test, in millimetres turned into micrometres.
 */
export function judge(
  doc: DesignDocument,
  keepClear: readonly KeepClear[],
  windows: readonly { name: string; band: Box; sillUm: number }[],
  entrance: { at: Point; inward: Point },
  settings: OracleSettings = SETTINGS,
): OracleProblem[] {
  const problems: OracleProblem[] = [];
  const fixtures = fixturesOf(doc);
  const room = doc.room.outline;
  const aisle = settings.aisleMm * MM;
  const mainAisle = settings.mainAisleMm * MM;
  const staff = settings.staffMm * MM;
  const inBox = (p: Point, b: Box): boolean => p.x > b.x0 + EDGE && p.x < b.x1 - EDGE && p.y > b.y0 + EDGE && p.y < b.y1 - EDGE;

  for (const f of fixtures) {
    const id = f.placement.id;
    const body = samples(f, -f.w / 2, f.w / 2, -f.d / 2, f.d / 2);
    if (body.some((p) => !insidePolygon(p, room))) problems.push({ kind: 'outside-room', ids: [id], detail: 'a point of the footprint is outside the room' });
    for (const column of doc.room.columns) {
      if (body.some((p) => insidePolygon(p, column.outline))) problems.push({ kind: 'column', ids: [id], detail: column.id });
    }
    for (const other of fixtures) {
      if (other.placement.id <= id) continue;
      if (body.some((p) => insideFixture(other, p, EDGE))) problems.push({ kind: 'overlap', ids: [id, other.placement.id], detail: 'footprints share floor' });
    }
    for (const zone of keepClear) {
      const hit = body.some((p) => zone.boxes.some((b) => inBox(p, b)) || zone.discs.some((c) => Math.hypot(p.x - c.cx, p.y - c.cy) < c.r - EDGE && inBox(p, c.within)));
      if (hit) problems.push({ kind: 'keep-clear', ids: [id], detail: zone.name });
    }
    for (const w of windows) {
      if (f.variant.heightUm! > w.sillUm && body.some((p) => inBox(p, w.band))) problems.push({ kind: 'window', ids: [id], detail: w.name });
    }
    // Clear floor on every side people use.
    for (const side of accessSides(f, aisle, mainAisle, staff)) {
      const y0 = side.side === 1 ? f.d / 2 : -f.d / 2 - side.depth;
      const zone = samples(f, -f.w / 2, f.w / 2, y0, y0 + side.depth);
      if (zone.some((p) => !insidePolygon(p, room))) problems.push({ kind: 'access', ids: [id], detail: 'the clear floor beside it runs through a wall' });
      for (const other of fixtures) {
        if (other !== f && zone.some((p) => insideFixture(other, p, EDGE))) problems.push({ kind: 'access', ids: [id, other.placement.id], detail: 'another fixture stands in its clear floor' });
      }
      for (const column of doc.room.columns) {
        if (zone.some((p) => insidePolygon(p, column.outline))) problems.push({ kind: 'access', ids: [id], detail: `column ${column.id} stands in its clear floor` });
      }
    }
    // Single-sided units: the middle of the back is on a wall or on another unit's back.
    if (f.product.placement === 'wall') {
      const back = world(f, { x: 0, y: -f.d / 2 });
      const onWall = distanceToPolygonEdge(back, room) < MM;
      const onPartner = fixtures.some((o) => o !== f && o.product.placement === 'wall' && Math.abs(local(o, back).y + o.d / 2) < MM && Math.abs(local(o, back).x) < o.w / 2 + MM && o.cos * f.cos + o.sin * f.sin < -0.999);
      if (!onWall && !onPartner) problems.push({ kind: 'free-back', ids: [id], detail: 'its back is neither on a wall nor on another unit' });
    }
  }

  // Walking: flood fill over a grid. A cell is walkable for a walker `width` wide when its centre
  // is at least half that width from every wall, column and fixture. The oracle is LENIENT by one
  // cell on each side, so it never complains about a legal aisle; it catches real blockages.
  const xs = room.map((p) => p.x);
  const ys = room.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const nx = Math.ceil((Math.max(...xs) - x0) / CELL);
  const ny = Math.ceil((Math.max(...ys) - y0) / CELL);
  const centre = (i: number, j: number): Point => ({ x: x0 + (i + 0.5) * CELL, y: y0 + (j + 0.5) * CELL });
  const reach = (width: number): Uint8Array => {
    const need = width / 2 - CELL;
    const free = new Uint8Array(nx * ny);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const p = centre(i, j);
        if (!insidePolygon(p, room) || distanceToPolygonEdge(p, room) < need) continue;
        if (doc.room.columns.some((c) => insidePolygon(p, c.outline) || distanceToPolygonEdge(p, c.outline) < need)) continue;
        if (fixtures.some((f) => distanceToFixture(f, p) < need)) continue;
        free[i * ny + j] = 1;
      }
    }
    const start = { x: entrance.at.x + entrance.inward.x * (width / 2 + 2 * CELL), y: entrance.at.y + entrance.inward.y * (width / 2 + 2 * CELL) };
    const seen = new Uint8Array(nx * ny);
    const queue: number[] = [];
    // Start from the free cell nearest the point just inside the door.
    let best = -1;
    let bestD = 1500 * MM;
    for (let k = 0; k < nx * ny; k++) {
      if (free[k] !== 1) continue;
      const p = centre(Math.floor(k / ny), k % ny);
      const d = Math.hypot(p.x - start.x, p.y - start.y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      seen[best] = 1;
      queue.push(best);
    }
    while (queue.length > 0) {
      const k = queue.pop()!;
      const i = Math.floor(k / ny);
      const j = k % ny;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const n = a * ny + b;
        if (free[n] === 1 && seen[n] === 0) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    return seen;
  };
  const reachedIn = (seen: Uint8Array, f: Fixture, side: 1 | -1, depth: number): boolean => {
    for (let k = 0; k < nx * ny; k++) {
      if (seen[k] !== 1) continue;
      const q = local(f, centre(Math.floor(k / ny), k % ny));
      const ahead = side === 1 ? q.y - f.d / 2 : -q.y - f.d / 2;
      if (Math.abs(q.x) <= f.w / 2 && ahead >= 0 && ahead <= depth + CELL) return true;
    }
    return false;
  };
  if (fixtures.length > 0) {
    const customers = reach(aisle);
    const staffWalk = reach(settings.staffPassageMm * MM);
    const main = reach(mainAisle);
    for (const f of fixtures) {
      for (const side of accessSides(f, aisle, mainAisle, staff)) {
        const seen = side.staff ? staffWalk : customers;
        if (!reachedIn(seen, f, side.side, side.depth)) problems.push({ kind: 'unreachable', ids: [f.placement.id], detail: side.staff ? 'staff cannot get behind it' : 'customers cannot walk to it from the entrance' });
      }
      if (f.product.placement === 'counter' && !reachedIn(main, f, 1, mainAisle)) problems.push({ kind: 'main-aisle', ids: [f.placement.id], detail: 'no main-aisle-wide way from the entrance' });
    }
  }
  return problems;
}
