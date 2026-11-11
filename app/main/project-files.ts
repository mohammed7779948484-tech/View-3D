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

/**
 * Writes UTF-8 without a BOM. Atomic: the text goes to a temporary file in the same folder, which
 * then replaces the target, so a crash mid-write never leaves half a project.
 */
export async function writeProjectFile(path: string, text: string): Promise<{ ok: true } | { ok: false; code: 'write-failed'; message: string }> {
  const temporary = join(dirname(path), `.${basename(path)}.saving`);
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
    return { ok: true };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    return { ok: false, code: 'write-failed', message: `The file "${basename(path)}" could not be saved (${(error as NodeJS.ErrnoException).code ?? 'error'}).` };
  }
}
