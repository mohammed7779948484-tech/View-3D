/** Phase 1 of docs/decisions/0008: our WebGPU gate asks for exactly what Pascal asks for, an adapter and a device. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PASCAL_ADAPTER_OPTIONS, webGpuReady } from '../../../../app/renderer/pascal/webgpu-gate';
import type { AdapterLike, GpuLike } from '../../../../app/renderer/pascal/webgpu-gate';

const never = <T>(): Promise<T> => new Promise<T>(() => {});

function fakes(features: Iterable<string> | undefined, device: Promise<{ destroy?(): void }>) {
  const requestDevice = vi.fn((_descriptor?: { requiredFeatures?: string[] }) => device);
  const adapter: AdapterLike = features === undefined ? { requestDevice } : { features, requestDevice };
  const requestAdapter = vi.fn((_options?: { featureLevel?: string }) => Promise.resolve<AdapterLike | null>(adapter));
  const gpu: GpuLike = { requestAdapter };
  return { gpu, requestAdapter, requestDevice };
}

describe('webGpuReady', () => {
  it('is false without a gpu object', async () => {
    expect(await webGpuReady(undefined)).toBe(false);
  });

  it('asks for the adapter once, with Pascal\'s options', async () => {
    const f = fakes([], Promise.resolve({}));
    await webGpuReady(f.gpu);
    expect(f.requestAdapter).toHaveBeenCalledTimes(1);
    expect(f.requestAdapter.mock.calls[0]).toEqual([PASCAL_ADAPTER_OPTIONS]);
    expect(f.requestAdapter.mock.calls[0]?.[0]).toEqual({ featureLevel: 'compatibility' });
  });

  it('is false when there is no adapter', async () => {
    const gpu: GpuLike = { requestAdapter: () => Promise.resolve(null) };
    expect(await webGpuReady(gpu)).toBe(false);
  });

  it('is false when requestAdapter rejects', async () => {
    const gpu: GpuLike = { requestAdapter: () => Promise.reject(new Error('no adapter')) };
    expect(await webGpuReady(gpu)).toBe(false);
  });

  it('requests the device once with every adapter feature', async () => {
    const f = fakes(new Set(['depth-clip-control', 'timestamp-query']), Promise.resolve({}));
    await webGpuReady(f.gpu);
    expect(f.requestDevice).toHaveBeenCalledTimes(1);
    expect(f.requestDevice.mock.calls[0]).toEqual([{ requiredFeatures: ['depth-clip-control', 'timestamp-query'] }]);
  });

  it('requests the device with no argument when the adapter has no features', async () => {
    const f = fakes(new Set<string>(), Promise.resolve({}));
    await webGpuReady(f.gpu);
    expect(f.requestDevice).toHaveBeenCalledTimes(1);
    expect(f.requestDevice.mock.calls[0]).toEqual([]);
  });

  it('requests the device with no argument when features is undefined', async () => {
    const f = fakes(undefined, Promise.resolve({}));
    await webGpuReady(f.gpu);
    expect(f.requestDevice).toHaveBeenCalledTimes(1);
    expect(f.requestDevice.mock.calls[0]).toEqual([]);
  });

  it('is false when the device request rejects', async () => {
    const f = fakes(['x'], Promise.reject(new Error('no device')));
    expect(await webGpuReady(f.gpu)).toBe(false);
  });

  it('is true when a device is obtained, and destroys that device once', async () => {
    const destroy = vi.fn();
    const f = fakes(['x'], Promise.resolve({ destroy }));
    expect(await webGpuReady(f.gpu)).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is true for a device that has no destroy method', async () => {
    const f = fakes([], Promise.resolve({}));
    expect(await webGpuReady(f.gpu)).toBe(true);
  });

  it('is false when the adapter is not settled within the timeout', async () => {
    const gpu: GpuLike = { requestAdapter: () => never<AdapterLike | null>() };
    expect(await webGpuReady(gpu, 20)).toBe(false);
  });

  it('is false when the device is not settled within the timeout', async () => {
    const f = fakes(['x'], never<{ destroy?(): void }>());
    expect(await webGpuReady(f.gpu, 20)).toBe(false);
  });
});

describe('the gate follows Pascal', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../../../node_modules/@pascal-app/viewer/dist/lib/renderer-capability.js'), 'utf8');

  it('Pascal still asks for the compatibility adapter and then a device', () => {
    // If a Pascal upgrade asks for more, this fails and webgpu-gate.ts must follow.
    expect(source).toContain("featureLevel: 'compatibility'");
    expect(source).toContain('adapter.requestDevice(');
  });

  it('PASCAL_ADAPTER_OPTIONS is exactly what Pascal passes', () => {
    expect(PASCAL_ADAPTER_OPTIONS).toEqual({ featureLevel: 'compatibility' });
  });
});
