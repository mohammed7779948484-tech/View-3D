/** What every scan adapter produces: walls as segments, windows by centre, nothing else assumed. */
import type { Point, Room } from '../core/index';

export type ScanWall = { id: string; start: Point; end: Point; heightUm: number | null };
export type ScanWindow = { id: string; center: Point; widthUm: number; heightUm: number };
export type ScanModel = { walls: ScanWall[]; windows: ScanWindow[]; doorCount: number; roomHeightUm: number | null };

export type ScanFinding =
  | { code: 'gap-closed'; wallIndex: number; sizeUm: number; message: string }
  | { code: 'gap-filled'; wallIndex: number; sizeUm: number; message: string }
  | { code: 'window-sill-unknown'; windowId: string; wallIndex: number; message: string }
  | { code: 'window-not-on-wall'; windowId: string; distanceUm: number; message: string }
  | { code: 'window-moved'; windowId: string; wallIndex: number; movedUm: number; message: string }
  | { code: 'no-doors'; message: string }
  | { code: 'doors-not-read'; count: number; message: string }
  | { code: 'ceiling-height-varies'; minUm: number; maxUm: number; message: string }
  | { code: 'axes-assumed'; message: string };

/** A window whose sill height the scan does not know: it joins the room only when the owner types it. */
export type PendingWindow = { id: string; wallIndex: number; offsetUm: number; widthUm: number; heightUm: number };

export type ScanError = {
  code: 'not-roomtrace' | 'unsupported-version' | 'unsupported-units' | 'no-rooms' | 'several-rooms' | 'bad-wall' | 'no-height' | 'too-few-walls' | 'outline-invalid';
  message: string;
};

export type ScanImportResult = { ok: true; room: Room; pendingWindows: PendingWindow[]; findings: ScanFinding[] } | { ok: false; errors: ScanError[] };
