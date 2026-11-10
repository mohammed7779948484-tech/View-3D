/** Not part of `pnpm test`. Renders snapshots/**.svg to snapshots-png/**.png for viewing. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { svgToPng } from '../../src/render-svg/png';
import { SNAPSHOT_ROOT } from './snapshot';

const OUT = resolve(SNAPSHOT_ROOT, '../snapshots-png');

function svgFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => (e.isDirectory() ? svgFiles(join(dir, e.name)) : e.name.endsWith('.svg') ? [join(dir, e.name)] : []));
}

it('renders every snapshot SVG to PNG', () => {
  const files = svgFiles(SNAPSHOT_ROOT);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const out = join(OUT, relative(SNAPSHOT_ROOT, file).replace(/\.svg$/, '.png'));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, svgToPng(readFileSync(file, 'utf8'), 2000));
  }
});
