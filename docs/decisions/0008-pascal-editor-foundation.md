# 0008 Pascal Editor packages as the 2D/3D editing layer

**Status:** accepted (the owner, 2026-11-13; his answers to NOTES questions 18 to 20 are below).
Proposed 2026-11-12. **Phase 1 done** (2026-11-13, see "Phase 1 as built"); phases 2 to 5 to
come. Reverses "our own editor" (`../plans/M2-M4-plan.md` section 4). Upgrading Pascal:
`../UPGRADING_PASCAL.md`.

**Decision.** Use Pascal Editor's published npm packages (`@pascal-app/core`, `viewer`, `editor`,
`nodes`, one exact version, MIT) as the 2D/3D editing layer inside our own Electron +
electron-vite renderer. Our fixtures, rules, layout engine and catalog stay in `src/` and connect
through a Pascal plugin (node kind `retail-fixture`) plus a pure adapter between Pascal's scene
and our design document. No fork; if a change in Pascal is ever needed, `pnpm patch` first, and a
fork only after a patch has proven not enough.

**Why.** Pascal already has what the owner needs to draw and look at a shop: walls, rooms,
doors, windows, 2D and 3D views of one scene, numeric dimensions, measuring, undo. Building that
ourselves (M2 issues 6-7, M3 issues 2-4 and 7-8) duplicates a maintained MIT editor. What makes
View-3D worth having (real products, the rules, the automatic layout, quotes) is not in Pascal and
stays ours.

**Next.js is not used.** In the packages, `next` appears only as `next/image` (26 files in
`@pascal-app/editor`) and three image-config internals in `node-icon-image.tsx`; core, viewer and
nodes never import it. Four Vite aliases to small shims (`next/image` renders a plain `<img>`)
replace it; `next` is not installed (checked: no `next` folder anywhere in `node_modules`).

## The owner's answers (2026-11-13)

1. **Source of truth: yes.** Pascal's scene is what is edited. Our integer-micrometre design
   document is always derived from it by one pure, deterministic function in `src/` (no Pascal or
   React dependency) and is never edited by hand. Principle 3 in `CLAUDE.md` and `TEAM_RULES.md`
   now says this. Conditions:
   - (a) a property test proves that the round trip scene -> document -> scene keeps every length
     within 1 mm;
   - (b) no invented dimensions: the fixture node carries only the product id and its version;
     what is `unknown` stays `unknown` and cannot be placed;
   - (c) the engine, the rules and the catalog in `src/` do not change.
2. **WebGPU-first 3D: yes.** Without WebGPU the app shows a clear message and the 2D editor stays
   fully usable. Software rendering is never turned on. Pascal itself falls back to WebGL when it
   finds no WebGPU device (`initializeGpuRenderer` in `@pascal-app/viewer`), so the host checks
   for a WebGPU adapter before Pascal starts.
3. **Pascal editor in English only: yes.** Our own screens (start, catalog, quotes, the PDF) stay
   in Arabic and English.

## Risks

- Young packages: 1.1.4 was published on 2026-11-12, the day of this trial; 1.1.0 was published
  2026-11-10. Pin exactly; upgrade on purpose with the trial steps below as the check.
- The editor ships TypeScript source (`@pascal-app/editor/src`), so our build compiles it and
  Tailwind must scan it (`@source`). A Pascal release can break our build.
- Pascal reaches the internet by default (textures, icons, Draco decoder; see results). V1 is
  fully offline (`0007`), so every one of these must be pointed at bundled local files.
- Pascal's page needs three CSP entries beyond ours (none of them `unsafe-eval`; phase 1 below);
  the main page's policy is unchanged.
- Two models (scene and document) until the source-of-truth question is settled.
- Package size grows (built host: 18.7 MB); the owner ruled size does not matter for a local app.

## Phases

1. A host in `app/renderer/pascal` shows the L-shaped test shop in the **packaged** app
   (installer), offline, under our CSP, with the window still locked down.
