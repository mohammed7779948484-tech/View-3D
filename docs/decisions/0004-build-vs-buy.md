# 0004 Build versus buy

**Status:** accepted for Milestone 1; revisited per milestone

**Rule.** Take a library when it fits and saves real effort. Write our own when the libraries
do not fit, are too heavy, or cost more than they save. Record both in `../STACK.md`.

| Capability | Choice | Reason |
|---|---|---|
| Polygon inset and boolean operations | buy: `clipper2-ts`, behind `src/geometry/clip.ts` | Hard to get right; integer coordinates |
| Schema validation | buy: `zod` | Validation, types and migrations in one |
| SVG to PNG | buy: `@resvg/resvg-js`, behind `src/render-svg/png.ts` | Renders without a browser |
| Exact integer maths, rectangle collision, distances | build | About 150 lines; the libraries are abandoned or float-based |
| Layout engine | build | No library solves retail layout and explains itself |
| Plan drawing (SVG) | build | String building; the same writer will feed the PDF |
| Editing layer (Milestones 2 and 3) | build, see the plan | Pascal Editor packages re-evaluated and not adopted |

Wrapped libraries have exactly one importing file, enforced by `test/architecture/imports.test.ts`.
