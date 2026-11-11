/**
 * Electron main process: the window and all disk access (docs/ARCHITECTURE.md section 9).
 * The window is locked down: no Node in the renderer, no popups, no navigation, no network.
 * The renderer never names a file: it asks through the preload bridge, and this process shows the
 * native dialog and remembers the current project file.
 */
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { basename, join } from 'node:path';
import { parseDesignDocument } from '../../src/core/index';
import type { OpenResult, SaveRequest, SaveResult } from '../shared/project-api';
import { readProjectFile, writeProjectFile } from './project-files';

const RENDERER_HTML = join(import.meta.dirname, '../renderer/index.html');
const PRELOAD = join(import.meta.dirname, '../preload/index.cjs');
/** Every remote scheme. The app is fully local (decisions/0007), so any such request is refused. */
const REMOTE_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];
const PROJECT_FILTERS = [{ name: 'View-3D project', extensions: ['json'] }];
const SCAN_FILTERS = [{ name: 'Room scan (RoomTrace JSON)', extensions: ['json'] }];
/** Characters Windows does not allow in a file name. */
const NOT_IN_FILE_NAMES = /[\\/:*?"<>|]/g;
/** A project file is a few hundred kilobytes; anything far bigger is not one of ours. */
const MAX_PROJECT_TEXT = 50_000_000;

/** The project file open in the window, once it was opened or saved. */
let currentPath: string | null = null;
/** Set once the renderer said closing is fine, or when the app quits. */
let closeConfirmed = false;

/** Only our own page may call: anything else (a future frame, a devtools page) is refused. */
function fromOurPage(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return event.senderFrame?.url.startsWith('file://') === true;
}

/** The project's name, for the default file name, when the text is a valid project. */
function projectName(text: string): string | null {
  try {
    const parsed = parseDesignDocument(JSON.parse(text.startsWith('﻿') ? text.slice(1) : text));
    return parsed.ok ? parsed.document.name : null;
  } catch {
    return null;
  }
}

async function openProject(window: BrowserWindow): Promise<OpenResult> {
  const choice = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: PROJECT_FILTERS });
  const path = choice.filePaths[0];
  if (choice.canceled || path === undefined) return { status: 'cancelled' };
  const read = await readProjectFile(path);
  if (!read.ok) return { status: 'failed', message: read.message };
  // Only a real project becomes the current file, so "Save" can never overwrite a file that was refused.
  if (projectName(read.text) !== null) currentPath = path;
  return { status: 'opened', fileName: basename(path), text: read.text };
}

async function openScan(window: BrowserWindow): Promise<OpenResult> {
  const choice = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: SCAN_FILTERS });
  const path = choice.filePaths[0];
  if (choice.canceled || path === undefined) return { status: 'cancelled' };
  const read = await readProjectFile(path);
  return read.ok ? { status: 'opened', fileName: basename(path), text: read.text } : { status: 'failed', message: read.message };
}

async function saveProject(window: BrowserWindow, request: SaveRequest): Promise<SaveResult> {
  let path = request.mode === 'save' ? currentPath : null;
  if (path === null) {
    const name = (projectName(request.text) ?? 'Project').replace(NOT_IN_FILE_NAMES, '-');
    const choice = await dialog.showSaveDialog(window, { defaultPath: `${name}.json`, filters: PROJECT_FILTERS });
    if (choice.canceled || choice.filePath === undefined || choice.filePath === '') return { status: 'cancelled' };
    path = choice.filePath;
  }
  const written = await writeProjectFile(path, request.text);
  if (!written.ok) return { status: 'failed', message: written.message };
  currentPath = path;
  return { status: 'saved', fileName: basename(path) };
}

function isSaveRequest(value: unknown): value is SaveRequest {
  if (typeof value !== 'object' || value === null) return false;
  const { text, mode } = value as Record<string, unknown>;
  return typeof text === 'string' && text.length <= MAX_PROJECT_TEXT && (mode === 'save' || mode === 'save-as');
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'View-3D',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  // The renderer decides: it asks "Close without saving?" when there are unsaved changes.
  window.on('close', (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    window.webContents.send('window:close-requested');
  });
  void window.loadFile(RENDERER_HTML);
}

ipcMain.handle('project:open', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!fromOurPage(event) || window === null) throw new Error('project:open: refused');
  return openProject(window);
});
ipcMain.handle('scan:open', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!fromOurPage(event) || window === null) throw new Error('scan:open: refused');
  return openScan(window);
});
ipcMain.handle('project:save', (event, request: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!fromOurPage(event) || window === null || !isSaveRequest(request)) throw new Error('project:save: refused');
  return saveProject(window, request);
});
ipcMain.on('window:close', (event) => {
  if (!fromOurPage(event)) return;
  closeConfirmed = true;
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// Quitting (system shutdown, or the test runner) does not ask; closing the window does.
app.on('before-quit', () => {
  closeConfirmed = true;
});

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: REMOTE_URLS }, (_details, callback) => callback({ cancel: true }));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