2. A plugin with node kind `retail-fixture` places one real catalog product.
3. A pure adapter scene <-> design document, round trip within 1 mm, property-tested.
4. `validateLayout` and `autoLayout` run in a worker on the adapted document; problems show in
   Pascal's views.
5. Retire `app/renderer/editor-2d` and `app/renderer/view-3d`.

## Phase 1 as built (2026-11-13)

- **Where.** `app/renderer/pascal/` is a second page with its own window, opened from the start
  screen ("Pascal editor (preview)") through the preload's `openPascal()`. The main window and the
  current editors are unchanged. The Pascal window is locked down like the main one and has no
  preload. Pascal's styles share colour names with ours, so its own page keeps them apart.
- **Own origin.** The page is served as `view3d://app/pascal/index.html` by a privileged, secure,
  standard scheme (`app/main/pascal-protocol.ts`) that maps `/` to the built renderer folder.
  Pascal's hard-coded absolute paths (`/icons/...`, `/cursor.svg`) then resolve to bundled files.
  Anything outside the folder is "not found" (unit-tested, including encoded `..` and backslashes).
- **WebGPU gate** (`app/renderer/pascal/webgpu-gate.ts`). It asks for exactly what Pascal asks
  for, no less: an adapter with `featureLevel: 'compatibility'`, then a device with all the
  adapter's features, each within Pascal's 4 s. Without a device Pascal would fall back to WebGL,
  so the start button shows "Pascal's editor needs WebGPU..." (Arabic and English) and opens
  nothing; the 2D editor stays. The Pascal page checks again before starting Pascal. A unit test
  reads Pascal's own start-up code (`renderer-capability.js`), so an upgrade that asks for more
  fails the build. Software WebGPU appears only with test switches
  (`--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`). Measured in Electron 45: with
  `--disable-gpu` and no such switch, `requestAdapter()` returns null. Not covered: a device that
  Pascal gets but whose renderer start then fails; Pascal would fall back to WebGL by itself.
- **No textures in this batch** (independent review, 2026-11-13).
  - The cause: three's texture decoder (`basis_transcoder.js`, Emscripten embind) builds functions
    from strings. In the Pascal window its four workers threw "EvalError: Evaluating a string as
    JavaScript violates ... 'unsafe-eval'". The first test missed it, because it read only the
    page's console. Allowing `unsafe-eval` is forbidden.
  - Alternatives compared:
    - three ships no Basis decoder without eval.
    - Pascal 1.1.4 names `.ktx2` files for every texture (412 paths in `core`'s material
      library). Using the JPG/WebP originals would need a `pnpm patch` of those paths. 223 of the
      originals are not in Pascal's repository at all, and the licence of the texture images is
      not verified either.
  - So, by the owner's rule: Pascal runs with its textures setting off (`setTextures(false)`),
    no texture file and no Basis decoder is shipped, and the walls and floors are plain.
  - Later item: textures come back only when (1) their licence is verified and (2) they decode
    without `unsafe-eval` (for example, our own JPG/WebP set through a `pnpm patch`, or a
    decoder built without eval).
  - Pascal's view bar can still switch textures on; the files are then "not found", and nothing
    goes online.
- **Offline.**
  - `configureViewer` points icons, sounds and the Draco decoder at the app's files. The texture
    and Basis paths also point inside the app, so nothing would go online.
  - `useGLTF.setDecoderPath` covers one model that Pascal loads through drei's default Draco path
    (gstatic.com).
  - The Iconify icons Pascal names are bundled at build time; fetching is switched off.
- **Assets in the repository.** `app/renderer/public` holds only Pascal's icons, sounds and
  cursor, copied from its MIT repository, plus `LICENSE-pascal.txt`. The sources are in
  `STACK.md`, and a unit test refuses any other file. This branch's history was rewritten so that
  the textures downloaded from Pascal's server never reach `main`.
