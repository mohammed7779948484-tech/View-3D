/** Issue M3-9: the model contract (docs/MODEL_CONTRACT.md) and its validator, on hand-built GLB files. */
import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { seedProducts } from '../../src/catalog/index';
import { validateModel } from '../../src/model-contract/index';
import { testWallShelf } from '../fixtures/products';
import { boxGlb } from './glb';

const NAME = 'test-wall-shelf__default.glb';
// The test wall shelf is 1.2 m wide (X), 2.1 m high (Y), 0.4 m deep (Z).
const GOOD = { min: [-0.6, 0, -0.2] as [number, number, number], max: [0.6, 2.1, 0.2] as [number, number, number] };

const run = (bytes: Uint8Array, fileName = NAME) => validateModel(bytes, fileName, testWallShelf, 'default');
const codes = (r: ReturnType<typeof run>): string[] => (r.ok ? [] : r.problems.map((p) => p.code));

describe('validateModel', () => {
  it('accepts a box of exactly the product size and reports its size', () => {
    const r = run(boxGlb(GOOD));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.sizeUm.widthUm - 1_200_000)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.sizeUm.heightUm - 2_100_000)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.sizeUm.depthUm - 400_000)).toBeLessThanOrEqual(1);
  });

  it('accepts a width 0.5 mm off', () => {
    expect(run(boxGlb({ min: [-0.60025, 0, -0.2], max: [0.60025, 2.1, 0.2] })).ok).toBe(true);
  });

  it('rejects a width 1.5 mm too big, naming width and the difference', () => {
    const r = run(boxGlb({ min: [-0.60075, 0, -0.2], max: [0.60075, 2.1, 0.2] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.map((p) => p.code)).toEqual(['size-mismatch']);
    const p = r.problems[0]!;
    expect(p.message.toLowerCase()).toContain('width');
    expect(p.message).toContain('+1.5 mm');
    expect(p.values?.expectedUm).toBe(1_200_000);
    expect(Math.abs((p.values?.actualUm ?? 0) - 1_201_500)).toBeLessThanOrEqual(2);
  });

  it('rejects a depth 10 mm too big', () => {
    const r = run(boxGlb({ min: [-0.6, 0, -0.205], max: [0.6, 2.1, 0.205] }));
    expect(codes(r)).toEqual(['size-mismatch']);
    if (r.ok) return;
    expect(r.problems[0]!.message.toLowerCase()).toContain('depth');
    expect(r.problems[0]!.message).toContain('+10 mm');
  });

  it('rejects a model whose bottom is 50 mm above the floor, and not as a size problem', () => {
    const r = run(boxGlb({ min: [-0.6, 0.05, -0.2], max: [0.6, 2.15, 0.2] }));
    expect(codes(r)).toEqual(['not-on-floor']);
    if (r.ok) return;
    expect(r.problems[0]!.message).toContain('50 mm');
  });

  it('counts node transforms: a node moved 100 mm sideways is not centred', () => {
    const r = run(boxGlb({ ...GOOD, nodeTranslation: [0.1, 0, 0] }));
    expect(codes(r)).toEqual(['not-centred']);
    if (r.ok) return;
    expect(r.problems[0]!.message).toContain('100 mm');
  });

  it('rejects an external buffer', () => {
    expect(codes(run(boxGlb({ ...GOOD, externalBuffer: true })))).toEqual(['external-resource']);
  });

  it('rejects glTF version 1.0', () => {
    expect(codes(run(boxGlb({ ...GOOD, version: '1.0' })))).toEqual(['unsupported-version']);
  });

  it('says not-glb, and nothing else, for bytes that are not a GLB', () => {
    expect(codes(run(new TextEncoder().encode('{}')))).toEqual(['not-glb']);
    const wrongMagic = boxGlb(GOOD).slice();
    wrongMagic[0] = 0x58; // 'X' instead of 'g'
    expect(codes(run(wrongMagic))).toEqual(['not-glb']);
    expect(codes(run(new Uint8Array(0)))).toEqual(['not-glb']);
  });

  it('rejects a glTF with no mesh', () => {
    expect(codes(run(boxGlb({ ...GOOD, noMesh: true })))).toEqual(['no-mesh']);
  });

  it('rejects a product variant with an unknown size', () => {
    const unknown = seedProducts.find((p) => p.id === 'nhf-s')!;
    const r = validateModel(boxGlb(GOOD), 'nhf-s__default.glb', unknown, 'default');
    expect(codes(r)).toEqual(['unknown-size']);
  });

  it('rejects a file name that is not <productId>__<variantId>.glb', () => {
    expect(codes(run(boxGlb(GOOD), 'shelf.glb'))).toEqual(['bad-name']);
  });

  it('returns every problem found, in code order', () => {
    const r = run(boxGlb({ min: [-0.5, 0.05, -0.2], max: [0.7, 2.15, 0.2], externalBuffer: true }), 'shelf.glb');
    // width right (1.2 m) but shifted 100 mm in x and 50 mm up
    expect(codes(r)).toEqual(['external-resource', 'not-on-floor', 'not-centred', 'bad-name']);
  });
});

describe('oracle: three.js GLTFLoader measures the same files', () => {
  const load = (bytes: Uint8Array) =>
    new Promise<Box3>((resolve, reject) => {
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      new GLTFLoader().parse(buffer, '', (gltf) => resolve(new Box3().setFromObject(gltf.scene)), reject);
    });
  const mm = (metres: number): number => metres * 1000;

  it('the exact box measures 1200 x 2100 x 400 mm, centred on the floor', async () => {
    const box = await load(boxGlb(GOOD));
    expect(mm(box.max.x - box.min.x)).toBeCloseTo(1200, 0);
    expect(mm(box.max.y - box.min.y)).toBeCloseTo(2100, 0);
    expect(mm(box.max.z - box.min.z)).toBeCloseTo(400, 0);
    expect(Math.abs(mm(box.min.y))).toBeLessThan(1);
    expect(Math.abs(mm(box.min.x + box.max.x))).toBeLessThan(1);
    expect(Math.abs(mm(box.min.z + box.max.z))).toBeLessThan(1);
  });

  it('the translated box sits 100 mm to the right', async () => {
    const box = await load(boxGlb({ ...GOOD, nodeTranslation: [0.1, 0, 0] }));
    expect(mm(box.min.x)).toBeCloseTo(-500, 0);
    expect(mm(box.max.x)).toBeCloseTo(700, 0);
    expect(mm(box.max.y - box.min.y)).toBeCloseTo(2100, 0);
  });
});
