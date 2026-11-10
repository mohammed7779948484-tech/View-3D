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

## Proposed for later milestones (not adopted until spiked)

| Capability | Proposal | Alternatives |
|---|---|---|
| App | Vite 8.3 + React 19.3 SPA | Next.js 16.4, TanStack Start (server features we do not need) |
| 2D editor | Plain SVG + React | react-konva 19.3 (fallback), pixi.js 8 (258 kB gz), fabric 7, tldraw 5 (not free in production) |
| 3D | three r187 + @react-three/fiber 9.8, WebGL renderer | WebGPURenderer: no benefit for placeholder boxes on integrated graphics |
| State / undo | zustand 5.1 + immer 11 patches | zundo 2.3.0 (stale since 2024-11), jotai 3, redux toolkit |
| PDF | pdfkit 0.20 + bidi-js + embedded Arabic font | jspdf 4.2 + svg2pdf.js, pdfmake 0.3, pdf-lib 1.17 (abandoned 2021) |
| i18n / UI | react-i18next 18, shadcn + Radix + Tailwind 4 logical properties | lingui, react-intl, Mantine 9, MUI 9 |
| PWA | vite-plugin-pwa 2.0 + own IndexedDB outbox | serwist 9.5 |
| Desktop wrapper (optional) | Tauri v2 | Electron 45 (about 100+ MB) |
