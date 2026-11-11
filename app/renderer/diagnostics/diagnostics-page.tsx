/**
 * Diagnostics: the one-click 3D speed test for the owner's laptop. It draws the same real-product
 * scene four ways and measures the time between frames while the camera circles the shop on a path
 * set by the frame number (not the clock), so every computer draws exactly the same frames.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Camera } from 'three';
import type { DesignDocument } from '../../../src/core/index';
import { sceneBoxes } from '../view-3d/boxes';
import { FixtureBoxes } from '../view-3d/fixture-boxes';
import { SceneProbe } from '../view-3d/scene-probe';
import { planToScene } from '../view-3d/units';
import { graphicsName } from '../view-3d/webgl';
import { benchmarkDocument } from './benchmark-document';
import { LayoutSpeedTest } from './layout-speed-test';

type Setup = { id: 'A' | 'B' | 'C' | 'D'; fixtures: number; shadows: boolean; instanced: boolean };
/** A is the app's default way of drawing; B, C and D show what shadows, no instancing and twice the fixtures cost. */
const SETUPS: readonly Setup[] = [
  { id: 'A', fixtures: 60, shadows: false, instanced: true },
  { id: 'B', fixtures: 60, shadows: true, instanced: true },
  { id: 'C', fixtures: 60, shadows: false, instanced: false },
  { id: 'D', fixtures: 120, shadows: false, instanced: true },
];
/** Frames drawn before measuring starts (shader compiling, first uploads). */
const WARMUP_FRAMES = 30;
const MEASURED_FRAMES = 600;
/** One full circle of the camera takes this many frames. */
const ORBIT_FRAMES = 600;
/** The owner's target: 30 frames per second with 60 fixtures (plan, Milestone 3). */
const TARGET_MEDIAN_MS = 1000 / 30;
const TARGET_P95_MS = 50;
const SHADOW_MAP_SIZE = 2048;

type Result = Setup & { frames: number; medianMs: number; p95Ms: number; drawCalls: number; triangles: number };
type Status = 'idle' | 'running' | 'done' | 'no-webgl';

type Frame = { centre: { x: number; z: number }; span: number };

function frameOf(doc: DesignDocument): Frame {
  const xs = doc.room.outline.map((p) => planToScene(p).x);
  const zs = doc.room.outline.map((p) => planToScene(p).z);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);
  return { centre: { x: (Math.max(...xs) + Math.min(...xs)) / 2, z: (Math.max(...zs) + Math.min(...zs)) / 2 }, span: Math.max(width, depth) };
}

function placeCamera(camera: Camera, f: Frame, frame: number): void {
  const angle = (2 * Math.PI * frame) / ORBIT_FRAMES;
  camera.position.set(f.centre.x + 0.9 * f.span * Math.cos(angle), 0.6 * f.span, f.centre.z + 0.9 * f.span * Math.sin(angle));
  camera.lookAt(f.centre.x, 0, f.centre.z);
}

function percentile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)]!;
}

function Recorder({ frame, onDone }: { frame: Frame; onDone: (deltas: number[], drawCalls: number, triangles: number) => void }) {
  const count = useRef(0);
  const last = useRef(0);
  const deltas = useRef<number[]>([]);
  const done = useRef(false);
  useFrame((state) => {
    const k = count.current++;
    placeCamera(state.camera, frame, k);
    const now = performance.now();
    if (k > WARMUP_FRAMES && !done.current) deltas.current.push(now - last.current);
    last.current = now;
    if (!done.current && deltas.current.length === MEASURED_FRAMES) {
      done.current = true;
      // info holds the counts of the frame just drawn.
      onDone(deltas.current, state.gl.info.render.calls, state.gl.info.render.triangles);
    }
  });
  return null;
}

function StillCamera({ frame }: { frame: Frame }) {
  useFrame((state) => placeCamera(state.camera, frame, ORBIT_FRAMES / 8));
  return null;
}

function Stage({ doc, setup, children }: { doc: DesignDocument; setup: Setup; children: ReactNode }) {
  const frame = useMemo(() => frameOf(doc), [doc]);
  const boxes = useMemo(() => sceneBoxes(doc), [doc]);
  const reach = 2 * frame.span;
  return (
    <>
      <color attach="background" args={['#f6f7f5']} />
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[frame.centre.x + 0.3 * frame.span, frame.span, frame.centre.z + 0.2 * frame.span]}
        intensity={1.6}
        castShadow={setup.shadows}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-far={3 * reach}
      />
      <mesh rotation-x={-Math.PI / 2} position={[frame.centre.x, 0, frame.centre.z]} receiveShadow={setup.shadows}>
        <planeGeometry args={[frame.span, frame.span]} />
        <meshLambertMaterial color="#e3e7ea" />
      </mesh>
      <FixtureBoxes boxes={boxes} instanced={setup.instanced} shadows={setup.shadows} />
      {children}
    </>
  );
}

