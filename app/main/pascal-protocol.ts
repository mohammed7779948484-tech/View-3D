/**
 * Phase 1 of docs/decisions/0008: the `view3d://app/` scheme that serves the bundled Pascal page and its assets.
 * Pascal's editor asks for absolute paths such as `/icons/select.webp`; under `file://` those point at the drive
 * root, so the Pascal window gets an origin of its own that maps `/` to the built renderer folder.
 */
import { isAbsolute, relative, resolve } from 'node:path';

export const PASCAL_SCHEME = 'view3d';
export const PASCAL_PAGE_URL = 'view3d://app/pascal/index.html';
const PREFIX = 'view3d://app/';

/** The absolute file under `rootDir` for a `view3d://app/<path>` URL, or null when it is not one or would leave `rootDir`. */
export function pascalFilePath(url: string, rootDir: string): string | null {
  if (!url.startsWith(PREFIX)) return null;
  const raw = url.slice(PREFIX.length).split(/[?#]/, 1)[0] ?? '';
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Only plain relative paths: no backslashes, no NUL, no empty, `.` or `..` segments, no drive letter.
  if (path === '' || path.includes('\\') || path.includes('\0')) return null;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..') || /^[a-zA-Z]:/.test(segments[0]!)) return null;
  const file = resolve(rootDir, ...segments);
  const inside = relative(rootDir, file);
  return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside) ? file : null;
}