- **Proven by `test/e2e/pascal.spec.ts`.**
  - The shop shows (6 walls, metric, textures off, a WebGPU canvas).
  - The window is locked down.
  - While Pascal loads:
    - the main process sees no remote request;
    - no local file fails;
    - no texture or Basis decoder is requested;
    - the page reports no CSP refusal.
  - No error is reported in the page or any of its workers: `pageerror` plus CDP `Log`, which
    reach the workers.
  - Without WebGPU: the message shows, no window opens, and the walls screen opens.
- **CSP of the Pascal page.** The app's policy plus exactly three entries. Each was removed in
  turn and the test failed with the browser's refusal:
  - `'wasm-unsafe-eval'` (compiles WebAssembly; it does not allow eval of strings):
    "Compiling or instantiating WebAssembly module violates...";
  - `connect-src data:`: "Fetch API cannot load data:model/gltf-binary...";
  - `worker-src 'self' blob:`: "Creating a worker from 'blob:view3d://app/...' violates...".

  `blob:` in `img-src` and `connect-src` (tried in the trial) is not needed. The main page's CSP
  is unchanged.
- **Seen on the laptop.** NVIDIA and SwiftShader both draw the shop with "L shop 94.9 m²" in
  metres (before textures were switched off; the later screenshots are listed in NOTES).
- **Open problem, to fix in phase 2** (owner, 2026-11-13). An intermittent "Instance dropped in
  popErrorScope" error appeared in the Pascal page on Ubuntu CI: once in 6 runs, never on
  Windows. Details and what is known are in NOTES question 22.
- **Not done in phase 1.**
  - Pascal edits are not saved; phase 3 brings the adapter.
  - Pascal's item catalog still names furniture pictures on Pascal's servers. They are refused
    (not loaded) if that panel is opened; our products replace them in phase 2.
  - The NSIS installer itself was not run on the laptop. The packaged app it installs was: the 4
    Pascal tests and the 5 smoke tests pass against it (`pnpm package:dir`,
    `VIEW3D_EXE=release/win-unpacked/View-3D.exe`, 417 MB), with Pascal's files read from inside
    `app.asar`. CI's Windows job builds and installs the installer.

## Results of the Windows trial (2026-11-12)

Machine: Windows 11 Home 10.0.26200, Microsoft Edge 157.0.4341.42, Node 24.22.3 (fnm), pnpm
10.33.0, Electron 45.3.0 (Chromium 156). Two GPUs: Intel Graphics (WebGPU `intel` / `xe-lpg`,
PCI 0x7D67, driver 32.0.101.8826) and NVIDIA GeForce RTX 5070 Ti Laptop GPU (WebGPU `nvidia` /
`blackwell`, driver 32.0.15.9191). Display 2560 x 1600 at 240 Hz. This is the owner's laptop;
Chromium picks the NVIDIA chip by default, and the Intel results are the ones that stand for
weaker computers (`TEAM_RULES.md`, corrected 2026-11-13). Evidence (screenshots, logs) is in
`..\pascal-evidence` next to the repository on the owner's laptop, not committed.

**How speed is measured.** Pascal's viewer draws on its own clock and caps itself at **50 frames
per second** (`maxFps = 50` in `<Viewer>`; `<Editor>` does not pass it, so a host cannot change
it). The number that matters is how many frames Pascal really draws: each WebGPU frame starts with
`GPUCanvasContext.getCurrentTexture()`, so its calls are counted while the camera is orbited with
the right mouse button for 5 s, 3 runs, on the charger. A frame counts as slow when it takes more
than 33.4 ms (under 30 fps). Screenshots taken during the drag differ from each other, so the
camera really turned. Correction: the first version of this record counted the browser's
animation frames instead (238.8 fps NVIDIA, 81.5 fps Intel). Those show how busy the browser was,
not how fast Pascal draws.

**Trial A, Pascal's own CLI** (`npx @pascal-app/cli editor`, runtime 1.1.4):
- Starts on Windows: yes. Downloads 127.6 MB once, verifies the digest, serves
  `http://pascal.localhost:59118` plus an MCP server. `doctor`: all checks pass; one warning that
  other users can read the data folder.
