/** Phase 1 of docs/decisions/0008: the WebGPU check asks for exactly what Pascal asks for (adapter and device). */

/** The adapter options Pascal's detectRendererCapability passes (@pascal-app/viewer 1.1.4). */
export const PASCAL_ADAPTER_OPTIONS = { featureLevel: 'compatibility' } as const;

export type AdapterLike = {
  features?: Iterable<string>;
  requestDevice(descriptor?: { requiredFeatures?: string[] }): Promise<{ destroy?(): void }>;
};

export type GpuLike = {
  requestAdapter(options?: { featureLevel?: string }): Promise<AdapterLike | null>;
};

export async function webGpuReady(_gpu: GpuLike | undefined, _timeoutMs = 4000): Promise<boolean> {
  throw new Error('not implemented');
}
