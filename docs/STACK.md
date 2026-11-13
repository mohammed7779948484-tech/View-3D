# Stack

Versions and dates were read from the npm registry on 2026-11-09/10; sizes from bundlephobia.
GitHub API access was not available, so maintenance is judged from publish dates.
"Spike" means a passing test in `test/spikes/libraries.test.ts`.

## Adopted in Milestone 1

| Capability | Choice | Version (released) | Licence | Evidence | Why this one |
|---|---|---|---|---|---|
| Language | TypeScript | 7.0.2 (2026-07-08) | Apache-2.0 | `pnpm typecheck` passes | Current major; works with Vitest 5 in the spike |
| Test runner | Vitest | 5.1.0 (2026-11-02) | MIT | spike | Standard for TS; fast |
| Property tests | fast-check | 4.10.2 (2026-09) | MIT | spike | Geometry needs randomized, seeded checks |
| Schema | zod | 4.6.7 (2026-10-12) | MIT | spike | Validation, JSON Schema export and migrations in one |
| Polygon offset / boolean | clipper2-ts | 2.0.1-19 (2026-11-07) | BSL-1.0 | spike: exact inset and boolean areas on integer µm | Integer coordinates, offsetting, actively published |
| SVG to PNG | @resvg/resvg-js | 2.6.2 (2024-03) | MPL-2.0 | spike | Renders in Node without a browser; stable |
| Package manager | pnpm | 10.28 | MIT | lockfile install | One package, no monorepo tooling |
| Node type definitions | @types/node | 22.20.5 (pinned exactly) | MIT | `pnpm typecheck` passes | Types for the Node APIs used by tests and `src/render-svg/png.ts`; matches the Node 22 used in CI |

### Alternatives considered

| Capability | Alternative | Why not |
|---|---|---|
| Schema | valibot 1.5.0 (14 kB), arktype 2.2.9 | Smaller, but zod's JSON Schema and ecosystem win; bundle size is irrelevant headless |
| Polygon ops | clipper2-js 1.2.4 (2024-01) | No release in almost three years. Kept as fallback |
| | clipper2-wasm 0.4.0 | WASM memory management for no gain at our sizes |
| | polygon-clipping 0.15.7, polyclip-ts 0.16.8 | Booleans only, floating point, no offset |
| | @flatten-js/core 1.6.15 | Floating point; we want integer exactness |
| | @turf/turf 7.4.0 | Geodesic (lat/long) model, wrong for a floor plan |
| PNG | sharp 0.35.5 | Heavier native dependency; resvg is enough |
| Monorepo | turborepo 2.11, six packages | Over-engineering for one package (owner decision) |

Risk recorded: `clipper2-ts` carries a prerelease-style version tag and the package is one year
old. Mitigation: exact version pin, all use goes through `src/geometry`, and the spike tests
exact areas so a bad upgrade fails loudly.

## Adopted in Milestone 2

Versions and release dates read from the npm registry on 2026-11-11. All are dev dependencies:
the app is bundled by electron-vite, so nothing but `out/` and `package.json` goes into the
installer. Spikes: `test/spikes/libraries.test.ts` (Vitest) and `test/spikes/electron.spec.ts`
(Playwright).

