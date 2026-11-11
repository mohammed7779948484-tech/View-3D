/** The owner's catalog file, `<userData>/catalog.json`. Node only; the renderer reaches it through the preload bridge. */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCatalog, seedCatalog, serializeCatalog } from '../../src/catalog/index';
import type { CatalogLoadResult, CatalogSaveResult } from '../shared/project-api';
import { readProjectFile, writeProjectFile } from './project-files';

const FILE_NAME = 'catalog.json';

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Reads the catalog; with no file yet, writes the website seed first (no network). Never rewrites a bad file. */
export async function loadCatalogFile(dir: string): Promise<CatalogLoadResult> {
  const path = join(dir, FILE_NAME);
  if (!(await exists(path))) {
    const text = serializeCatalog(seedCatalog());
    const written = await writeProjectFile(path, text);
    return written.ok ? { status: 'loaded', text } : { status: 'failed', code: 'read-failed', message: written.message };
  }
  const read = await readProjectFile(path);
  if (!read.ok) return { status: 'failed', code: 'read-failed', message: read.message };
  const parsed = parseCatalog(read.text);
  if (!parsed.ok) return { status: 'failed', code: 'not-a-catalog', message: `${FILE_NAME} is not a valid catalog: ${parsed.errors[0] ?? parsed.code}` };
  return { status: 'loaded', text: read.text };
}

/** Writes the catalog atomically, only when the text is a valid catalog. */
export async function saveCatalogFile(dir: string, text: string): Promise<CatalogSaveResult> {
  const parsed = parseCatalog(text);
  if (!parsed.ok) return { status: 'failed', code: 'not-a-catalog', message: `not a valid catalog: ${parsed.errors[0] ?? parsed.code}` };
  const written = await writeProjectFile(join(dir, FILE_NAME), text);
  return written.ok ? { status: 'saved' } : { status: 'failed', code: 'write-failed', message: written.message };
}