export function DiagnosticsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
  const [gpu, setGpu] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const docs = useMemo(() => new Map(SETUPS.map((s) => [s.fixtures, benchmarkDocument(s.fixtures)])), []);
  const setup = SETUPS[step];

  function run(): void {
    const name = graphicsName();
    setGpu(name);
    if (name === null) {
      setStatus('no-webgl');
      return;
    }
    setResults([]);
    setStep(0);
    setStatus('running');
  }

  const finishStep = useCallback(
    (deltas: number[], drawCalls: number, triangles: number) => {
      const s = SETUPS[step]!;
      const sorted = [...deltas].sort((a, b) => a - b);
      setResults((r) => [...r, { ...s, frames: deltas.length, medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), drawCalls, triangles }]);
      setStep(step + 1);
    },
    [step],
  );
  const shown = useCallback(() => setStatus('done'), []);

  const a = results.find((r) => r.id === 'A');
  const verdict = a === undefined ? null : a.medianMs <= TARGET_MEDIAN_MS && a.p95Ms <= TARGET_P95_MS ? 'pass' : 'fail';
  const finished = status === 'running' && setup === undefined;
  const ms = (v: number): string => v.toFixed(1);

  return (
    <section className="diagnostics" data-benchmark-status={status === 'running' && finished ? 'showing' : status}>
      <h2>{t('diagnostics.title')}</h2>
      <p className="hint">{t('diagnostics.intro')}</p>
      <div className="actions">
        <button type="button" className="primary" disabled={status === 'running'} onClick={run}>
          {t('diagnostics.run')}
        </button>
        <button type="button" onClick={onBack} disabled={status === 'running'}>
          {t('diagnostics.back')}
        </button>
      </div>
      {status === 'no-webgl' && <p role="alert">{t('diagnostics.noWebgl')}</p>}
      {status === 'running' && setup !== undefined && <p className="status">{t('diagnostics.running', { setup: setup.id, n: step + 1 })}</p>}
      {gpu !== null && (
        <dl className="facts">
          <dt>{t('diagnostics.gpu')}</dt>
          <dd data-gpu="" dir="ltr">{gpu}</dd>
          <dt>{t('diagnostics.webgl2')}</dt>
          <dd data-webgl2="yes">{t('diagnostics.yes')}</dd>
          <dt>{t('diagnostics.screen')}</dt>
          <dd dir="ltr">
            {window.innerWidth} x {window.innerHeight}, {t('diagnostics.pixelRatio')} {window.devicePixelRatio}
          </dd>
        </dl>
      )}
      {results.length > 0 && (
        <table className="results">
          <thead>
            <tr>
              <th>{t('diagnostics.setup')}</th>
              <th>{t('diagnostics.fixtures')}</th>
              <th>{t('diagnostics.shadows')}</th>
              <th>{t('diagnostics.instanced')}</th>
              <th>{t('diagnostics.median')}</th>
              <th>{t('diagnostics.p95')}</th>
              <th>{t('diagnostics.fps')}</th>
              <th>{t('diagnostics.drawCalls')}</th>
              <th>{t('diagnostics.triangles')}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr
                key={r.id}
                data-setup={r.id}
                data-fixtures={r.fixtures}
                data-shadows={r.shadows ? 'on' : 'off'}
                data-instanced={r.instanced ? 'yes' : 'no'}
                data-frames={r.frames}
                data-median-ms={r.medianMs.toFixed(2)}
                data-p95-ms={r.p95Ms.toFixed(2)}
                data-draw-calls={r.drawCalls}
                data-triangles={r.triangles}
              >
                <td>{r.id}</td>
                <td>{r.fixtures}</td>
                <td>{t(r.shadows ? 'diagnostics.on' : 'diagnostics.off')}</td>
                <td>{t(r.instanced ? 'diagnostics.yes' : 'diagnostics.no')}</td>
                <td dir="ltr">{ms(r.medianMs)} ms</td>
                <td dir="ltr">{ms(r.p95Ms)} ms</td>
                <td>{Math.round(1000 / r.medianMs)}</td>
                <td>{r.drawCalls}</td>
                <td>{r.triangles}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {verdict !== null && status === 'done' && (
        <p className={`status ${verdict === 'pass' ? 'ok' : ''}`} data-verdict={verdict}>
          {t(verdict === 'pass' ? 'diagnostics.pass' : 'diagnostics.fail')} {t('diagnostics.photo')}
        </p>
      )}
      {status === 'running' && setup !== undefined && (
        <div className="stage">
          <Canvas key={setup.id} frameloop="always" shadows={setup.shadows ? 'percentage' : false} camera={{ fov: 50, near: 0.1, far: 500 }}>
            <Stage doc={docs.get(setup.fixtures)!} setup={setup}>
              <Recorder frame={frameOf(docs.get(setup.fixtures)!)} onDone={finishStep} />
            </Stage>
          </Canvas>
        </div>
      )}
      {(finished || status === 'done') && (
        <div className="stage">
          <Canvas key="still" frameloop="demand" camera={{ fov: 50, near: 0.1, far: 500 }}>
            <Stage doc={docs.get(SETUPS[0]!.fixtures)!} setup={SETUPS[0]!}>
              <StillCamera frame={frameOf(docs.get(SETUPS[0]!.fixtures)!)} />
              <SceneProbe onReady={shown} />
            </Stage>
          </Canvas>
        </div>
      )}
      <LayoutSpeedTest />
    </section>
  );
}
