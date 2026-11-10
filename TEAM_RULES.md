# Team Rules

Every agent reads this file before acting. Source: the owner's intake answers and plan review
(2026-11-09/10).

## Goal and definition of done

- Product: a 3D store-layout planner for New Horizon Fixture. One user (the shop owner).
- **Milestone 1 is the headless auto-layout engine.** It is done when every issue has a test that
  failed first and passes now, the full suite is green on a clean checkout, and every test scenario
  has an SVG + PNG snapshot of the room and of each ranked layout (aisles, clearances, labels).
  The owner reviews the snapshots before any UI work starts.

## Never without the owner's explicit yes

1. Hosting or any online service (relay, database, domain, update server). Hosting is undecided
   until just before Milestone 2.
2. Anything that costs money. Budget is $0: free and open-source only.
3. Merging pull requests. We open draft PRs; the owner merges.
4. Product data and prices. Website values are `unverified` until the owner confirms them.
5. Secrets, deployments, anything public.

## Working rules

- A claim counts only with evidence from a tool run: passing test, type check, measured number,
  screenshot or diff. "Should work" is not evidence.
- A failing test comes first. No failing test means the requirement is not understood: ask.
- Never weaken, skip or delete a test to get green.
- Never invent product dimensions. Unknown stays `unknown` and is flagged. Synthetic products are
  allowed only in `test/fixtures`, marked `testOnly`, and never appear in the real catalog.
- No new dependency without a reason in the PR and an entry in `STACK.md`.
- No refactors beyond the issue. No over-engineering: one package with internal folders; split
  only when a real need appears.
- Stuck for 20 minutes: write one question, park the issue, move on.
- Milestone 1 ships as one draft PR from `claude/sleepy-wright-wno1ub`, one commit per issue.
- Reports go to the owner at the end of each milestone and whenever a decision is needed.

- Subagents (owner, 2026-11-10): do not use them, they cost too many tokens. If one is ever
  unavoidable it runs on Sonnet 5.5. The Lead writes the code; the Prover step is a fresh-clone
  run of every check.

## Product principles

1. The measurement is the truth: what is on screen matches reality.
2. Deterministic, not probabilistic. Same input gives the same output, byte for byte.
3. One JSON design document is the single source of truth; everything else is derived.
4. Real products only.
5. A sales tool before a design tool: fast, convincing, Arabic-friendly (RTL).
6. Simple for a non-engineer.

## Context for later milestones

- Owner's computer: Windows, integrated graphics. Keep 3D light.
- Photoreal rendering with headless Blender on the owner's machine is planned after V1. A PWA
  cannot run Blender, so the engine and exports stay pure functions of the JSON document with no
  browser-only dependencies, compatible with a later Tauri wrapper or a small local helper.

## Crew and handoffs

Lead (plans, verifies, only one who messages the owner), Scout (research), Breaker (failing
tests), Builders (one per module), Prover (fresh read-only re-run; rejection is final), Reviewer
(hostile diff review). Every handoff uses: ISSUE, TEST, EVIDENCE, NEXT STEP.