- 3D uses WebGPU (`[viewer] WebGPU device ready`), 56 node kinds and 9 bundled plugins loaded.
- A rectangle room drawn with the Rectangle tool (two clicks) is in the saved scene: 4 walls, a
  slab, a ceiling, a zone (read back from `GET /api/scenes/<id>`).
- Console: no errors; only untranslated-message and three.js deprecation warnings.
- It stays a trial tool: plugin install is not enabled in this CLI release.

**Trial B, our Vite host** (Vite 8.3.7, React 19.3.1, packages 1.1.4, no `next`):
- Installed with pnpm (owner's instruction, instead of the brief's npm): 46 s clean, with
  `auto-install-peers=false` so `next` stays out. Unmet peers reported: `next >=15`,
  `esbuild-wasm ^0.27.3`; neither is needed for what was tested.
- `vite build`: 0 errors, about 5 s (6.7 to 9.4 s wall time). Warnings: Node `util`/`stream`
  externalized for `blob-stream` (Pascal's PDF export), chunks over 500 kB. Output 18.7 MB,
  including 3 `.wasm` files and a worker.
- In Edge: WebGPU device, no page errors, 0 broken images of 8 (icons copied from Pascal's
  repo), one 404 (no favicon). The L-shaped shop shows in 2D and 3D; its label reads
  "L shop, 94.9 m²" (expected 94.94). The 3D/2D switch works both ways. One more rectangle room
  drawn (shortcut B) appears in both views and is saved by our `onSave` (10 walls, 2 zones).
- Speed: see the table below.

**Electron check** (`..\pascal-vite-trial\electron-check\main.cjs`, outside the repo; a window
with `sandbox`, `contextIsolation`, no `nodeIntegration`, permissions refused, and the same
request filter as `app/main/index.ts`: remote schemes and files outside the page folder refused):
1. The normal build does not load from `file://`: its absolute `/assets/...` paths become
   `file:///D:/assets/...`, outside the page folder, and are refused. Fix: build with `base: './'`.
2. The relative build renders: WebGPU on NVIDIA, the shop loaded with `fetch` from `file://`,
   walls drawn. Broken: all 8 editor icons (`/icons/...` is hard-coded in the editor, so
   `iconsBaseUrl` does not cover it), and every remote request is refused: wall and floor
   textures from `https://editor.pascal.app` (the default `assetsBaseUrl`), a few UI icons from
   `https://api.iconify.design`, and the Draco decoder from `https://www.gstatic.com`.
3. With our real CSP (`app/renderer/index.html`) two directives break Pascal:
   - `script-src 'self'` blocks `WebAssembly.instantiate` (needs `'wasm-unsafe-eval'`);
   - `connect-src 'self'` blocks a `fetch` of a `data:model/gltf-binary` URL, and the 3D scene
     crashes into its error boundary (no area label).
   No `style-src` or `img-src` violation was reported.
4. Our CSP plus `'wasm-unsafe-eval'` in `script-src`, `data: blob:` in `connect-src`, `blob:` in
   `img-src` and `worker-src 'self' blob:` renders the scene with its area and no CSP error
   except the remote Draco decoder. Only the first two additions are proven necessary; the
   `blob:` ones were added together and not tested one by one.

**Speed** (frames Pascal draws, median of 3 runs of 5 s; slow = over 33.4 ms). Electron runs use
build 4 above in the locked-down window. The Intel GPU is forced with
`--force_low_power_gpu --use-webgpu-power-preference=force-low-power` (Chromium ignores
`powerPreference` on Windows). "60 shelves" is the L-shaped shop plus 60 of Pascal's built-in
bookshelf units (1.2 x 0.45 x 1.8 m, 5 rows, 2 columns, back panel), the project's 60-fixture
target; they need no files from the internet.

| Scene | Where | GPU | fps (3 runs) | 95th-percentile frame | Slow frames |
|---|---|---|---|---|---|
| Walls only | Electron | NVIDIA | 50 (50, 50, 50) | 21.3 to 21.9 ms | 0 of 751 |
| Walls only | Electron | Intel | 50 (49.9, 50, 50) | 21.5 to 22.2 ms | 1 of 752 |
| Walls only | Edge | NVIDIA | 50 (50, 50, 50) | 21.6 to 21.9 ms | 1 of 752 |
| Walls only, textures | Edge | Intel | 49.4 (49.4, 50, 49.3) | 21.6 to 36.7 ms | 28 of 748 |
| Walls only, no textures | Edge | Intel | 49.8 (49.8, 50, 49.6) | 21.6 to 35.2 ms | 30 of 751 |
| 60 shelves | Electron | NVIDIA | 49.9 (49.2, 49.9, 50) | 21.7 to 21.9 ms | 3 of 746 |
| 60 shelves | Electron | Intel | 48.2 (48.2, 48.4, 46.9) | 23.5 to 32.4 ms | 19 of 720 |
| 60 shelves, textures | Edge | Intel | 46.3 (46.9, 46.3, 45.9) | 28.2 to 31 ms | 31 of 699 |

Every run is above the 30 fps target; the slowest run drew 45.9 fps. The NVIDIA GPU holds the
50 fps cap even with 60 shelves. The Intel GPU loses 2 to 4 fps with 60 shelves and shows short
stutters (single frames up to 48 ms); the first run with shelves had one 116 to 163 ms frame on
both GPUs, most likely the one-time preparation of the shelf's GPU programs. Textures make no
measurable difference. Edge on Intel stutters more than Electron on Intel at a similar render
size (1544 x 852 against 1513 x 803 pixels); why was not found. Not measured: a shelf hosting
items, real product models (GLB), and the 2D view's speed.

**Gotchas found**
- On battery at 10 % the whole browser ran at about 26 fps, an empty page too. Measure speed only
  on the charger.
- Pascal caps its 3D at 50 fps and `<Editor>` offers no way to raise it. Counting browser
  animation frames measures the browser, not Pascal: count draws (see "How speed is measured").
- Two separate `pnpm add` runs gave two copies of every `@pascal-app` package (different peer
  hashes). Two copies of `core` mean two node registries. Install in one step and check
  `node_modules/.pnpm` for one copy each.
- Units come from the computer's time zone (Pacific here, so feet). The setting is saved in
  `localStorage["viewer-preferences"]` as `unit`; our host must set metric itself.
- `<Editor>` does have a `projectName` prop in 1.1.4 (`projectName?: string | null`,
  `packages/editor/src/components/editor/index.tsx` line 328; corrected 2026-11-13, the first
  version of this record wrongly said it had none). Without `sidebarTabs` the host has no Build
  panel (Pascal's Rectangle, Walls, Door buttons live in its app, not in the package); the tools
  still work through their shortcuts. The 3D/2D switch buttons are not exposed with the role
  "button", so tests must find them by text.
- The textures exist in Pascal's repository (`apps/editor/public/material`, 302 files, 17.2 MB),
  so they can be bundled; their licence must be checked before shipping them.
- Version 1.1.0 does not export `@pascal-app/viewer/ui/theme.css` (1.1.3 and later do). After
  changing versions, delete the `.next` and `node_modules/.vite` caches.
- Electron 45 logs that the `console-message` listener arguments are deprecated; use the event
  object.

**What phase 1 must therefore do:** serve the renderer from a custom protocol (or rewrite
`/icons`) so absolute paths resolve; `configureViewer` with local `assetsBaseUrl`,
`iconsBaseUrl` and `decoders.dracoPath`; bundle the textures, the Draco decoder and the iconify
icons used; add `'wasm-unsafe-eval'` and `connect-src data:` to the CSP (and prove whether the
`blob:` entries are needed); the e2e smoke test proves that no request leaves the machine.
