# 0007 V1 is a laptop-only, fully local Electron desktop app

**Status:** decided by the owner on 2026-11-11. Supersedes `0002-local-web-app-pwa.md`.

**Decision.** V1 runs only on the owner's Windows laptop as a local desktop app built with
Electron (electron-vite + electron-builder, unsigned NSIS installer). Projects are JSON files
opened and saved through native dialogs. No phone screen, PWA, phone-to-laptop sync or hosting
in V1. Room input is numeric entry and the 2D editor on the laptop, plus importing files that a
separate iPhone scan app exports (app not chosen yet; one adapter per app).

**Why.** The owner wants the first version simple enough to try: no network, no accounts, no
hosted pieces, no browser storage rules. Electron gives native file dialogs and printing, and
Chromium's `printToPDF` handles Arabic shaping and right-to-left text, which removes the riskiest
part of the earlier PDF plan.

**Trade-offs.**
- The unsigned installer shows a SmartScreen warning once; the owner accepts it. Signing costs
  money and needs the owner's yes.
- No auto-update in V1: new versions ship as a new installer by hand.
- The app is about 100 MB or more; Electron majors arrive about every 8 weeks, so the version is
  pinned and updated on purpose.

**Kept open on purpose.**
- Electron's main process can start local programs, so headless Blender and Python tooling can
  be added after V1 without changing the engine.
- The engine and the exports stay pure functions of the JSON document (`src/`), with no Node or
  DOM API, so they also run in a worker, in Node, or for a later renderer.
- Phone capture, sync and hosting are listed under "Future" in `../plans/M2-M4-plan.md`.
