# Notes

Running log and decisions. Checkpointed after every step so work survives a restart.

## Decisions

### Units and tolerance
- Stored unit: **integer micrometres (µm)**. 1 in = 25 400 µm exactly; 1 ft = 304 800; 1 mm = 1 000.
  1/16 in = 1 587.5 µm rounds with a 0.5 µm error, far below any build tolerance.
- Why integers: no floating-point drift, exact equality, and Clipper works on integers.
- Every entered value keeps what was typed (value + unit) beside the µm value, so the owner sees
  his own number back.
- Tolerances: geometry comparisons 1 µm; "touching" is not overlapping; rendered and exported
  dimensions must match the document within **±1 mm**.
- Precision: a 100 m coordinate is 1e8 µm, so a product of two coordinates reaches 1e16, above
  2^53 (about 9.007e15). Cross products and areas therefore must not use plain floating-point
  multiplication. Issue 2 carries the test that proves the chosen method exact at 100 m × 100 m.

### Coordinates
- 2D plan: x to the right, y up, counter-clockwise room outline, origin chosen by the document.
- Rotations: quarter turns relative to a wall direction (V1).

### Architecture (proposal, hosting undecided until before Milestone 2)
- One web app installed as a PWA on laptop and phone; all compute on the laptop's own CPU/GPU.
- At $0 every Windows installer (Electron, Tauri) shows a SmartScreen warning; a PWA does not.
- Projects are JSON files in a Documents folder; backup is copying the folder.
- Phone to laptop: store-and-forward inbox (candidate: Cloudflare Worker + D1, free), encrypted
  on the phone; zero-server fallback by link, QR or file.
- Later Blender photoreal rendering needs a Tauri wrapper or local helper, so the engine and
  exports stay free of browser-only APIs.

### Retail planning numbers (config values, with sources)
| Rule | Value | Source |
|---|---|---|
| Main aisle | ≥ 1200 mm | Owner requirement |
| Secondary aisle | ≥ 900 mm | Owner requirement (ADA 2010 §403.5.1 minimum is 915 mm; flagged for the owner) |
| Staff space behind counter | ≥ 915 mm (36 in) | POS vendor guidance (koronapos.com cash-wrap guide); not a code |
| Door approach, pull side | 1525 mm deep, 455 mm beyond latch | ADA 2010 §404.2.4 |
| Entrance decompression zone | first 1.5 m kept clear | Retail convention (5–15 ft); our own conservative value |
| Showcase supervision | near the counter | No published number found; our own rule, flagged |

### Catalog facts (newhorizonfixture.com, read 2026-11-09)
- Custom Next.js site, 18 products, no product feed. Dimensions are inconsistent and often
  missing, so the catalog is entered by hand and confirmed by the owner.
- Stated sizes used as `unverified` seed data:
  - 6FT EXTRA VIEW SHOWCASE: "72″L x 22″W x 38″H" — /products/6ft-extra-view-showcase
  - 4 FT FULL VIEW LED lights Showcase: "72″L x 20″W x 38″/42”H" — /products/6ft-full-view-led-lights-showcase
    (title says 4 FT, text says 72 in: contradiction flagged for the owner)
  - Counter: "24x20x38inch" — /products/c
  - Gondola wood 4 feet: "48(inside )*24*54inch" — /products/jan
  - Gondola 4 feet: "L4*W3*H5'" — /products/g
  - Stand showcases: "48*20*72" (axis order not stated: flagged) — /products/s-1
- No stated size, so `unknown` and not auto-placeable: Showcase 6 feet (/products/s), Cigarette
  display stand, Dip and cigarettes rack.
- No "tower" category exists on the site today.

## Open questions for the owner
1. Secondary aisle: 900 mm as specified, or 915 mm to meet ADA?
2. "4 FT FULL VIEW" showcase: is it 48 in or 72 in long?
3. Stand showcase 48*20*72: confirm which number is width, depth and height.

## Log
- 2026-11-10 Plan approved with changes. Initial README commit pushed to `main`.
- 2026-11-10 Issue 1: scaffold, pinned dependencies, library spikes green (5 tests), typecheck clean.
