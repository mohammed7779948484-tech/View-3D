# 0002 A local-first web app installed as a PWA

**Status:** proposed; the hosting part waits for the owner (needed before Milestone 2)

**Decision (proposed).** One web app, installed as a PWA on the owner's Windows laptop and on
his phone. All computing (layout, 3D, exports) runs in the browser on his own machine and works
offline once cached. Each project is one JSON file in a Documents folder.

**Why.** With a budget of $0 every Windows installer (Electron or Tauri) shows a SmartScreen
warning; signing costs about $10 a month or $150 to $300 a year. A PWA has no installer, updates
itself, and uses the same Chromium engine as Electron.

**Trade-offs.** Chromium only (Edge or Chrome). It needs a static site to be hosted somewhere.
Browser storage can be cleared, which is why projects are files on disk.

**Kept open on purpose.**
- A desktop wrapper (Tauri v2 preferred, about 10 MB) can be added later without changing the app.
- Photoreal rendering with headless Blender cannot run inside a PWA. It will need that wrapper
  or a small local helper program. The engine and the exports are pure functions of the JSON
  document with no browser or Node API, so they can run in either.
- Phone to laptop: a small store-and-forward inbox so it works across networks and when the
  laptop is off; a link, QR code or file as the zero-server fallback. See the plan for what the
  hosted part must provide.
