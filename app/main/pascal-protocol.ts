/** Phase 1 of docs/decisions/0008: the `view3d://app/` scheme that serves the bundled Pascal page and its assets. */
export const PASCAL_PAGE_URL = 'view3d://app/pascal/index.html';

/** The absolute file under `rootDir` for a `view3d://app/<path>` URL, or null when it is not one or would leave `rootDir`. */
export function pascalFilePath(url: string, rootDir: string): string | null {
  void url;
  void rootDir;
  throw new Error('not implemented');
}
