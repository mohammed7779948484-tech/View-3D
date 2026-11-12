/**
 * Reads the boxes back from the live three.js scene graph (not from the document), so tests can
 * compare what is drawn with the document within 1 mm. Read-only: it changes nothing in the scene.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { Camera } from 'three';
import type { Object3D } from 'three';

export type DescribedBox = { id: string; center: [number, number, number]; size: [number, number, number]; yawRad: number; problem: boolean };

declare global {
  interface Window {
    __view3dScene?: { describe(): { boxes: DescribedBox[]; walls: DescribedWall[] }; screenOf(xMm: number, yMm: number): { x: number; y: number } };
  }
}

function describeMatrix(id: string, world: Matrix4, geometrySize: Vector3, problem: boolean): DescribedBox {
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
    problem,
  };
}

export type DescribedWall = { center: [number, number, number]; size: [number, number, number]; yawRad: number };

export function describeScene(scene: Object3D): { boxes: DescribedBox[]; walls: DescribedWall[] } {
  scene.updateMatrixWorld(true);
  const boxes: DescribedBox[] = [];
  const walls: DescribedWall[] = [];
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.computeBoundingBox();
    const size = (o.geometry.boundingBox ?? new Box3()).getSize(new Vector3());
    if (o instanceof InstancedMesh && Array.isArray(o.userData['boxIds'])) {
      const ids = o.userData['boxIds'] as string[];
      const problems = new Set((o.userData['problemIds'] as string[] | undefined) ?? []);
      const local = new Matrix4();
      ids.forEach((id, i) => {
        o.getMatrixAt(i, local);
        boxes.push(describeMatrix(id, local.clone().premultiply(o.matrixWorld), size, problems.has(id)));
      });
    } else if (typeof o.userData['boxId'] === 'string') {
      boxes.push(describeMatrix(o.userData['boxId'] as string, o.matrixWorld, size, o.userData['problem'] === true));
    } else if (o.userData['wallPiece'] === true) {
      const { center, size: s, yawRad } = describeMatrix('wall', o.matrixWorld, size, false);
      walls.push({ center, size: s, yawRad });
    }
  });
  return { boxes, walls };
}

/** Where the floor point at plan (xMm, yMm) is on the page, under the camera as it is now. */
function screenOf(camera: Camera, canvas: HTMLCanvasElement, xMm: number, yMm: number): { x: number; y: number } {
  camera.updateMatrixWorld();
  const v = new Vector3(xMm / 1000, 0, -yMm / 1000).project(camera);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

/** Exposes `window.__view3dScene` (describe, screenOf) while mounted inside a Canvas; tells the parent when it is ready. */
export function SceneProbe({ onReady }: { onReady?: () => void }) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    window.__view3dScene = { describe: () => describeScene(scene), screenOf: (x, y) => screenOf(camera, canvas, x, y) };
    onReady?.();
    return () => {
      delete window.__view3dScene;
    };
  }, [scene, camera, canvas, onReady]);
  return null;
}
