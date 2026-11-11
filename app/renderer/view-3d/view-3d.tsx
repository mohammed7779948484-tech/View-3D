/**
 * The open project in 3D: the floor, the walls and one exact-size box per fixture, all derived
 * from the document (nothing here keeps its own copy). Fixtures with a layout problem are red.
 * Renders only when something changes (frameloop "demand"); with no WebGL it says so.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Plane, Shape, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DesignDocument, Point } from '../../../src/core/index';
import { snap } from '../editor-2d/geometry';
import { sceneBoxes } from './boxes';
import { FixtureBoxes } from './fixture-boxes';
import { SceneProbe } from './scene-probe';
import { planToScene, umToScene } from './units';
import { graphicsName } from './webgl';

/** 3D pointer work snaps to the same 100 mm grid as drawing in 2D. */
const GRID_UM = 100_000;
const FLOOR = new Plane(new Vector3(0, 1, 0), 0);

/** The plan point (um, on the grid) under the pointer, on the floor. */
function floorPoint(e: ThreeEvent<PointerEvent | MouseEvent>): Point | null {
  const hit = e.ray.intersectPlane(FLOOR, new Vector3());
  return hit === null ? null : { x: snap(hit.x * 1_000_000, GRID_UM), y: snap(-hit.z * 1_000_000, GRID_UM) };
}

/** Walls are drawn this thick (metres), outside the room's outline so the inside stays exact. */
const WALL_THICKNESS_M = 0.1;
export type CameraPreset = 'top' | 'corner';

type Frame = { centre: { x: number; z: number }; span: number };

function frameOf(doc: DesignDocument): Frame {
  const pts = doc.room.outline.map(planToScene);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  return {
    centre: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 },
    span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
  };
}

function Room({ doc, onFloorClick }: { doc: DesignDocument; onFloorClick?: (point: Point) => void }) {
  const outline = doc.room.outline;
  const height = umToScene(doc.room.ceilingHeightUm);
  const floor = useMemo(() => {
    const shape = new Shape();
    outline.forEach((p, i) => (i === 0 ? shape.moveTo(umToScene(p.x), umToScene(p.y)) : shape.lineTo(umToScene(p.x), umToScene(p.y))));
    return shape;
  }, [outline]);
  return (
    <>
      {/* The plan's (x, y) lies in the shape's plane; turning it flat puts plan y on scene -z. */}
      <mesh
        rotation-x={-Math.PI / 2}
        onClick={(e) => {
          const p = onFloorClick === undefined ? null : floorPoint(e);
          if (p !== null) onFloorClick?.(p);
        }}
      >
        <shapeGeometry args={[floor]} />
        <meshLambertMaterial color="#e3e7ea" />
      </mesh>
      {outline.map((a, i) => {
        const b = outline[(i + 1) % outline.length]!;
        const dx = umToScene(b.x - a.x);
        const dy = umToScene(b.y - a.y);
        const length = Math.hypot(dx, dy);
        // Outward is the right of the wall's direction for a counter-clockwise outline.
        const ox = (dy / length) * (WALL_THICKNESS_M / 2);
        const oy = (-dx / length) * (WALL_THICKNESS_M / 2);
        const mid = planToScene({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        return (
          <mesh key={i} position={[mid.x + ox, height / 2, mid.z - oy]} rotation-y={Math.atan2(dy, dx)}>
            <boxGeometry args={[length + WALL_THICKNESS_M * 2, height, WALL_THICKNESS_M]} />
            <meshLambertMaterial color="#b9c2ca" transparent opacity={0.45} />
          </mesh>
        );
      })}
    </>
  );
}

function CameraRig({ frame, preset, controls }: { frame: Frame; preset: CameraPreset; controls: { current: OrbitControls | null } }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.addEventListener('change', () => invalidate());
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl, invalidate]);
  useEffect(() => {
    const { centre, span } = frame;
    if (preset === 'top') camera.position.set(centre.x, span * 1.3, centre.z + 0.001);
    else camera.position.set(centre.x + span * 0.8, span * 0.75, centre.z + span * 0.8);
    controls.current?.target.set(centre.x, 0, centre.z);
    controls.current?.update();
    invalidate();
  }, [camera, frame, preset, invalidate]);
  return null;
}