| Capability | Choice | Version (released) | Licence | Evidence | Why this one |
|---|---|---|---|---|---|
| Desktop shell | Electron | 45.3.0 (2026-11-10) | MIT | spike `electron.spec.ts`: sandboxed window, contextBridge, locked-down preferences; smoke test of the packaged app | Owner decision 0007; Chromium gives native dialogs, `printToPDF` and Arabic shaping |
| Build | electron-vite | 6.0.0 (2026-10-14) | MIT | spike: builds main (ESM), preload (CJS, required for a sandboxed preload) and renderer with relative `./assets/` paths | One config for the three Electron processes on top of Vite |
| Bundler | Vite | 8.3.7 (2026-11-09) | MIT | spike + `pnpm build` | Required by electron-vite 6 (peer ^6 to ^8) |
| React transform | @vitejs/plugin-react | 6.3.0 (2026-11-09) | MIT | spike | Official React plugin for Vite 8 |
| UI | React, react-dom | 19.3.1 (2026-10-14) | MIT | spike + smoke test | Plan decision; the skills and shadcn assume it |
| UI types | @types/react, @types/react-dom | 19.3.0 (2026-09-09) | MIT | `pnpm typecheck` | Types for React 19.3 |
| Packaging | electron-builder | 26.18.0 (2026-10-20) | MIT | local `--dir` build passes the smoke test; Windows NSIS build, silent install and smoke test on the `package-windows` CI job | Unsigned NSIS installer without extra tooling; Electron fuses in the same config |
| End-to-end tests | @playwright/test | 1.65.0 (2026-11-05) | Apache-2.0 | spike `electron.spec.ts`; `test/e2e/smoke.spec.ts` | Drives Electron directly (`_electron.launch`), also the installed `.exe` |
| Translation | i18next, react-i18next | 27.1.1 (2026-11-10), 18.0.1 (2026-11-08) | MIT | spike: synchronous init (`initAsync: false`), `useTranslation` render, `dir('ar') === 'rtl'` | Every string through `t()` from issue 1; `dir()` drives RTL in issue 9 |

### Alternatives considered (Milestone 2)

| Capability | Alternative | Why not |
|---|---|---|
| Packaging | Electron Forge | Owner decision: electron-builder (one config for NSIS and fuses) |
| Desktop shell | Tauri v2 | Needs Rust; decision 0007 |
| Translation | lingui 5, react-intl 7 | i18next has `dir()` for RTL and loads plain JSON; either would also work |
| State / undo | zustand 5.1 (not adopted) | A vanilla store with `subscribe` plus React's `useSyncExternalStore` is about 60 lines; immer 11.2.10 (MIT, 2026-11-10, spike in `libraries.test.ts`) gives structural sharing and frozen snapshots for undo |
| UI kit | Tailwind 4 + shadcn/ui + Radix | Milestone 2 has only forms, buttons and selects: one stylesheet with CSS logical properties mirrors for Arabic without a dependency. Revisit when M3 needs dialogs, menus or popovers |
| End-to-end tests | WebdriverIO + wdio-electron-service | Playwright is already the planned tool and has a project skill |

Risks recorded:
- Electron 45.3.0 was one day old when pinned. A new Electron major arrives about every 8 weeks;
  upgrades are made on purpose, with the smoke test on the installed app.
- `webContents.getLastWebPreferences()` works at runtime but is missing from Electron 45's types;
  the tests cast to a small local type.
- electron-vite is maintained mainly by one person. Fallback: three plain Vite builds.
- pnpm reports `electron-winstaller`'s install script as ignored. That package only builds
  Squirrel installers; we build NSIS, so the script is not needed.
- Electron fuses: `runAsNode` and `NODE_OPTIONS` are off (checked: the packaged app ignores
  `ELECTRON_RUN_AS_NODE`); the inspector flags stay on so Playwright can drive the installed app.

## Adopted in Milestone 3

Versions and release dates read from the npm registry on 2026-11-11. Dev dependencies, bundled
into the renderer by electron-vite.

| Capability | Choice | Version (released) | Licence | Evidence | Why this one |
|---|---|---|---|---|---|
| 3D | three | 0.187.0 (2026-10-30) | MIT | spike `test/spikes/three.spec.ts`: WebGL2 scene of 60 real catalog products, every box read back from the scene graph within 1 mm and 1e-4 rad of the document | The plan's 3D library; WebGL renderer, no post-processing |
| 3D in React | @react-three/fiber | 9.8.2 (2026-10-14) | MIT | same spike; React 19.3.1 is inside its peer range (>=19 <19.4) | The scene as JSX on our one document store; it brings zustand internally (not used by our code) |
| 3D types | @types/three | 0.187.0 (2026-10-30) | MIT | `pnpm typecheck` | Matches three 0.187 |

