/**
 * Scan model -> room. Orders and joins the walls, reports every gap, puts corner 1 at the origin
 * with wall 1 along +x, attaches windows to walls and lists everything missing or assumed.
 * Nothing is invented: a gap is filled with a straight wall and reported, an unknown sill stays
 * unknown (the window waits for the owner), doors the file cannot describe are only counted.
 */
import type { Point } from '../core/index';
import { area2, distancePointToSegment, dot, validateRoomOutline } from '../geometry/index';
import { normalizeOutline, scanConfig } from '../rules/index';
import type { PendingWindow, ScanFinding, ScanImportResult, ScanModel, ScanWall } from './scan-model';

const UM_PER_MM = 1000;
const MIN_WALLS = 3;

const roundHalfAway = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v)) || 0;
const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
const mm = (um: number): string => `${Math.round(um / UM_PER_MM)} mm`;
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Walls in order around the room, each pointing on from the last; a wall stored backwards is turned. */
function chain(walls: readonly ScanWall[]): ScanWall[] {
  // By id, so every tie below is broken the same way whatever order the file lists the walls in.
  const left = [...walls].sort(byId);
  const first = left.reduce((m, w) => (w.start.x < m.start.x || (w.start.x === m.start.x && w.start.y < m.start.y) ? w : m));
  left.splice(left.indexOf(first), 1);
  const ordered = [first];
  while (left.length > 0) {
    const end = ordered[ordered.length - 1]!.end;
    let best: { index: number; reversed: boolean; key: number } | null = null;
    left.forEach((w, index) => {
      for (const reversed of [false, true]) {
        // Compared in whole mm, so a sub-mm difference never decides; then by id (the list is sorted by id).
        const key = Math.round(distance(end, reversed ? w.end : w.start) / UM_PER_MM);
        if (best === null || key < best.key) best = { index, reversed, key };
      }
    });
    const pick = best as unknown as { index: number; reversed: boolean };
    const [w] = left.splice(pick.index, 1);
    ordered.push(pick.reversed ? { ...w!, start: w!.end, end: w!.start } : w!);
  }
  return ordered;
}

