/**
 * Snapshot helper. The committed SVG is the checked artefact. It is compared as text with line
 * endings normalised, so a Windows checkout (CRLF) and a Linux checkout (LF) agree.
 *
 * PNGs are not committed (binary churn, and text rendering depends on installed fonts).
 * Make them locally with `pnpm snapshots:png`; CI uploads them as an artifact.
 *
 * Regenerate the SVGs after an intended change with `pnpm snapshots:update`, then review them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect } from 'vitest';

export const SNAPSHOT_ROOT = resolve(import.meta.dirname, '../../snapshots');

const lf = (text: string): string => text.replace(/\r\n/g, '\n');

export function expectSnapshot(relativePathWithoutExtension: string, svg: string, root: string = SNAPSHOT_ROOT): void {
  const svgPath = resolve(root, `${relativePathWithoutExtension}.svg`);
  if (process.env['UPDATE_SNAPSHOTS'] === '1') {
    mkdirSync(dirname(svgPath), { recursive: true });
    writeFileSync(svgPath, svg);
    return;
  }
  if (!existsSync(svgPath)) {
    throw new Error(`Missing snapshot ${svgPath}. Generate it with: pnpm snapshots:update`);
  }
  expect(
    lf(svg),
    `snapshot ${relativePathWithoutExtension}.svg differs; if the change is intended, run "pnpm snapshots:update" and review the images`,
  ).toBe(lf(readFileSync(svgPath, 'utf8')));
}