Not adopted: @react-three/drei 10.7.9 (owner ruling 2026-11-11: about 30 extra packages for helpers
we do not need; three.js's own controls instead), WebGPURenderer (no gain for placeholder boxes on
integrated graphics), three-mesh-bvh 0.9.18 (only if picking measures slow).

**3D frame times, CI numbers** (this container, Linux, no GPU, Electron started with
`--enable-unsafe-swiftshader`, renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device
(Subzero)))", 600 measured frames per setup after 30 warm-up frames, camera on a fixed circle):

| Setup | Fixtures | Shadows | Instanced | Median | p95 | Draw calls | Triangles |
|---|---|---|---|---|---|---|---|
| A (the app's default) | 60 | off | yes | 16.7 ms | 17.4 ms | 2 | 722 |
| B | 60 | on | yes | 16.5 ms | 18.6 ms | 3 | 1442 |
| C | 60 | off | no | 16.5 ms | 17.4 ms | 61 | 722 |
| D | 120 | off | yes | 16.7 ms | 17.4 ms | 2 | 1442 |

GitHub CI (`ci.yml`, both runners also on SwiftShader): Ubuntu A 16.6 / 17.4 ms, B 17.0 / 19.9,
C 16.8 / 17.3, D 16.7 / 17.2; Windows A 15.6 / 16.5 ms, B 15.7 / 16.3, C 15.8 / 16.7, D 15.6 / 16.3
(median / p95; that runner's display refreshes at 64 Hz).

**Layout engine in a Web Worker** (no library): `app/renderer/worker/layout.worker.ts`, built by
electron-vite as its own file (`new Worker(new URL(...), { type: 'module' })`), loads from `file://`
under the app's Content Security Policy with no change to it. Spike `test/spikes/worker.spec.ts`:
the worker's JSON is byte-identical (SHA-256) to `autoLayout` called directly in Node 22, so
Electron's V8 and Node's V8 give the same layout. 200 ms in the worker against 273 ms in Node for
the 9-product test shop (this container). The owner can time it on his laptop: Diagnostics, "Test
layout speed".

Frame times are measured between animation frames, so they cannot go below the display's refresh
interval (16.7 ms at 60 Hz): every setup here holds 60 frames per second even in software. These are
CI numbers, not the owner's laptop. His laptop is measured with Diagnostics, "Test 3D speed" (one
click; it shows PASS when setup A's median is at most 33.3 ms and its p95 at most 50 ms, the 30
frames per second target). Not measured yet: his integrated graphics.

Risks: three adds about 1.2 MB to the renderer bundle (3.3 MB in all); it loads from disk, so the
start is not affected noticeably. Without a GPU, a visible Electron 45 window still gets WebGL from
Chromium's own software fallback (SwiftShader), measured 2026-11-11; the app adds no switch for it
(owner ruling) and does not block it either. Only with the GPU and the software rasterizer both
disabled (`--disable-gpu --disable-software-rasterizer`, which the no-WebGL test uses) is there no
WebGL at all; 3D then says it is not available and 2D keeps working. Correction: an earlier probe
used a hidden window, which has no fallback, and wrongly concluded "no WebGL without a GPU".

## Adopted before Milestone 4 (owner ruling 2026-11-12: reverses rulings 4 and 5)

The owner asked for a more professional interface built with ready-made components. Personal,
local use: open-source licences are no obstacle. Versions pinned exactly, each at least two weeks
old when added.

| Capability | Choice | Version (released) | Licence | Evidence | Why this one |
|---|---|---|---|---|---|
| Styling | tailwindcss, @tailwindcss/vite | 4.3.3 (2026-07-16) | MIT | `pnpm build`; every e2e test passes on the restyled screens | Utility classes for shadcn/ui; the Vite plugin needs no config file |
| UI components | shadcn/ui (copied source in `app/renderer/components/ui`, style new-york, radix base, RTL classes) | CLI 4.23.0 | MIT | Button, Card, Input, Label, NativeSelect, Separator, Badge, Alert, Checkbox, Field, Progress, ScrollArea, Tooltip | Accessible, consistent components; the source is ours to change |
| Primitives | radix-ui | 1.8.1 (2026-10-14) | MIT | used by the shadcn components | shadcn's radix base |
| Variants / class merging | class-variance-authority, clsx, tailwind-merge | 0.7.1, 2.1.1, 3.7.0 | Apache-2.0 / MIT / MIT | `cn()` in `app/renderer/lib/utils.ts` | What shadcn components expect |
| Animations | tw-animate-css | 1.4.0 (2026-02-28) | MIT | imported in globals.css | shadcn's animation utilities |
| Icons | lucide-react | 1.66.0 (2026-10-31) | ISC | toolbar and start screen | shadcn's icon library; inline SVG, works offline |
| 3D helpers | @react-three/drei | 10.7.9 (2026-09-25) | MIT | 3D view | Camera controls, edges, labels and soft shadows without writing them; nothing loaded from the network (no Environment presets, no CDN fonts) |

Native `<select>` (shadcn NativeSelect) is kept instead of the Radix Select: it stays a real
combobox, keyboard and RTL behave as the system does, and the tests drive it as one.

## Spiked, not adopted (Pascal editor)

Tried on the owner's Windows laptop on 2026-11-12 (`decisions/0008-pascal-editor-foundation.md`,
status proposed). Versions, release dates and licences read from the npm registry the same day.
Nothing here moves to "Adopted" until phase 1 of 0008 (the host in the packaged app) lands. The
trial ran in folders next to the repository; no View-3D code or `package.json` changed.

