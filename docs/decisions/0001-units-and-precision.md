# 0001 Units and precision

**Status:** accepted (2026-11-10)

**Decision.** Every length in the design document is an integer number of micrometres (µm).
Rotation is an integer number of micro-degrees. A value also keeps what the owner typed
(`72 in`) next to the stored number.

**Why.** Products are specified in inches, shops in cm/m. 1 in = 25 400 µm exactly, so both
systems are stored without drift, equality is exact, and the polygon library works on integers.
1/16 in is off by 0.5 µm, far below any building tolerance.

**Consequences.**
- A coordinate can reach 1e8 µm (100 m), so a product of two coordinates reaches 1e16, above
  2^53. Cross products and areas use exact integer maths in `src/geometry/exact.ts`. Never
  multiply two coordinates with plain numbers elsewhere.
- Corners of a turned rectangle are rounded to 1 µm, so contact is judged with a 2 µm tolerance
  (`DEFAULT_TOLERANCE_UM`): touching is not overlapping.
- Directions are taken from the rotation, not from rounded corners (a 50 mm deep panel would
  otherwise drift by 18 µm over an aisle depth).
- Drawings and exports must match the document within 1 mm; today the worst measured
  difference is 0.64 µm.

**Evidence.** `test/geometry/exact.test.ts` (100 m × 100 m, with the naive formula shown to
fail), `test/render-svg/plan.test.ts` (sizes read back from the SVG), `test/layout/rotation.test.ts`.
