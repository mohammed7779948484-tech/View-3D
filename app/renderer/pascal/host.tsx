/**
 * Phase 1 of decisions/0008: Pascal's editor showing the L-shaped test shop. Nothing is saved yet; phase 3 adds
 * the adapter that derives our design document from Pascal's scene.
 */
import { useEffect, useState } from 'react';
import { useScene } from '@pascal-app/core';
import { Editor } from '@pascal-app/editor';
import type { SceneGraph } from '@pascal-app/editor';
import { useViewer } from '@pascal-app/viewer';
import lShop from './l-shop.json';
import { webGpuReady } from './webgpu-gate';
import type { GpuLike } from './webgpu-gate';

type GpuState = 'checking' | 'ready' | 'missing';

/** WebGPU only (owner, 2026-11-13): Pascal would quietly fall back to WebGL, so it is not started without a device. */
const hasWebGpu = (): Promise<boolean> => webGpuReady((navigator as Navigator & { gpu?: GpuLike }).gpu);

// The test shop of the Windows trial (decisions/0008): 12.345 x 8.76 m with a 4.105 x 3.215 m corner cut out,
// six walls, one zone (94.94 m²). A room only: no products.
const loadTestShop = (): Promise<SceneGraph> => Promise.resolve(lShop as unknown as SceneGraph);

export function PascalHost() {
  const [gpu, setGpu] = useState<GpuState>('checking');
  // Read by the e2e tests: how many walls Pascal's scene holds, and the unit it shows.
  const walls = useScene((state) => Object.values(state.nodes).filter((node) => node.type === 'wall').length);
  const unit = useViewer((state) => state.unit);
  const textures = useViewer((state) => state.textures);

  useEffect(() => {
    void hasWebGpu().then((ok) => setGpu(ok ? 'ready' : 'missing'));
  }, []);

  return (
    <div data-testid="pascal-host" data-walls={walls} data-unit={unit} data-textures={String(textures)} className="dark" style={{ width: '100vw', height: '100vh' }}>
      {gpu === 'ready' && <Editor layoutVersion="v2" projectId="l-shop-test" projectName="L-shaped test shop" onLoad={loadTestShop} />}
      {gpu === 'missing' && (
        <p role="alert" style={{ color: '#fafafa', padding: 24 }}>
          Pascal's editor needs WebGPU, which this computer does not offer. Close this window; the 2D plan editor works as usual.
        </p>
      )}
    </div>
  );
}
