# Model contract

What a 3D model of a product must be so the app can show it at the right size and place. No real
model exists yet (Milestone 3 builds nothing that needs one); `src/model-contract` checks a file
against this contract and is tested with small boxes built in the tests.

## The file

- **Format:** one binary glTF 2.0 file (`.glb`), self-contained: every buffer is the GLB's own BIN
  chunk; no external file (`uri`) for buffers or images.
- **Name:** `<productId>__<variantId>.glb` (two underscores), for example `nhf-c__default.glb`. One
  file per product size (variant).
- **A product with an unknown size has no model.** It cannot be placed, so it is never drawn.

## Units and axes

- **Units:** metres (the glTF convention).
- **Up:** +Y.
- **Front:** +Z (the glTF convention). In the app the product's front is the plan's local +y,
  which is -Z in the 3D scene, so the app turns every model by a half turn about +Y when it places
  it. Modellers do not do this themselves.
- **Origin:** the centre of the product's footprint, on the floor: the model's lowest point is at
  y = 0, and its footprint is centred on x = 0 and z = 0.

## Size

The model's bounding box (all meshes, through their node transforms) equals the product size
within 1 mm (the project's accuracy rule):

| Model axis | Product dimension |
|---|---|
| X | width (along the front) |
| Y | height |
| Z | depth (front to back) |

## What the validator reports

`validateModel(bytes, fileName, product, variantId)` returns the size it measured, or every
problem found, each with a code and a sentence (codes in this order): `not-glb`,
`unsupported-version`, `external-resource`, `no-mesh`, `size-mismatch` (with the difference in mm),
`not-on-floor`, `not-centred`, `unknown-size`, `bad-name`. It measures from the POSITION accessors'
`min`/`max` (glTF requires them) through the node transforms; three.js's own loader measures the
same test files independently (`test/model-contract/validate.test.ts`).

## Later (not in V1)

Textures and materials, levels of detail, and photoreal rendering (headless Blender) read the same
file and this contract.
