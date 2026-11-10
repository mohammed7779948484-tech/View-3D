/**
 * Electron main process: owns the window and, later, all disk access (docs/ARCHITECTURE.md section 9).
 * The window is locked down: no Node in the renderer, no popups, no navigation, no network.
 */
import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';

const RENDERER_HTML = join(import.meta.dirname, '../renderer/index.html');
/** Every remote scheme. The app is fully local (decisions/0007), so any such request is refused. */
const REMOTE_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'View-3D',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  void window.loadFile(RENDERER_HTML);
}

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: REMOTE_URLS }, (_details, callback) => callback({ cancel: true }));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
