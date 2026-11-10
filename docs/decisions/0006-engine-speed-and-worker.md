# 0006 Engine speed, and running it off the UI thread

**Status:** accepted (2026-11-10)

**Measured** (this container, Node 22, one thread, all ranked options):

| Request | Time |
|---|---|
| 15 m × 10 m, 35 fixtures (the review's benchmark) | about 2.2 s (was 6.3 s in the review, with no search) |
| L-shaped shop, 17 fixtures | about 0.9 s |
| Small over-full shop, 18 requested | about 0.7 s |

**Target.** The benchmark within 3 s, enforced by `test/layout/quality.test.ts`.

**What was done.** The walking rules are shared with the validator and run once per accepted
candidate instead of the whole validator; bounding boxes rule out most exact tests; positions
found impossible against the fixtures placed before the islands are remembered and shared by the
search runs; only the kept layout of each strategy is centred and fully re-validated.

**What was not done, on purpose.** No spatial index, no incremental region updates, no
parallel search. They are not needed at this size.

**Milestone 3.** Two seconds is too long to block a UI. The engine is a pure function of a
JSON request with no DOM or Node API (enforced by the architecture test), so it will run in a
Web Worker: the app posts the request, shows progress, and receives the options as JSON. The
search runs are independent, so they can also be split across workers later if needed.
