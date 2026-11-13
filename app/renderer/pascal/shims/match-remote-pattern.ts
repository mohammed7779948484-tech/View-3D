/**
 * Stands in for `next/dist/shared/lib/match-remote-pattern` (used by Pascal's node-icon-image.tsx). Nothing remote
 * loads anyway: the main process refuses every remote request and the page's CSP allows only its own files.
 */
export function hasRemoteMatch(): boolean {
  return true;
}
