/**
 * The open project in 3D: the floor, the walls and one exact-size box per fixture, all derived
 * from the document (nothing here keeps its own copy). Fixtures with a layout problem are red.
 * Renders only when something changes (frameloop "demand"); with no WebGL it says so.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Plane, Shape, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ContactShadows, Html } from '@react-three/drei';
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

function frameOf(outline: readonly Point[]): Frame {
  const pts = outline.map(planToScene);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  return {
    centre: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 },
    span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
  };
}

type WallPiece = { position: [number, number, number]; size: [number, number, number]; yawRad: number };

/**
 * Each wall as boxes, outside the shop's outline, with its doors and windows left open: full
 * height between openings, and below a window's sill and above every opening up to the ceiling.
 * A wall runs on by its thickness at both ends, so corners close.
 */
function wallPieces(doc: DesignDocument): WallPiece[] {
  const outline = doc.room.outline;
  const ceiling = umToScene(doc.room.ceilingHeightUm);
  const pieces: WallPiece[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const dx = umToScene(b.x - a.x);
    const dy = umToScene(b.y - a.y);
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    // Outward is the right of the wall's direction for a counter-clockwise outline.
    const out = { x: (dy / length) * (WALL_THICKNESS_M / 2), y: (-dx / length) * (WALL_THICKNESS_M / 2) };
    const yawRad = Math.atan2(dy, dx);
    const piece = (from: number, to: number, bottom: number, top: number): void => {
      if (to - from <= 0 || top - bottom <= 0) return;
      const t = (from + to) / 2 / length;
      const at = planToScene({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      pieces.push({ position: [at.x + out.x, (bottom + top) / 2, at.z - out.y], size: [to - from, top - bottom, WALL_THICKNESS_M], yawRad });
    };
    const holes = doc.room.openings
      .filter((o) => o.wallIndex === i)
      .map((o) => ({ from: umToScene(o.offsetUm), to: umToScene(o.offsetUm + o.widthUm), bottom: umToScene(o.sillHeightUm), top: Math.min(ceiling, umToScene(o.sillHeightUm + o.heightUm)) }))
      .sort((p, q) => p.from - q.from);
    let start = -WALL_THICKNESS_M;
    for (const h of holes) {
      piece(start, h.from, 0, ceiling);
      piece(h.from, h.to, 0, h.bottom);
      piece(h.from, h.to, h.top, ceiling);
      start = Math.max(start, h.to);
    }
    piece(start, length + WALL_THICKNESS_M, 0, ceiling);
  });
  return pieces;
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
          // A drag on the floor turns the camera; only a click (moved at most 2 px) places.
          if (e.delta > 2) return;
          const p = onFloorClick === undefined ? null : floorPoint(e);
          if (p !== null) onFloorClick?.(p);
        }}
      >
        <shapeGeometry args={[floor]} />
        <meshLambertMaterial color="#e3e7ea" />
      </mesh>
      {wallPieces(doc).map((w, i) => (
        <mesh key={i} position={w.position} rotation-y={w.yawRad} userData={{ wallPiece: true }}>
          <boxGeometry args={w.size} />
          <meshLambertMaterial color="#b9c2ca" transparent opacity={0.45} />
        </mesh>
      ))}
    </>
  );
}

/** Which preset to show; `n` changes on every button press, so pressing the active one again re-aims. */
type Aim = { preset: CameraPreset; n: number };

function CameraRig({ frame, aim, controls }: { frame: Frame; aim: Aim; controls: { current: OrbitControls | null } }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.addEventListener('change', () => invalidate());
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl, invalidate]);
  // Re-aimed only when the room's extent or the pressed preset changes, never by a fixture edit.
  const { x, z } = frame.centre;
  const { span } = frame;
  useEffect(() => {
    if (aim.preset === 'top') camera.position.set(x, span * 1.3, z + 0.001);
    else camera.position.set(x + span * 0.8, span * 0.75, z + span * 0.8);
    controls.current?.target.set(x, 0, z);
    controls.current?.update();
    invalidate();
  }, [camera, x, z, span, aim, invalidate]);
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
  const [aim, setAim] = useState<Aim>({ preset: 'corner', n: 0 });
  const press = (preset: CameraPreset): void => setAim((a) => ({ preset, n: a.n + 1 }));
  const controls = useRef<OrbitControls | null>(null);
  const labelLayer = useRef<HTMLDivElement>(null);
  const boxes = useMemo(() => sceneBoxes(document), [document]);
  const outline = document.room.outline;
  const frame = useMemo(() => frameOf(outline), [outline]);
  if (!webgl) return <p role="alert">{t('view3d.noWebgl')}</p>;
  return (
    <div className="view-3d">
      <div className="actions">
        <button type="button" onClick={() => press('top')}>
          {t('view3d.top')}
        </button>
        <button type="button" onClick={() => press('corner')}>
          {t('view3d.corner')}
        </button>
      </div>
      <div className="stage plan relative" ref={labelLayer}>
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
          {boxes.map((b) => (
            // A fixed portal: drei's default target changes once the canvas connects its events, and
            // a label mounted before that would be emptied.
            <Html key={b.id} portal={labelLayer as RefObject<HTMLElement>} position={[b.center[0], b.size[1] + 0.15, b.center[2]]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <span data-3d-label={b.id} className="rounded bg-card/90 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-foreground shadow-sm">
                {b.name}
              </span>
            </Html>
          ))}
          <ContactShadows position={[frame.centre.x, 0.002, frame.centre.z]} scale={frame.span * 1.2} opacity={0.35} blur={2} far={3} frames={1} />
          <CameraRig frame={frame} aim={aim} controls={controls} />
          <SceneProbe />
        </Canvas>
      </div>
    </div>
  );
}
