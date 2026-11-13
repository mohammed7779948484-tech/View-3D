import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { resolve } from 'node:path';

// Containers run as root, and Chromium refuses to start as root without --no-sandbox.
const rootArgs = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
// Tests only: CI and containers have no GPU, and without this switch Electron has no WebGL at all.
// It makes Chromium fall back to SwiftShader (software WebGL2). The shipped app never sets it.
const softwareArgs = ['--enable-unsafe-swiftshader'];
// Tests only: CI has no GPU either for WebGPU. These two switches give Chromium a SwiftShader WebGPU adapter even with no GPU
// (requestAdapter() returns vendor google, architecture swiftshader). The shipped app never sets them: without a real
// WebGPU adapter it shows a message and the 2D editor stays usable.
// --ignore-gpu-blocklist: the Windows CI runner's only GPU is "Microsoft Basic Render Driver", which Chromium blocklists;
// it then runs its GPU part in-process with no graphics backend, and no SwiftShader WebGPU adapter appears (CI log of
// 2026-11-13; reproduced on the owner's laptop with --disable-gpu --in-process-gpu).
const webgpuArgs = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'];
const REPO_ROOT = resolve(import.meta.dirname, '../..');

/**
 * Starts the app. With VIEW3D_EXE set (installed or packaged executable) it runs that;
 * otherwise it runs the build output through package.json `main` (out/main/index.js).
 */
export async function launchApp(options: { userDataDir?: string; webgl?: boolean; webgpu?: boolean } = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env['VIEW3D_EXE'];
  // --user-data-dir keeps Electron's userData (and so catalog.json) in a folder the test owns.
  const extra = options.userDataDir === undefined ? [] : [`--user-data-dir=${options.userDataDir}`];
  // webgl false is the no-WebGL case. Leaving the SwiftShader switch out is not enough: a visible Electron 45
  // window still falls back to software WebGL. Only --disable-gpu with --disable-software-rasterizer removes it
  // (getContext('webgl2') returns null), on Linux and Windows alike.
  const glArgs = options.webgl === false ? ['--disable-gpu', '--disable-software-rasterizer'] : softwareArgs;
  const gpuArgs = options.webgpu === true ? webgpuArgs : [];
  const args = [...glArgs, ...gpuArgs, ...rootArgs, ...extra];
  const app = await electron.launch(exe ? { executablePath: exe, args } : { args: [REPO_ROOT, ...args] });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}