export function normalizeScan(scan: ScanModel): ScanImportResult {
  if (scan.walls.length < MIN_WALLS) {
    return { ok: false, errors: [{ code: 'too-few-walls', message: `The scan has ${scan.walls.length} walls; a room needs at least ${MIN_WALLS}.` }] };
  }
  const walls = chain(scan.walls);
  const n = walls.length;
  const starts = walls.map((w) => w.start);
  const ends = walls.map((w) => w.end);
  const gaps: { after: number; sizeUm: number; filled: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const sizeUm = Math.round(distance(ends[i]!, starts[next]!));
    if (sizeUm === 0) continue;
    const filled = sizeUm > scanConfig.gapCloseUm;
    if (!filled) {
      const mid = { x: roundHalfAway((ends[i]!.x + starts[next]!.x) / 2), y: roundHalfAway((ends[i]!.y + starts[next]!.y) / 2) };
      ends[i] = mid;
      starts[next] = mid;
    }
    gaps.push({ after: i, sizeUm, filled });
  }

  // The outline, and for each scan wall (and each filled gap) the outline wall it became.
  let corners: Point[] = [];
  const wallOf: number[] = [];
  const gapWallOf = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    wallOf.push(corners.length);
    corners.push(starts[i]!);
    if (gaps.some((g) => g.after === i && g.filled)) {
      gapWallOf.set(i, corners.length);
      corners.push(ends[i]!);
    }
  }
  const m = corners.length;
  let turn = (k: number): number => k;
  let turnCorner = (c: number): number => c;
  if (area2(corners) < 0n) {
    // Walked clockwise: walk the other way, keeping corner 1 first. Wall k becomes wall m - 1 - k.
    corners = [corners[0]!, ...corners.slice(1).reverse()];
    turn = (k) => m - 1 - k;
    turnCorner = (c) => (m - c) % m;
  }
  // Corner 1 is the lowest-left corner, so the numbering never depends on how the file stores walls.
  const first = corners.reduce((best, p, i) => (p.x < corners[best]!.x || (p.x === corners[best]!.x && p.y < corners[best]!.y) ? i : best), 0);
  corners = [...corners.slice(first), ...corners.slice(0, first)];
  const mapWall = (k: number): number => (((turn(k) - first) % m) + m) % m;
  const mapCorner = (c: number): number => (((turnCorner(c) - first) % m) + m) % m;

  // Corner 1 at the origin, wall 1 along +x: a rigid move, no length changes.
  const origin = corners[0]!;
  const second = corners[1]!;
  const angle = Math.atan2(second.y - origin.y, second.x - origin.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const place = (p: Point): Point => {
    const x = p.x - origin.x;
    const y = p.y - origin.y;
    return angle === 0 ? { x, y } : { x: roundHalfAway(x * cos + y * sin), y: roundHalfAway(-x * sin + y * cos) };
  };
  const outline = normalizeOutline(corners.map(place));
  if (validateRoomOutline(outline).length > 0) {
    return { ok: false, errors: [{ code: 'outline-invalid', message: 'The scanned walls do not make a room: they cross each other or repeat a corner.' }] };
  }

  const findings: ScanFinding[] = [];
  const gapFindings = gaps.map((g) => {
    // A filled gap is its own wall. A closed gap is a corner: it is reported on the wall that ends
    // there in the finished outline, whichever way the scan stored its walls.
    const wallIndex = g.filled ? mapWall(gapWallOf.get(g.after)!) : (mapCorner(wallOf[(g.after + 1) % n]!) - 1 + m) % m;
    return g.filled
      ? { code: 'gap-filled' as const, wallIndex, sizeUm: g.sizeUm, message: `The scan has a ${mm(g.sizeUm)} gap at wall ${wallIndex + 1}; it is drawn as a straight wall. It may be a doorway: add the door in the editor.` }
      : { code: 'gap-closed' as const, wallIndex, sizeUm: g.sizeUm, message: `A ${mm(g.sizeUm)} gap at the end of wall ${wallIndex + 1} was closed.` };
  });
  findings.push(...gapFindings.sort((a, b) => a.wallIndex - b.wallIndex));

  const pendingWindows: PendingWindow[] = [];
  for (const w of [...scan.windows].sort(byId)) {
    const c = place(w.center);
    let wallIndex = 0;
    let best = Infinity;
    outline.forEach((a, i) => {
      const d = distancePointToSegment(c, a, outline[(i + 1) % outline.length]!);
      if (d < best) {
        best = d;
        wallIndex = i;
      }
    });
    if (best > scanConfig.windowMaxDistanceUm) {
      findings.push({ code: 'window-not-on-wall', windowId: w.id, distanceUm: Math.round(best), message: `A window in the scan is ${mm(best)} from the nearest wall, so it was left out.` });
      continue;
    }
    const a = outline[wallIndex]!;
    const b = outline[(wallIndex + 1) % outline.length]!;
    const wallLength = distance(a, b);
    if (w.widthUm > wallLength) {
      findings.push({ code: 'window-not-on-wall', windowId: w.id, distanceUm: Math.round(best), message: `A window in the scan is wider than the wall it is on (wall ${wallIndex + 1}), so it was left out.` });
      continue;
    }
    const along = Number(dot(a, b, c)) / wallLength;
    const scanned = roundHalfAway(along - w.widthUm / 2);
    // A window that starts before its wall or runs past its end is moved onto it, and the owner is told.
    const offsetUm = Math.min(Math.max(scanned, 0), Math.floor(wallLength - w.widthUm));
    if (offsetUm !== scanned) {
      const movedUm = Math.abs(offsetUm - scanned);
      findings.push({ code: 'window-moved', windowId: w.id, wallIndex, movedUm, message: `The window on wall ${wallIndex + 1} ran past the end of the wall in the scan; it was moved ${mm(movedUm)} to fit. Check it.` });
    }
    pendingWindows.push({ id: w.id, wallIndex, offsetUm, widthUm: w.widthUm, heightUm: w.heightUm });
    findings.push({ code: 'window-sill-unknown', windowId: w.id, wallIndex, message: `The scan does not know the sill height of the window on wall ${wallIndex + 1}. Type it, or leave the window out.` });
  }

  findings.push(
    scan.doorCount === 0
      ? { code: 'no-doors', message: 'The scan has no doors. Add the entrance and every door in the editor.' }
      : { code: 'doors-not-read', count: scan.doorCount, message: `The scan lists ${scan.doorCount} doors, which this version cannot read. Add them in the editor.` },
  );

  const heights = scan.walls.map((w) => w.heightUm).filter((h): h is number => h !== null);
  const min = heights.length > 0 ? Math.min(...heights) : null;
  const max = heights.length > 0 ? Math.max(...heights) : null;
  const ceilingHeightUm = scan.roomHeightUm ?? max;
  if (ceilingHeightUm === null) {
    return { ok: false, errors: [{ code: 'no-height', message: 'The scan has no ceiling or wall height.' }] };
  }
  if (min !== null && max !== null && (max - ceilingHeightUm > scanConfig.heightToleranceUm || ceilingHeightUm - min > scanConfig.heightToleranceUm)) {
    findings.push({ code: 'ceiling-height-varies', minUm: min, maxUm: max, message: `The scanned wall heights vary from ${mm(min)} to ${mm(max)}; the ceiling is set to ${mm(ceilingHeightUm)}. Check it.` });
  }
  findings.push({ code: 'axes-assumed', message: 'The scan is read as seen from above. If the plan looks mirrored compared with the shop, tell us.' });

  return { ok: true, room: { outline, ceilingHeightUm, columns: [], openings: [] }, pendingWindows, findings };
}
