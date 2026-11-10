# 0005 Snapshots

**Status:** accepted (2026-11-10)

**Decision.** The SVG of every test room and every ranked layout is committed under `snapshots/`
and compared by the tests as text, with line endings normalised. PNGs are not committed: they
are produced by `pnpm snapshots:png` into `snapshots-png/` and uploaded by CI as an artifact.

**Why.**
- SVG is the checked artefact: it is text, it diffs, and GitHub shows it in the gallery page.
- PNG bytes depend on the installed fonts and change on every regeneration, so committing them
  only added binary churn to the repository (the first review counted this as a risk).
- Windows checks text out with CRLF by default; `.gitattributes` forces LF and the comparison
  ignores the difference anyway, so the suite passes on the owner's machine.

**Cost.** Any intended change to the drawing or the engine means regenerating the SVGs
(`pnpm snapshots:update`) and looking at them before committing. That is deliberate.

`snapshots/before/` holds the first-round layouts, frozen, for the before/after gallery. They
are not compared by any test.
