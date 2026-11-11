/**
 * Reads the boxes back from the live three.js scene graph (not from the document), so tests can
 * compare what is drawn with the document within 1 mm. Read-only: it changes nothing in the scene.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';

export type DescribedBox = { id: string; center: [number, number, number]; size: [number, number, number]; yawRad: number };

declare global {
  interface Window {
    __view3dScene?: { describe(): { boxes: DescribedBox[] } };
  }
}

function describeMatrix(id: string, world: Matrix4, geometrySize: Vector3): DescribedBox {
  const position = new Vector3();
  const turn = new Quaternion();
  const scale = new Vector3();
  world.decompose(position, turn, scale);
  return {
    id,
    center: [position.x, position.y, position.z],
    size: [geometrySize.x * scale.x, geometrySize.y * scale.y, geometrySize.z * scale.z],
    // The boxes only ever turn about +y, so the quaternion is (0, sin(yaw/2), 0, cos(yaw/2)).
    yawRad: 2 * Math.atan2(turn.y, turn.w),
  };
}

export function describeScene(scene: Object3D): { boxes: DescribedBox[] } {
  scene.updateMatrixWorld(true);
  const boxes: DescribedBox[] = [];
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.computeBoundingBox();
    const size = (o.geometry.boundingBox ?? new Box3()).getSize(new Vector3());
    if (o instanceof InstancedMesh && Array.isArray(o.userData['boxIds'])) {
      const ids = o.userData['boxIds'] as string[];
      const local = new Matrix4();
      ids.forEach((id, i) => {
        o.getMatrixAt(i, local);
        boxes.push(describeMatrix(id, local.clone().premultiply(o.matrixWorld), size));
      });
    } else if (typeof o.userData['boxId'] === 'string') {
      boxes.push(describeMatrix(o.userData['boxId'] as string, o.matrixWorld, size));
    }
  });
  return { boxes };
}

/** Exposes `window.__view3dScene.describe()` while mounted inside a Canvas; tells the parent when it is ready. */
export function SceneProbe({ onReady }: { onReady?: () => void }) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    window.__view3dScene = { describe: () => describeScene(scene) };
    onReady?.();
    return () => {
      delete window.__view3dScene;
    };
  }, [scene, onReady]);
  return null;
}
