import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesignDocument, DisplayUnit, Point } from '../../src/core/index';
import { validateLayout, validateRoom } from '../../src/rules/index';
import { outlineToWalls } from '../../src/capture/index';
import { formatAngle, formatDisplayLength } from '../../src/core/index';
import { viewBoxAround } from './editor-2d/geometry';
import { DrawRoom } from './editor-2d/draw-room';
import { newDocument } from './editor-2d/new-document';
import { Plan } from './editor-2d/plan';
import { OpeningsPanel } from './editor-2d/openings-panel';
import { RoomPanel } from './editor-2d/room-panel';
import { WallTable } from './editor-2d/wall-table';
import { ScanReview } from './editor-2d/scan-review';
import { DiagnosticsPage } from './diagnostics/diagnostics-page';
import { CatalogScreen } from './catalog/catalog-screen';
import { useCatalogProducts } from './catalog/use-catalog';
import { FixturesPanel } from './editor-2d/fixtures-panel';
import type { Picked } from './editor-2d/fixtures-panel';
import { FixtureInspector } from './editor-2d/fixture-inspector';
import { AutoLayoutPanel } from './editor-2d/auto-layout-panel';
import { OptionPicker } from './editor-2d/option-picker';
import { View3D } from './view-3d/view-3d';
import type { LayoutResult } from '../../src/layout/index';
import {
  deletePlacement,
  duplicatePlacement,
  movePlacement,
  nextPlacementId,
  placeProduct,
  rotatePlacement,
  setPlacementPose,
  snapPlacement,
  together,
  useLayoutOption,
} from './state/placement-commands';
import { rectCorners } from '../../src/geometry/index';
import { footprint } from '../../src/rules/index';
import { importRoomTrace } from '../../src/import-scan/index';
import type { ScanImportResult } from '../../src/import-scan/index';
import type { Room } from '../../src/core/index';
import { documentStore, useDocumentState } from './state/index';
import { LANGUAGES } from './i18n';
import { problemText, violationText } from './i18n/messages';
import { bridge } from './storage/bridge';
import { readDocument, serializeDocument } from './storage/project-file';

type Problem = { message: string; details: string[] };
type Screen = 'start' | 'walls' | 'draw' | 'scan' | 'diagnostics' | 'catalog';

