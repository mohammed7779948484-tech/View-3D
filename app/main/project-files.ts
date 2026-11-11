/** Reading and writing project files. Node only; the renderer reaches this through the preload bridge. */
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export async function readProjectFile(path: string): Promise<{ ok: true; text: string } | { ok: false; code: 'read-failed'; message: string }> {
  try {
    return { ok: true, text: await readFile(path, 'utf8') };
  } catch (error) {
    return { ok: false, code: 'read-failed', message: `The file "${basename(path)}" could not be read (${(error as NodeJS.ErrnoException).code ?? 'error'}).` };
  }
}

/** Windows refuses to replace a file that another program (antivirus, search indexer) holds open for a moment. */
const BUSY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_TRIES = 10;
/** Waits between tries: 10, 20, 40, 80, 160, then 200 ms; about 1.1 s in all. */
const RENAME_WAIT_MS = (attempt: number): number => Math.min(10 * 2 ** attempt, 200);

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!BUSY_CODES.has(code) || attempt + 1 >= RENAME_TRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, RENAME_WAIT_MS(attempt)));
    }
  }
}

/**
 * Writes UTF-8 without a BOM. Atomic: the text goes to a temporary file in the same folder, which
 * then replaces the target, so a crash mid-write never leaves half a project.
 */
export async function writeProjectFile(path: string, text: string): Promise<{ ok: true } | { ok: false; code: 'write-failed'; message: string }> {
  const temporary = join(dirname(path), `.${basename(path)}.saving`);
  try {
    await writeFile(temporary, text, 'utf8');
    await renameWithRetry(temporary, path);
    return { ok: true };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    return { ok: false, code: 'write-failed', message: `The file "${basename(path)}" could not be saved (${(error as NodeJS.ErrnoException).code ?? 'error'}).` };
  }
}
