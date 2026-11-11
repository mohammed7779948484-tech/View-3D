/** Exact-size placeholder boxes: one instanced draw call for all of them, or one mesh each (for comparison). */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import type { SceneBox } from './boxes';

const COLORS: Record<SceneBox['category'], string> = {
  showcase: '#7fb2d6',
  counter: '#c98a4b',
  gondola: '#8a9aa8',
  tower: '#6d7f8c',
  slatwall: '#a7b3bc',
  accessory: '#b5a27a',
};
const UP = new Vector3(0, 1, 0);

export function FixtureBoxes({ boxes, instanced, shadows }: { boxes: readonly SceneBox[]; instanced: boolean; shadows: boolean }) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new MeshLambertMaterial(), []);
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (m === null) return;
    const matrix = new Matrix4();
    const turn = new Quaternion();
    boxes.forEach((b, i) => {
      turn.setFromAxisAngle(UP, b.yawRad);
      m.setMatrixAt(i, matrix.compose(new Vector3(...b.center), turn, new Vector3(...b.size)));
      m.setColorAt(i, new Color(COLORS[b.category]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor !== null) m.instanceColor.needsUpdate = true;
    // Bounds from the instances, not from the unit box, so the boxes are never culled by mistake.
    m.computeBoundingSphere();
  }, [boxes]);

  if (instanced) {
    return (
      <instancedMesh
        ref={mesh}
        args={[geometry, material, boxes.length]}
        userData={{ boxIds: boxes.map((b) => b.id) }}
        castShadow={shadows}
        receiveShadow={shadows}
      />
    );
  }
  return (
    <>
      {boxes.map((b) => (
        <mesh
          key={b.id}
          geometry={geometry}
          position={b.center}
          rotation-y={b.yawRad}
          scale={b.size}
          userData={{ boxId: b.id }}
          castShadow={shadows}
          receiveShadow={shadows}
        >
          <meshLambertMaterial color={COLORS[b.category]} />
        </mesh>
      ))}
    </>
  );
}