| Package | Version (released) | Licence | What the trial proved |
|---|---|---|---|
| @pascal-app/core | 1.1.4 (2026-11-12) | MIT | Scene graph, node registry, i18n; loads our L-shaped test shop (94.9 m², expected 94.94) |
| @pascal-app/viewer | 1.1.4 (2026-11-12) | MIT | WebGPU 3D on both GPUs of the laptop, at its own 50 fps cap: with 60 bookshelf units, orbiting in Electron, NVIDIA 49.9 fps and Intel integrated 48.2 fps (slowest run of all 45.9; target 30) |
| @pascal-app/editor | 1.1.4 (2026-11-12) | MIT | 2D and 3D editing, switch between them, draw a room; ships TypeScript source; built by Vite 8.3.7 with 4 `next` aliases and no `next` installed (0 errors, about 5 s) |
| @pascal-app/nodes | 1.1.4 (2026-11-12) | MIT | The built-in node kinds (walls, zones, slabs, doors...) registered by our host |
| @pascal-app/cli | 1.1.4 (2026-11-12) | MIT | Runs on Windows (127.6 MB runtime, WebGPU); a closed prebuilt app without plugin install, so for trying Pascal only |

Electron 45.3.0 (locked-down window, our request filter): the host renders with WebGPU from
`file://` when built with `base: './'`. Our CSP needs `'wasm-unsafe-eval'` and `connect-src data:`
for it; Pascal's textures, some icons and its Draco decoder come from the internet by default and
must be bundled (details and gotchas in 0008).

