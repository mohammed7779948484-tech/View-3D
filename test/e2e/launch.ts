import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { resolve } from 'node:path';

// Containers run as root, and Chromium refuses to start as root without --no-sandbox.
const rootArgs = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
// Tests only: CI and containers have no GPU, and without this switch Electron has no WebGL at all.
// It makes Chromium fall back to SwiftShader (software WebGL2). The shipped app never sets it.
const testArgs = ['--enable-unsafe-swiftshader', ...rootArgs];
const REPO_ROOT = resolve(import.meta.dirname, '../..');

/**
 * Starts the app. With VIEW3D_EXE set (installed or packaged executable) it runs that;
 * otherwise it runs the build output through package.json `main` (out/main/index.js).
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env['VIEW3D_EXE'];
  const app = await electron.launch(exe ? { executablePath: exe, args: testArgs } : { args: [REPO_ROOT, ...testArgs] });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}
