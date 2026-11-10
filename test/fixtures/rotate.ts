/** Turn a whole room about the origin, to prove that results do not depend on how the shop is oriented. */
import type { Point, Room } from '../../src/core/index';

export function rotateRoom(room: Room, degrees: number): Room {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const turn = (p: Point): Point => ({
    x: Math.round(p.x * cos - p.y * sin) + 0,
    y: Math.round(p.x * sin + p.y * cos) + 0,
  });
  return {
    ...room,
    outline: room.outline.map(turn),
    columns: room.columns.map((c) => ({ ...c, outline: c.outline.map(turn) })),
  };
}
