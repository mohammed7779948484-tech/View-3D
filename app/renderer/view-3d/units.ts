/**
 * The one place where document units become scene units. Scene unit = metre, scene y is up.
 * Plan x is scene x and plan y is scene -z, so the plan seen from above keeps its orientation.
 * A plan rotation turns counter-clockwise seen from above, which is a positive turn about scene +y.
 */
const UM_PER_M = 1_000_000;
const UDEG_PER_DEG = 1_000_000;

export const umToScene = (um: number): number => um / UM_PER_M;

export const planToScene = (p: { x: number; y: number }): { x: number; z: number } => ({
  x: umToScene(p.x),
  z: -umToScene(p.y) || 0,
});

export const rotationToYaw = (udeg: number): number => ((udeg / UDEG_PER_DEG) * Math.PI) / 180;
