import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesignDocument } from '../../src/core/index';
import { documentStore, useDocumentState } from './state/index';
import { bridge } from './storage/bridge';
import { readDocument, serializeDocument } from './storage/project-file';

type Problem = { message: string; details: string[] };

/** The start screen (no document until a room exists) and the open project with its file actions. */
export function App() {
  const { t } = useTranslation();
  const { document: project, canUndo, canRedo } = useDocumentState();
  const [fileName, setFileName] = useState<string | null>(null);
  const [saved, setSaved] = useState<DesignDocument | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [askClose, setAskClose] = useState(false);
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
    if (result.status === 'failed') return setProblem({ message: result.message, details: [] });
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
    if (result.status === 'failed') setProblem({ message: result.message, details: [] });
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

  if (project === null) {
    return (
      <main>
        <h1>{t('app.title')}</h1>
        <p>{t('start.noProject')}</p>
        <button type="button" onClick={() => void open()}>
          {t('start.open')}
        </button>
        {alert}
      </main>
    );
  }

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <label>
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
      </div>
      {alert}
      {askClose && (
        <div role="dialog" aria-modal="true" aria-labelledby="close-title">
          <h2 id="close-title">{t('close.title')}</h2>
          <p>{t('close.body')}</p>
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
