/**
 * Room checks that run before any layout rule. A room that fails here is reported as the problem;
 * nothing is placed in it and no layout in it is ever called valid.
 */
import type { Opening, Room } from '../core/index';
import { differencePolygons, isCounterClockwise, validateRoomOutline, wallSegments } from '../geometry/index';
import type { OutlineProblemCode, Point } from '../geometry/index';

export type RoomProblemCode =
  | OutlineProblemCode
  | 'opening-wall-missing'
  | 'opening-off-wall'
  | 'openings-overlap'
  | 'opening-above-ceiling'
  | 'column-outside-room'
  | 'no-entrance';

export type RoomProblem = {
  code: RoomProblemCode;
  /** Plain English for the owner; walls and corners are numbered from 1. */
  message: string;
  openingId?: string;
  otherOpeningId?: string;
  columnId?: string;
  /** Zero-based wall or corner index, when the problem is about one. */
  index?: number;
  /** The numbers in the message (lengths in um), so the app can word it in any language by code. */
  values?: Record<string, number>;
};

/** Openings may touch end to end; they overlap when they share more than this length. */
const OPENING_OVERLAP_TOLERANCE_UM = 2;

const mm = (um: number): string => `${Math.round(um / 1000)} mm`;
const kindName = (o: Opening): string => (o.kind === 'window' ? 'Window' : o.door?.isEntrance === true ? 'Entrance' : 'Door');

const OUTLINE_TEXT: Record<OutlineProblemCode, string> = {
  'too-few-vertices': 'The shop needs at least 3 corners.',
  'non-integer-coordinate': 'A corner position is not a whole number of micrometres.',
  'coordinate-out-of-range': 'A corner is more than 100 m from the origin.',
  'zero-length-edge': 'Two corners in a row are the same point. Remove the repeated corner.',
  'self-intersection': 'The outline crosses or touches itself. Check the order of the corners.',
  clockwise: 'The outline runs clockwise. List the corners counter-clockwise (reverse their order).',
};

/** Every entrance door, in document order. The first one is the main entrance. */
export function entrancesOf(room: Room): Opening[] {
  return room.openings.filter((o) => o.kind === 'door' && o.door?.isEntrance === true);
}

/**
 * Problems that make a room unusable, in a fixed order; [] means the room is sound.
 * Several entrances are allowed: each gets its own clear zone and every fixture must be
 * reachable from each of them. A room with no entrance is a problem, because the walking rules
 * cannot be checked without one.
 */
export function validateRoom(room: Room): RoomProblem[] {
  const outline = validateRoomOutline(room.outline);
  if (outline.length > 0) {
    // Geometry below is meaningless on a broken outline, so stop here.
    return outline.map((p) => ({
      code: p.code,
      message: `${OUTLINE_TEXT[p.code]}${p.index === undefined ? '' : ` (at ${p.code === 'self-intersection' ? 'wall' : 'corner'} ${p.index + 1})`}`,
      ...(p.index === undefined ? {} : { index: p.index }),
    }));
  }
  const problems: RoomProblem[] = [];
  const walls = wallSegments(room.outline);
  const onWall: Opening[] = [];
  for (const o of room.openings) {
    const wall = walls[o.wallIndex];
    if (wall === undefined) {
      problems.push({
        code: 'opening-wall-missing',
        message: `${kindName(o)} "${o.id}" is on wall ${o.wallIndex + 1}, but the shop has only ${walls.length} walls.`,
        openingId: o.id,
        values: { wallNumber: o.wallIndex + 1, wallCount: walls.length },
      });
      continue;
    }
    const over = o.offsetUm + o.widthUm - wall.lengthUm;
    if (o.offsetUm < 0 || o.widthUm <= 0 || over > 0.5) {
      problems.push({
        code: 'opening-off-wall',
        message:
          over > 0.5
            ? `${kindName(o)} "${o.id}" is ${mm(o.widthUm)} wide and starts ${mm(o.offsetUm)} along wall ${o.wallIndex + 1}, which is ${mm(wall.lengthUm)} long: it runs ${mm(over)} past the end of the wall.`
            : `${kindName(o)} "${o.id}" does not lie on wall ${o.wallIndex + 1}: check its position and width.`,
        openingId: o.id,
        index: o.wallIndex,
        values: { widthUm: o.widthUm, offsetUm: o.offsetUm, wallLengthUm: wall.lengthUm, ...(over > 0.5 ? { overUm: over } : {}) },
      });
      continue;
    }
    onWall.push(o);
  }
  for (let i = 0; i < onWall.length; i++) {
    for (let j = i + 1; j < onWall.length; j++) {
      const a = onWall[i]!;
      const b = onWall[j]!;
      if (a.wallIndex !== b.wallIndex) continue;
      const shared = Math.min(a.offsetUm + a.widthUm, b.offsetUm + b.widthUm) - Math.max(a.offsetUm, b.offsetUm);
      if (shared > OPENING_OVERLAP_TOLERANCE_UM) {
        problems.push({
          code: 'openings-overlap',
          message: `${kindName(a)} "${a.id}" and ${kindName(b).toLowerCase()} "${b.id}" overlap by ${mm(shared)} on wall ${a.wallIndex + 1}.`,
          openingId: a.id,
          otherOpeningId: b.id,
          index: a.wallIndex,
          values: { sharedUm: shared },
        });
      }
    }
  }
  for (const o of onWall) {
    const topUm = o.sillHeightUm + o.heightUm;
    if (topUm > room.ceilingHeightUm) {
      problems.push({
        code: 'opening-above-ceiling',
        message: `${kindName(o)} "${o.id}" reaches ${mm(topUm)} above the floor, higher than the ${mm(room.ceilingHeightUm)} ceiling.`,
        openingId: o.id,
        index: o.wallIndex,
        values: { topUm, ceilingUm: room.ceilingHeightUm },
      });
    }
  }
  for (const column of room.columns) {
    // Any part of the column outside the room; touching a wall from inside leaves nothing.
    if (differencePolygons([column.outline], [room.outline]).length > 0) {
      problems.push({ code: 'column-outside-room', message: `Column "${column.id}" is not completely inside the shop.`, columnId: column.id });
    }
  }
  if (entrancesOf(room).length === 0) {
    problems.push({
      code: 'no-entrance',
      message: 'The shop has no entrance. Mark one door as the entrance; aisles are checked from there.',
    });
  }
  return problems;
}

/**
 * Tidy an outline as it comes from the phone or the editor: drop corners repeated in a row
 * (including a closing copy of the first corner) and make the order counter-clockwise, keeping
 * the first corner first. It does not repair a self-intersecting outline.
 */
export function normalizeOutline(outline: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of outline) {
    const last = out[out.length - 1];
    if (last === undefined || last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y });
  }
  while (out.length > 1 && out[0]!.x === out[out.length - 1]!.x && out[0]!.y === out[out.length - 1]!.y) out.pop();
  if (out.length >= 3 && !isCounterClockwise(out)) return [out[0]!, ...out.slice(1).reverse()];
  return out;
}
