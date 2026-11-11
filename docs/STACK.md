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
| 3D | three 0.187.0 + @react-three/fiber 9.8.2, WebGL renderer, no drei (owner 2026-11-11: three.js's own camera controls) | WebGPURenderer: no benefit for placeholder boxes on integrated graphics; drei 10.7.9: about 30 extra packages for helpers we do not need |
| PDF | Electron/Chromium `printToPDF` from our own HTML + SVG sheet (Chromium shapes Arabic and handles RTL) | Fallback only: pdfkit 0.20 + bidi-js + embedded Arabic font, or jspdf 4.2 + svg2pdf.js |
| Scan import (DXF fallback) | Deferred (owner 2026-11-11): no DXF reader until a real DXF sample from a chosen scan app exists | dxf-parser 1.1.2 (last published 2022-06) |
| UI kit | Not adopted for M3 (owner 2026-11-11): plain CSS with logical properties and the native `<dialog>` | shadcn + Radix + Tailwind 4, Mantine 9, MUI 9 |

Removed from V1 on 2026-11-11 (owner decision, see `decisions/0007-local-electron-desktop-app.md`): vite-plugin-pwa / serwist, IndexedDB outbox, File System Access API, a QR library, any hosting.
