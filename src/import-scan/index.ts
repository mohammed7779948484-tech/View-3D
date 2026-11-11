/** Room scans: one adapter per scan app, one shared normalization into a room. */
import { normalizeScan } from './normalize';
import { readRoomTrace } from './roomtrace';
import type { ScanImportResult } from './scan-model';

export * from './scan-model';
export { normalizeScan } from './normalize';
export { readRoomTrace } from './roomtrace';

/** Reads a parsed RoomTrace export into a room, or explains why it cannot. Never throws. */
export function importRoomTrace(json: unknown): ScanImportResult {
  const read = readRoomTrace(json);
  return read.ok ? normalizeScan(read.scan) : read;
}
