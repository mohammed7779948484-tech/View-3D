/**
 * Phase 1 of docs/decisions/0008: the WebGPU check asks for exactly what Pascal asks for (adapter and device).
 * Pascal falls back to WebGL when it gets no device; the owner allows WebGPU only, so Pascal starts only when this
 * check would give Pascal its device. test/app/renderer/pascal/webgpu-gate.test.ts also reads Pascal's own start-up
 * code, so an upgrade that asks for more fails there.
 */

/** The adapter options Pascal's detectRendererCapability passes (@pascal-app/viewer 1.1.4). */
export const PASCAL_ADAPTER_OPTIONS = { featureLevel: 'compatibility' } as const;

export type AdapterLike = {
  features?: Iterable<string>;
  requestDevice(descriptor?: { requiredFeatures?: string[] }): Promise<{ destroy?(): void }>;
};

export type GpuLike = {
  requestAdapter(options?: { featureLevel?: string }): Promise<AdapterLike | null>;
};

const TIMED_OUT = Symbol('timed out');

/** The promise's value, or TIMED_OUT when it has not settled after `ms`. A rejection passes through. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** True when the computer offers a WebGPU device the way Pascal asks for one (Pascal's own 4 s limit). */
export async function webGpuReady(gpu: GpuLike | undefined, timeoutMs = 4000): Promise<boolean> {
  if (gpu === undefined) return false;
  try {
    const adapter = await within(gpu.requestAdapter({ ...PASCAL_ADAPTER_OPTIONS }), timeoutMs);
    if (adapter === TIMED_OUT || adapter === null) return false;
    const features = adapter.features === undefined ? [] : [...adapter.features];
    const pending = features.length > 0 ? adapter.requestDevice({ requiredFeatures: features }) : adapter.requestDevice();
    const device = await within(pending, timeoutMs);
    if (device === TIMED_OUT) {
      // A device that arrives after we gave up would count against the browser's device limit: release it.
      pending.then((late) => late.destroy?.()).catch(() => undefined);
      return false;
    }
    // Pascal asks for its own device; this one only proved that it can.
    device.destroy?.();
    return true;
  } catch {
    return false;
  }
}