/** Puts an outline typed from (0, 0) along +x where the room already is: same corner 1, same direction of wall 1. */
function placeLike(outline: Point[], reference: readonly Point[]): Point[] {
  const o = reference[0]!;
  const r = reference[1]!;
  const angle = Math.atan2(r.y - o.y, r.x - o.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return outline.map((p) => ({ x: Math.round(o.x + p.x * cos - p.y * sin) || 0, y: Math.round(o.y + p.x * sin + p.y * cos) || 0 }));
}

const UNITS: readonly DisplayUnit[] = ['mm', 'cm', 'm', 'in', 'ft-in'];
/** Space around the room on the plan, mm. */
const PLAN_MARGIN_MM = 1500;

/** The start screen (no document until a room exists) and the open project with its file actions. */
export function App() {
  const { t, i18n } = useTranslation();
  const { document: project, canUndo, canRedo } = useDocumentState();
  const [fileName, setFileName] = useState<string | null>(null);
  const [saved, setSaved] = useState<DesignDocument | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [askClose, setAskClose] = useState(false);
  const [screen, setScreen] = useState<Screen>('start');
  const [unit, setUnit] = useState<DisplayUnit>('cm');
  const [editingWalls, setEditingWalls] = useState(false);
  const [scan, setScan] = useState<Extract<ScanImportResult, { ok: true }> | null>(null);
  // Read again each time the catalog screen closes, so its changes reach the panels without a restart.
  const [catalogVersion, setCatalogVersion] = useState(0);
  const catalogProducts = useCatalogProducts(catalogVersion);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  /** The last automatic layout's options and the room they were made for. */
  const [layout, setLayout] = useState<{ result: LayoutResult; room: Room } | null>(null);
  // Offered only while the project still has that very room (immer keeps it the same object until
  // it is edited; another project, or an edited room, is a different one; undo brings it back).
  const layoutResult = layout !== null && project !== null && layout.room === project.room ? layout.result : null;
  // Live validation: every rule, on every change of the document (about 25 ms for 40 fixtures).
  // A broken room is listed by the room checks, not here.
  const violations = useMemo(() => (project === null ? [] : validateLayout(project).filter((v) => v.rule !== 'invalid-room')), [project]);
  const problemIds = useMemo(() => new Set(violations.flatMap((v) => v.placementIds)), [violations]);
  // Undoing back to the saved document counts as saved: compare by reference.
  const unsaved = project !== null && project !== saved;
  const unsavedRef = useRef(unsaved);
  useEffect(() => {
    unsavedRef.current = unsaved;
  }, [unsaved]);

  useEffect(() => {
    document.title = fileName === null ? t('app.title') : `${fileName} - ${t('app.title')}`;
  }, [fileName, t]);

  useEffect(
    () =>
      bridge().onCloseRequested(() => {
        if (unsavedRef.current) setAskClose(true);
        else bridge().closeWindow();
      }),
    [],
  );

  useEffect(() => {
    // Undo and redo from the keyboard, except while typing, where they undo the typing.
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) documentStore.undo();
      else if (key === 'y' || (key === 'z' && event.shiftKey)) documentStore.redo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function open(): Promise<void> {
    const result = await bridge().openProject();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') return setProblem({ message: t('files.readFailed', { file: result.fileName }), details: [] });
    const read = readDocument(result.text);
    if (!read.ok) {
      return setProblem({ message: read.code === 'not-json' ? t('open.notJson', { line: read.line }) : t('open.notAProject'), details: read.details });
    }
    documentStore.load(read.document);
    setSaved(read.document);
    setFileName(result.fileName);
    setProblem(null);
  }

  async function save(current: DesignDocument, mode: 'save' | 'save-as'): Promise<boolean> {
    const result = await bridge().saveProject({ text: serializeDocument(current), mode });
    if (result.status === 'failed') setProblem({ message: t('files.writeFailed', { file: result.fileName }), details: [] });
    if (result.status !== 'saved') return false;
    setSaved(current);
    setFileName(result.fileName);
    setProblem(null);
    return true;
  }

  async function saveCopy(current: DesignDocument): Promise<void> {
    const copy: DesignDocument = { ...current, id: crypto.randomUUID(), name: t('project.copyName', { name: current.name }) };
    if (await save(copy, 'save-as')) documentStore.load(copy);
  }

  async function importScan(): Promise<void> {
    const result = await bridge().openScan();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') return setProblem({ message: t('files.readFailed', { file: result.fileName }), details: [] });
    let json: unknown;
    try {
      json = JSON.parse(result.text.startsWith('\uFEFF') ? result.text.slice(1) : result.text);
    } catch {
      return setProblem({ message: t('scan.errors.not-json'), details: [] });
    }
    const imported = importRoomTrace(json);
    if (!imported.ok) return setProblem({ message: imported.errors.map((e) => t(`scan.errors.${e.code}`)).join(' '), details: [] });
    setProblem(null);
    setScan(imported);
    setScreen('scan');
  }

  function useScannedRoom(room: Room): void {
    const created = newDocument(room.outline, room.ceilingHeightUm, t('project.newName'));
    if (created === null) return setProblem({ message: t('draw.notARoom'), details: [] });
    documentStore.load({ ...created, room });
    setSaved(null);
    setFileName(null);
    setScan(null);
    setScreen('start');
  }

  function create(outline: Point[], ceilingHeightUm: number): void {
    const created = newDocument(outline, ceilingHeightUm, t('project.newName'));
    if (created === null) return setProblem({ message: t('draw.notARoom'), details: [] });
    documentStore.load(created);
    setSaved(null);
    setFileName(null);
    setProblem(null);
    setScreen('start');
  }

  function rename(value: string): void {
    if (project !== null && value !== project.name) {
      documentStore.edit((draft) => {
        draft.name = value;
      });
    }
  }

  const alert = problem && (
    <div role="alert">
      <p>{problem.message}</p>
      {problem.details.length > 0 && (
        <ul>
          {problem.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );

  const header = (
    <header className="app-header">
      <h1>{t('app.title')}</h1>
      <label className="unit">
        {t('language.label')}
        <select value={i18n.language} onChange={(event) => void i18n.changeLanguage(event.currentTarget.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="unit">
        {t('unit.label')}
        <select value={unit} onChange={(event) => setUnit(event.currentTarget.value as DisplayUnit)}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
    </header>
  );

  if (project === null) {
    return (
      <main>
        {header}
        {screen === 'walls' && <WallTable unit={unit} onCreate={create} onBack={() => setScreen('start')} />}
        {screen === 'draw' && <DrawRoom unit={unit} onCreate={create} onBack={() => setScreen('start')} />}
        {screen === 'scan' && scan !== null && (
          <ScanReview
            room={scan.room}
            pendingWindows={scan.pendingWindows}
            findings={scan.findings}
            unit={unit}
            onUse={useScannedRoom}
            onBack={() => {
              setScan(null);
              setScreen('start');
            }}
          />
        )}
        {screen === 'diagnostics' && <DiagnosticsPage onBack={() => setScreen('start')} />}
        {screen === 'catalog' && (
          <CatalogScreen
            unit={unit}
            onBack={() => {
              setCatalogVersion((v) => v + 1);
              setScreen('start');
            }}
          />
        )}
        {screen === 'start' && (
          <section className="start">
            <p>{t('start.noProject')}</p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => setScreen('walls')}>
                {t('start.typeWalls')}
              </button>
              <button type="button" onClick={() => setScreen('draw')}>
                {t('start.draw')}
              </button>
              <button type="button" onClick={() => void importScan()}>
                {t('start.importScan')}
              </button>
              <button type="button" onClick={() => void open()}>
                {t('start.open')}
              </button>
              <button type="button" onClick={() => setScreen('catalog')}>
                {t('start.catalog')}
              </button>
            </div>
            <button type="button" className="quiet" onClick={() => setScreen('diagnostics')}>
              {t('start.diagnostics')}
            </button>
          </section>
        )}
        {alert}
      </main>
    );
  }

  const roomProblems = validateRoom(project.room);
  /** A fixture edit; a refused one says so instead of silently doing nothing. */
  const editFixtures = (recipe: (draft: DesignDocument) => void): boolean => {
    const result = documentStore.edit(recipe);
    setProblem(result.ok ? null : { message: t('fixtures.refused'), details: [] });
    return result.ok;
  };
  const fixtures = project.placements.flatMap((p) => {
    const product = project.products.find((q) => q.id === p.productId);
    const variant = product?.variants.find((v) => v.id === p.variantId);
    const problem = violations.some((v) => v.placementIds.includes(p.id));
    return product === undefined || variant === undefined || variant.widthUm === null || variant.depthUm === null
      ? []
      : [{ id: p.id, corners: rectCorners(footprint(p, variant)), problem, label: product.name }];
  });
  const selected = project.placements.find((p) => p.id === selectedId);
  /** The same commands in 2D and 3D: an edit in either view gives the same document. */
  const moveFixture = (id: string, dx: number, dy: number): boolean => editFixtures(together(movePlacement(id, dx, dy), snapPlacement(id)));
  const placeAt = (point: Point): void => {
    if (picked === null) return;
    const id = nextPlacementId(project);
    if (editFixtures(together(placeProduct(picked.product, picked.variantId, point, 0), snapPlacement(id)))) {
      setSelectedId(id);
      setPicked(null);
    }
  };
  /** Every edit of the room says why when the document refuses it, instead of silently snapping back. */
  const editRoom = (change: (room: DesignDocument['room']) => void): boolean => {
    const result = documentStore.edit((draft) => change(draft.room));
    if (!result.ok) setProblem({ message: t('room.editRefused'), details: [] });
    else setProblem(null);
    return result.ok;
  };
  const editOutline = (outline: Point[] | null, wall = 0): boolean => {
    if (outline === null) {
      setProblem({ message: t('room.zeroWall', { n: wall + 1 }), details: [] });
      return false;
    }
    return editRoom((room) => {
      room.outline = outline;
    });
  };

  if (editingWalls) {
    const walls = outlineToWalls(project.room.outline);
    return (
      <main>
        {header}
        <WallTable
          unit={unit}
          submitLabel={t('walls.update')}
          start={{
            rows: walls.map((w) => ({ length: formatDisplayLength(w.lengthUm, unit), angle: formatAngle(w.cornerAngleUdeg) })),
            ceiling: formatDisplayLength(project.room.ceilingHeightUm, unit),
          }}
          onBack={() => setEditingWalls(false)}
          onCreate={(outline, ceilingHeightUm) => {
            const placed = placeLike(outline, project.room.outline);
            if (
              editRoom((room) => {
                room.outline = placed;
                room.ceilingHeightUm = ceilingHeightUm;
              })
            ) {
              setEditingWalls(false);
            }
          }}
        />
        {alert}
      </main>
    );
  }

  return (
    <main>
      {header}
      <label className="project-name">
        {t('project.name')}
        <input
          key={`${project.id}:${project.name}`}
          defaultValue={project.name}
          onBlur={(event) => rename(event.currentTarget.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>
      <div role="toolbar">
        <button type="button" onClick={() => void save(project, 'save')}>
          {t('project.save')}
        </button>
        <button type="button" onClick={() => void save(project, 'save-as')}>
          {t('project.saveAs')}
        </button>
        <button type="button" onClick={() => void saveCopy(project)}>
          {t('project.saveCopy')}
        </button>
        <button type="button" disabled={!canUndo} onClick={() => documentStore.undo()}>
          {t('project.undo')}
        </button>
        <button type="button" disabled={!canRedo} onClick={() => documentStore.redo()}>
          {t('project.redo')}
        </button>
        <button type="button" onClick={() => setEditingWalls(true)}>
          {t('project.editWalls')}
        </button>
      </div>
      {alert}
      <div className="workspace">
        <div>
        <RoomPanel
          room={project.room}
          unit={unit}
          onOutline={editOutline}
          onCeiling={(um) =>
            editRoom((room) => {
              room.ceilingHeightUm = um;
            })
          }
        />
        <OpeningsPanel
          room={project.room}
          unit={unit}
          onRoom={(room) =>
            documentStore.edit((draft) => {
              draft.room = room;
            })
          }
        />
        <FixturesPanel products={catalogProducts} picked={picked} onPick={setPicked} />
        <AutoLayoutPanel products={catalogProducts} document={project} onResult={(text, room) => setLayout({ result: JSON.parse(text) as LayoutResult, room })} />
        {layoutResult !== null && <OptionPicker result={layoutResult} onUse={(option) => editFixtures(useLayoutOption(option))} />}
        </div>
        <div className="plan-column">
        <div className="actions" role="group" aria-label={t('view3d.switch')}>
          <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>
            {t('view3d.plan2d')}
          </button>
          <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
            {t('view3d.view3d')}
          </button>
        </div>
        {view === '3d' ? (
          <View3D
            document={project}
            problemIds={problemIds}
            onSelect={setSelectedId}
            onMove={moveFixture}
            {...(picked === null ? {} : { onPlace: placeAt })}
          />
        ) : (
        <Plan
          openings={project.room.openings}
          columns={project.room.columns}
          outline={project.room.outline}
          closed
          unit={unit}
          view={viewBoxAround(project.room.outline, PLAN_MARGIN_MM)}
          onCornerMoved={(index, point) => editOutline(project.room.outline.map((p, i) => (i === index ? point : p)))}
          fixtures={fixtures}
          selectedId={selectedId}
          {...(picked === null
            ? { onSelect: setSelectedId, onFixtureMoved: moveFixture }
            : {
                onPlanClick: placeAt,
              })}
        />
        )}
        {selected !== undefined && (
          <FixtureInspector
            placement={selected}
            product={project.products.find((q) => q.id === selected.productId)}
            unit={unit}
            onPose={(pose) => editFixtures(setPlacementPose(selected.id, pose))}
            onRotate={() => editFixtures(rotatePlacement(selected.id))}
            onDuplicate={() => {
              const id = nextPlacementId(project);
              if (editFixtures(duplicatePlacement(selected.id))) setSelectedId(id);
            }}
            onDelete={() => {
              if (editFixtures(deletePlacement(selected.id))) setSelectedId(null);
            }}
          />
        )}
        <section className="layout-problems">
          <h2 id="layout-problems-title">{t('layoutProblems.title')}</h2>
          <ul aria-labelledby="layout-problems-title">
            {violations.map((v) => (
              <li key={`${v.rule}:${v.placementIds.join(',')}:${v.openingId ?? ''}:${v.columnId ?? ''}:${v.detail ?? ''}`} data-rule={v.rule}>
                {violationText(t, project, v)}
              </li>
            ))}
          </ul>
          {violations.length === 0 && <p className="status ok">{t('layoutProblems.none')}</p>}
        </section>
        </div>
      </div>
      <ul className="room-problems" aria-label={t('room.problems')}>
        {roomProblems.map((p) => (
          <li key={`${p.code}${p.index ?? ''}${p.openingId ?? ''}${p.columnId ?? ''}`}>{problemText(t, project.room, p)}</li>
        ))}
      </ul>
      {askClose && (
        <div role="dialog" aria-modal="true" aria-labelledby="close-title">
          <h2 id="close-title">{t('close.title')}</h2>
          <p>{t('close.body')}</p>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void save(project, 'save').then((saved) => {
                if (saved) bridge().closeWindow();
              })
            }
          >
            {t('close.save')}
          </button>
          <button type="button" onClick={() => bridge().closeWindow()}>
            {t('close.discard')}
          </button>
          <button type="button" onClick={() => setAskClose(false)}>
            {t('close.cancel')}
          </button>
        </div>
      )}
    </main>
  );
}