type Props = {
  document: DesignDocument;
  problemIds: ReadonlySet<string>;
  /** A press on a box selects it. */
  onSelect: (id: string) => void;
  /** A box was dragged and released, moved by this snapped delta. */
  onMove: (id: string, dxUm: number, dyUm: number) => void;
  /** Set while a product waits to be placed: a click on the floor places it there. */
  onPlace?: (point: Point) => void;
};

/**
 * The same editing as the 2D plan, through the same commands: press a box to select it, drag it
 * on the floor (snapped deltas, the camera holds still meanwhile), click the floor to place.
 */
function BoxEditing({ boxes, onSelect, onMove, controls, children }: { boxes: readonly { id: string }[]; onSelect: Props['onSelect']; onMove: Props['onMove']; controls: { current: OrbitControls | null }; children: ReactNode }) {
  // In a ref, so no pointer event reads a stale drag (lesson of M3 issue 2).
  const drag = useRef<{ id: string; from: Point } | null>(null);
  const end = (e: ThreeEvent<PointerEvent>): void => {
    const now = drag.current;
    drag.current = null;
    if (controls.current !== null) controls.current.enabled = true;
    if (now === null) return;
    (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
    const to = floorPoint(e);
    if (to !== null && (to.x !== now.from.x || to.y !== now.from.y)) onMove(now.id, to.x - now.from.x, to.y - now.from.y);
  };
  return (
    <group
      onPointerDown={(e) => {
        const box = e.instanceId === undefined ? undefined : boxes[e.instanceId];
        const from = floorPoint(e);
        if (box === undefined || from === null) return;
        e.stopPropagation();
        onSelect(box.id);
        drag.current = { id: box.id, from };
        if (controls.current !== null) controls.current.enabled = false;
        (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
      }}
      onPointerUp={end}
    >
      {children}
    </group>
  );
}

export function View3D({ document, problemIds, onSelect, onMove, onPlace }: Props) {
  const { t } = useTranslation();
  const [webgl] = useState(() => graphicsName() !== null);
  const [preset, setPreset] = useState<CameraPreset>('corner');
  const controls = useRef<OrbitControls | null>(null);
  const boxes = useMemo(() => sceneBoxes(document), [document]);
  const frame = useMemo(() => frameOf(document), [document]);
  if (!webgl) return <p role="alert">{t('view3d.noWebgl')}</p>;
  return (
    <div className="view-3d">
      <div className="actions">
        <button type="button" onClick={() => setPreset('top')}>
          {t('view3d.top')}
        </button>
        <button type="button" onClick={() => setPreset('corner')}>
          {t('view3d.corner')}
        </button>
      </div>
      <div className="stage plan">
        <Canvas frameloop="demand" camera={{ fov: 50, near: 0.05, far: 500 }}>
          <color attach="background" args={['#f6f7f5']} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[frame.centre.x + frame.span, frame.span * 2, frame.centre.z + frame.span]} intensity={1.4} />
          <Room doc={document} {...(onPlace === undefined ? {} : { onFloorClick: onPlace })} />
          {onPlace === undefined ? (
            <BoxEditing boxes={boxes} onSelect={onSelect} onMove={onMove} controls={controls}>
              <FixtureBoxes boxes={boxes} instanced shadows={false} problemIds={problemIds} />
            </BoxEditing>
          ) : (
            <FixtureBoxes boxes={boxes} instanced shadows={false} problemIds={problemIds} />
          )}
          <CameraRig frame={frame} preset={preset} controls={controls} />
          <SceneProbe />
        </Canvas>
      </div>
    </div>
  );
}
