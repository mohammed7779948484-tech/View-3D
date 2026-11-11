/**
 * Adapter for RoomTrace exports (its own JSON schema v2, not Apple's CapturedRoom). It only reads
 * the file into the shared scan model; metres become integer um right here, at the edge.
 */
import { toUm } from '../core/index';
import type { Point } from '../core/index';
import type { ScanError, ScanModel, ScanWall, ScanWindow } from './scan-model';

const SUPPORTED_VERSION = 2;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const metres = (v: number): number => toUm(v, 'm');

function point(v: unknown): Point | null {
  return isObject(v) && finite(v['x']) && finite(v['y']) ? { x: metres(v['x']), y: metres(v['y']) } : null;
}

const fail = (code: ScanError['code'], message: string): { ok: false; errors: ScanError[] } => ({ ok: false, errors: [{ code, message }] });

export function readRoomTrace(json: unknown): { ok: true; scan: ScanModel } | { ok: false; errors: ScanError[] } {
  if (!isObject(json) || !Array.isArray(json['rooms']) || !('schemaVersion' in json)) {
    return fail('not-roomtrace', 'This file is not a RoomTrace scan.');
  }
  if (json['schemaVersion'] !== SUPPORTED_VERSION) {
    return fail('unsupported-version', `This RoomTrace file uses format version ${String(json['schemaVersion'])}; only version ${SUPPORTED_VERSION} can be read.`);
  }
  const units = json['units'];
  if (!isObject(units) || units['length'] !== 'm') return fail('unsupported-units', 'Only RoomTrace files measured in metres can be read.');
  const rooms = json['rooms'];
  if (rooms.length === 0) return fail('no-rooms', 'The scan has no room in it.');
  if (rooms.length > 1) return fail('several-rooms', `The scan has ${rooms.length} rooms; import one room at a time.`);
  const room = rooms[0];
  if (!isObject(room) || !Array.isArray(room['walls'])) return fail('not-roomtrace', 'This file is not a RoomTrace scan.');

  const walls: ScanWall[] = [];
  for (const [i, w] of room['walls'].entries()) {
    const start = isObject(w) ? point(w['startPoint']) : null;
    const end = isObject(w) ? point(w['endPoint']) : null;
    if (!isObject(w) || start === null || end === null) return fail('bad-wall', `Wall ${i + 1} of the scan has no start or end point.`);
    walls.push({ id: String(w['id'] ?? i), start, end, heightUm: finite(w['height']) ? metres(w['height']) : null });
  }
  const windows: ScanWindow[] = [];
  for (const [i, w] of (Array.isArray(room['windows']) ? room['windows'] : []).entries()) {
    const center = isObject(w) ? point(w['centerPoint']) : null;
    if (!isObject(w) || center === null || !finite(w['width']) || !finite(w['height'])) {
      return fail('bad-wall', `Window ${i + 1} of the scan has no position or size.`);
    }
    windows.push({ id: String(w['id'] ?? i), center, widthUm: metres(w['width']), heightUm: metres(w['height']) });
  }
  const doorCount = Array.isArray(room['doors']) ? room['doors'].length : 0;
  const roomHeightUm = finite(room['height']) ? metres(room['height']) : null;
  return { ok: true, scan: { walls, windows, doorCount, roomHeightUm } };
}
