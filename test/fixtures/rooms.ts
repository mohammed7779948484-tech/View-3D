/**
 * Test rooms for the layout engine. All coordinates are integer micrometres, outlines are
 * counter-clockwise (x right, y up), and wall i runs from outline[i] to outline[(i + 1) % n].
 * Every room has exactly one entrance: the door with `door.isEntrance === true`.
 */
import { toUm } from '../../src/core/index';
import type { Opening, Point, Room } from '../../src/core/index';

const mm = (value: number): number => toUm(value, 'mm');
const pt = (xMm: number, yMm: number): Point => ({ x: mm(xMm), y: mm(yMm) });

const CEILING_MM = 3000;
const DOOR_HEIGHT_MM = 2100;

function door(
  id: string,
  wallIndex: number,
  offsetMm: number,
  widthMm: number,
  isEntrance: boolean,
): Opening {
  return {
    id,
    kind: 'door',
    wallIndex,
    offsetUm: mm(offsetMm),
    widthUm: mm(widthMm),
    heightUm: mm(DOOR_HEIGHT_MM),
    sillHeightUm: 0,
    door: { isEntrance, swing: 'in', hinge: 'start' },
  };
}

function windowOpening(id: string, wallIndex: number, offsetMm: number, widthMm: number): Opening {
  return {
    id,
    kind: 'window',
    wallIndex,
    offsetUm: mm(offsetMm),
    widthUm: mm(widthMm),
    heightUm: mm(1200),
    sillHeightUm: mm(900),
  };
}

/**
 * L-shaped shop, 9 m x 7 m overall, with a 3 m x 3 m notch removed from the top-right corner.
 * Walls: 0 bottom, 1 right (lower part), 2 notch bottom, 3 notch side, 4 top, 5 left.
 * A 400 x 400 mm column stands inside. Entrance (1000 mm, swing in) on the bottom wall;
 * one 2000 mm window on the left wall.
 */
export const lShapeWithColumn: Room = {
  outline: [pt(0, 0), pt(9000, 0), pt(9000, 4000), pt(6000, 4000), pt(6000, 7000), pt(0, 7000)],
  ceilingHeightUm: mm(CEILING_MM),
  columns: [
    { id: 'column-1', outline: [pt(3000, 3000), pt(3400, 3000), pt(3400, 3400), pt(3000, 3400)] },
  ],
  openings: [door('entrance', 0, 4000, 1000, true), windowOpening('window-1', 5, 2500, 2000)],
};

/**
 * Five-sided shop, 8 m x 6 m overall, whose top-right corner is cut by an angled wall from
 * (8 m, 2 m) to (6 m, 6 m). Walls: 0 bottom, 1 right, 2 angled, 3 top, 4 left.
 * Entrance (1000 mm, swing in) on the bottom wall; one 1500 mm window on the left wall.
 */
export const angledWall: Room = {
  outline: [pt(0, 0), pt(8000, 0), pt(8000, 2000), pt(6000, 6000), pt(0, 6000)],
  ceilingHeightUm: mm(CEILING_MM),
  columns: [],
  openings: [door('entrance', 0, 3000, 1000, true), windowOpening('window-1', 4, 2000, 1500)],
};

/**
 * Small 4 m x 5 m rectangle with a 900 mm entrance on the bottom wall. Used with more products
 * than can fit, to test the "did not fit, and why" report.
 */
export const smallRectOverfull: Room = {
  outline: [pt(0, 0), pt(4000, 0), pt(4000, 5000), pt(0, 5000)],
  ceilingHeightUm: mm(CEILING_MM),
  columns: [],
  openings: [door('entrance', 0, 1550, 900, true)],
};

/**
 * 7 m x 5 m rectangle with two doors that must both stay clear: the entrance (1000 mm, swing in)
 * on the bottom wall and an interior door to a back room (900 mm, swing in, not an entrance) on
 * the right wall. Walls: 0 bottom, 1 right, 2 top, 3 left.
 */
export const protectedDoorway: Room = {
  outline: [pt(0, 0), pt(7000, 0), pt(7000, 5000), pt(0, 5000)],
  ceilingHeightUm: mm(CEILING_MM),
  columns: [],
  openings: [door('entrance', 0, 3000, 1000, true), door('back-room-door', 1, 3000, 900, false)],
};

export type FixtureRoom = { name: string; description: string; room: Room };

/** The four rooms with their descriptions, in a fixed order. */
export const fixtureRooms: readonly FixtureRoom[] = [
  {
    name: 'lShapeWithColumn',
    description:
      'L-shaped shop, 9 m x 7 m overall with a 3 m x 3 m notch out of the top-right corner, one 400 mm column, entrance on the bottom wall, window on the left wall.',
    room: lShapeWithColumn,
  },
  {
    name: 'angledWall',
    description:
      'Five-sided shop, 8 m x 6 m overall, top-right corner cut by an angled wall from (8 m, 2 m) to (6 m, 6 m); entrance on the bottom wall, window on the left wall.',
    room: angledWall,
  },
  {
    name: 'smallRectOverfull',
    description:
      'Small 4 m x 5 m rectangle with a 900 mm entrance on the bottom wall; used with more products than can fit.',
    room: smallRectOverfull,
  },
  {
    name: 'protectedDoorway',
    description:
      '7 m x 5 m rectangle with the entrance on the bottom wall and a second interior door to a back room on the right wall; both doorways must stay clear.',
    room: protectedDoorway,
  },
];
