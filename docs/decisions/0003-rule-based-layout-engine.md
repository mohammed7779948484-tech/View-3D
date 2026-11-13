# 0003 A deterministic rule-based layout engine

**Status:** accepted (2026-11-10), reworked after the first review

**Decision.** The engine (`src/layout`) is a constructive placer with a small exhaustive search.
No random numbers, no clock, no AI.

1. The room is validated first (`validateRoom`). A bad room is reported, never laid out.
2. Placement order: the checkout block (counter and glass showcases as one straight or L-shaped
   block near the entrance, staff space behind) → single-sided units along walls → islands on
   ONE grid of equally spaced rows (double-sided gondolas, then single-sided units left over as
   back-to-back pairs, then other freestanding fixtures). A fixture alone in a row is moved into
   a run or reported.
3. A position is accepted only if the layout still passes every rule. The local rules are
   checked directly; the walking rules by the same function the validator uses
   (`walkingViolations`). Each finished option is checked again with `validateLayout`.
4. Search: for every counter wall (best three) and row direction (two), every combination of
   wall order, grid start side and island order is built in full and the best is kept.
5. Options are ranked by fixtures placed, then by an explained score out of 100.
   **Amended by the owner on 2026-11-11 (M3 issue 10b):** the sort key is
   `placed + (complete checkout block ? 1 : 0)`, highest first; on a tie a complete block wins,
   then the higher score. A complete checkout block means the counter is placed and every
   requested glass showcase stands in its block. This keeps the owner's exception (one fixture
   fewer with a complete block beats one more without) and is a total order: the first wording
   ("placed first, except when two options differ by exactly one ...") could loop, for example
   10 placed incomplete with a high score > 10 placed complete with a low score > 9 placed complete
   > the first one. A fast-check property proves the order never loops. Status: implemented in
   M3 issue 10b (`src/layout/rank.ts`); it moved one pair of options in one test shop.
6. Every rejected position is counted by reason; what did not fit is reported with the causes
   most positions failed on.

**Why not a solver.** Researched: facility-layout MILP, "Make it Home" (simulated annealing),
Merrell et al. (patented), nesting, CP-SAT, MILP. Solver builds for the browser are 22 to 183 MB
or GPL, and none explains "why did this not fit" in words an owner can use. See `../STACK.md`.

**Known limits.**
- The counter is tried parallel to a wall only (no free-standing cash wrap).
- L-shaped blocks need a right-angled inside corner.
- One row direction per option, taken from the entrance wall.
- It is greedy inside each search run: it can miss an arrangement a person would find. It never
  claims that nothing better exists.
- Score weights are first guesses, to be tuned with the owner.

**Independent check.** `test/oracle` re-judges every option with code that shares nothing with
the rules (sampling and a flood fill), so a bug in a rule cannot hide behind the engine using
the same rule.