Risks: 1.1.4 was published on the day of the trial (1.1.0 two days earlier); the editor is
compiled from source by our build; a second model (Pascal's scene, floating-point metres) beside
our integer-micrometre document until the owner decides the source of truth.

### Alternatives dropped

| Alternative | Why not |
|---|---|
| Our own editor (SVG 2D + R3F 3D, M2/M3 issues) | Rebuilds what Pascal maintains (walls, rooms, openings, 2D and 3D of one scene, dimensions, undo); our value is the catalog, rules and layout engine, which stay ours. The current editor stays until phase 5 of 0008 |
| A Next.js host (Pascal's own app) | Pascal's packages use `next` only for `next/image` and image config; four aliases replace it. Electron + electron-vite stays (decision 0007) |
| A fork of Pascal | Upgrades become our job. `pnpm patch` first; a fork only if a patch is not enough |

## Built ourselves (and why)

| Capability | Why build |
|---|---|
| Units and exact integer math | Twenty lines; no library models "integer micrometres plus the value as typed" |
| Point-in-polygon, segment distance, rectangle collision | About 150 lines, property-tested. `sat` (0.9.0) is dead since 2021, `detect-collisions` is a physics-style world we do not need |
| Auto-layout engine | See below. No library solves retail layout with explanations |
| Plan SVG writer | Plain string building; the same writer feeds the PDF plan later |

## Auto-layout: methods researched

| Method | Deterministic | Explains "why it did not fit" | Verdict |
|---|---|---|---|
| Facility-layout MILP / tabu / particle swarm (Ozgormus & Smith 2020; Mowrey, Parikh & Gue 2018) | MILP yes | Weak | Block level, assumes rectangular rooms |
| "Make it Home" (Yu et al., TOG 2011): cost function + simulated annealing | Only if seeded | Weak | Good ideas for scoring terms; search is stochastic |
| Merrell et al. 2011 interactive furniture layout | Only if seeded | Medium | **Patented (US9355470B2). Avoid** |
| Nesting / no-fit polygon (SVGnest, Deepnest) | Only if seeded | Poor | Optimizes material use, ignores aisles |
| Constraint programming (CP-SAT) | Single worker only | Medium | `cp-sat-wasm` 2.0.1 is 22 MB, `or-tools-wasm` 183 MB, one maintainer, needs cross-origin isolation |
| MILP (big-M non-overlap) | Yes | Weak | About 780 pair constraints at 40 items; `glpk.js` is GPL-3.0 |
| **Rule-based constructive placement + fixed-order local improvement** | **Yes, no random numbers** | **Best: every rejection has a concrete reason** | **Chosen** |

Solver libraries checked and not adopted: `@lume/kiwi` 0.4.4 (linear constraints only, cannot
express non-overlap), `javascript-lp-solver` 1.0.3, `glpk.js` 5.0.0 (GPL), `highs` 1.15.4 (MIT,
4 MB; kept as a later option for "how many gondola rows fit a zone"), `z3-solver` 5.3.3 (39 MB),
`minizinc` 4.5.2 (19.6 MB), `logic-solver` 2.0.1 (2016).

## Agent skills (not code dependencies)

Copied as plain files into `.claude/skills/` on 2026-11-10 (git commit of each source):
obra/superpowers `22f0b46` (test-driven-development, systematic-debugging,
verification-before-completion); DietrichGebert/ponytail `96608e0` (ponytail);
jwynia/agent-skills `e02ec7e` (electron-best-practices); vercel-labs/agent-skills `1a2c79d`
(react-best-practices, named vercel-react-best-practices); anthropics/skills `2c5958e`
(frontend-design); shadcn-ui/ui `8ab2771` (skills/shadcn); currents-dev/playwright-best-practices-skill
`0b75b58`; CloudAI-X/threejs-skills `0e18186` (threejs-react-three-fiber). Instructions for the
agent only; nothing is imported by `src/` or `test/`. Project docs win over them (`CLAUDE.md`).

## Proposed for later milestones (not adopted until spiked)

| Capability | Proposal | Alternatives |
|---|---|---|
| 2D editor | Plain SVG + React | react-konva 19.3 (fallback), pixi.js 8 (258 kB gz), fabric 7, tldraw 5 (not free in production) |
| PDF | Electron/Chromium `printToPDF` from our own HTML + SVG sheet (Chromium shapes Arabic and handles RTL) | Fallback only: pdfkit 0.20 + bidi-js + embedded Arabic font, or jspdf 4.2 + svg2pdf.js |
| Scan import (DXF fallback) | Deferred (owner 2026-11-11): no DXF reader until a real DXF sample from a chosen scan app exists | dxf-parser 1.1.2 (last published 2022-06) |
| UI kit | Not adopted for M3 (owner 2026-11-11): plain CSS with logical properties and the native `<dialog>` | shadcn + Radix + Tailwind 4, Mantine 9, MUI 9 |

Removed from V1 on 2026-11-11 (owner decision, see `decisions/0007-local-electron-desktop-app.md`): vite-plugin-pwa / serwist, IndexedDB outbox, File System Access API, a QR library, any hosting.
