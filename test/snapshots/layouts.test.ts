/** Snapshot gallery: every ranked option of every scenario, for the owner to judge. */
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { rectCorners } from '../../src/geometry/index';
import { autoLayout } from '../../src/layout/index';
import { renderPlanSvg } from '../../src/render-svg/index';
import { defaultConfig, keepClearZones, placedFixtures } from '../../src/rules/index';
import { scenarios } from '../layout/scenarios';
import { expectSnapshot, SNAPSHOT_ROOT } from './snapshot';

describe('layout snapshots', () => {
  for (const request of scenarios) {
    it(`${request.id}: every ranked option`, () => {
      // When regenerating, drop the old files first so a scenario never keeps a stale option.
      if (process.env['UPDATE_SNAPSHOTS'] === '1') rmSync(resolve(SNAPSHOT_ROOT, 'layouts', request.id), { recursive: true, force: true });
      for (const option of autoLayout(request).options) {
        const svg = renderPlanSvg(option.document, {
          title: request.name,
          subtitle: `Score ${option.score.toFixed(1)} / 100  ·  ${option.strategy.description}`,
          rank: option.rank,
          zones: keepClearZones(request.room, defaultConfig),
          accessZones: placedFixtures(option.document, defaultConfig).flatMap((f) =>
            f.zones.map((z) => ({ placementId: f.placement.id, kind: z.kind, polygon: rectCorners(z.rect) })),
          ),
          aisles: option.aisles,
          unplaced: option.unplaced.map((u) => ({ name: u.name, quantity: u.quantity, reason: u.reason })),
          scoreLines: option.scoreBreakdown.map((t) => `${t.points.toFixed(1)} / ${t.weight}  ${t.term}: ${t.note}`),
        });
        expectSnapshot(`layouts/${request.id}/option-${option.rank}`, svg);
      }
    });
  }
});
