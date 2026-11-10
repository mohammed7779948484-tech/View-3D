/**
 * Snapshot helper. The SVG is the checked artefact: it must match the committed file byte for
 * byte. The PNG beside it is a convenience copy for viewing and is never compared, because text
 * rendering depends on the fonts installed on the machine.
 *
 * Regenerate with:  UPDATE_SNAPSHOTS=1 pnpm test
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect } from 'vitest';
import { svgToPng } from '../../src/render-svg/png';

const ROOT = resolve(import.meta.dirname, '../../snapshots');

export function expectSnapshot(relativePathWithoutExtension: string, svg: string): void {
  const svgPath = resolve(ROOT, `${relativePathWithoutExtension}.svg`);
  if (process.env['UPDATE_SNAPSHOTS'] === '1') {
    mkdirSync(dirname(svgPath), { recursive: true });
    writeFileSync(svgPath, svg);
    writeFileSync(resolve(ROOT, `${relativePathWithoutExtension}.png`), svgToPng(svg, 2000));
    return;
  }
  if (!existsSync(svgPath)) {
    throw new Error(`Missing snapshot ${svgPath}. Generate it with: UPDATE_SNAPSHOTS=1 pnpm test`);
  }
  expect(svg, `snapshot ${relativePathWithoutExtension}.svg differs; if the change is intended, run UPDATE_SNAPSHOTS=1 pnpm test and review the images`).toBe(
    readFileSync(svgPath, 'utf8'),
  );
}
