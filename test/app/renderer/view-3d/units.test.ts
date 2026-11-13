/** The one place where document units (micrometres, micro-degrees, plan axes) become scene units (metres, y up). */
import { describe, expect, it } from 'vitest';
import { planToScene, rotationToYaw, umToScene } from '../../../../app/renderer/view-3d/units';

describe('umToScene', () => {
  it('converts micrometres to metres', () => {
    expect(umToScene(1_828_800)).toBeCloseTo(1.8288, 9);
    expect(umToScene(0)).toBeCloseTo(0, 9);
    expect(umToScene(-1_000_000)).toBeCloseTo(-1, 9);
  });
});

describe('planToScene', () => {
  it('plan x is scene x, plan y is scene -z', () => {
    const a = planToScene({ x: 12_100_000, y: 1_000_000 });
    expect(a.x).toBeCloseTo(12.1, 9);
    expect(a.z).toBeCloseTo(-1, 9);
    const b = planToScene({ x: 0, y: -2_500_000 });
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.z).toBeCloseTo(2.5, 9);
  });
});

describe('rotationToYaw', () => {
  // Sign, by hand: a plan rotation of +90 deg turns plan +x into plan +y, which is scene -z.
  // three.js rotating (1,0,0) by +PI/2 about +y gives (0,0,-1). So yaw = +rotation.
  it('converts micro-degrees to radians about +y, same sign', () => {
    expect(rotationToYaw(0)).toBeCloseTo(0, 9);
    expect(rotationToYaw(90_000_000)).toBeCloseTo(Math.PI / 2, 9);
    expect(rotationToYaw(30_000_000)).toBeCloseTo(Math.PI / 6, 9);
    expect(rotationToYaw(116_565_051)).toBeCloseTo((116.565051 * Math.PI) / 180, 9);
  });
});
