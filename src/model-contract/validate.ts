/**
 * Checks a product's 3D model against the model contract (docs/MODEL_CONTRACT.md): one
 * self-contained glTF 2.0 binary (.glb), metres, +Y up, front +Z, origin at the footprint centre on
 * the floor, the variant's exact size within 1 mm. It reads the GLB itself (header, JSON chunk) and
 * measures from the POSITION accessors' min/max (required by glTF) through the node transforms, so
 * it needs no 3D library and runs anywhere. Problems are returned as data, never thrown.
 */
import type { Product } from '../core/index';

export type ModelProblemCode =
  | 'not-glb'
  | 'unsupported-version'
  | 'external-resource'
  | 'no-mesh'
  | 'size-mismatch'
  | 'not-on-floor'
  | 'not-centred'
  | 'unknown-size'
  | 'bad-name';
export type ModelProblem = { code: ModelProblemCode; message: string; values?: Record<string, number> };
export type ModelSize = { widthUm: number; heightUm: number; depthUm: number };
export type ModelResult = { ok: true; sizeUm: ModelSize } | { ok: false; problems: ModelProblem[] };

const ORDER: readonly ModelProblemCode[] = ['not-glb', 'unsupported-version', 'external-resource', 'no-mesh', 'size-mismatch', 'not-on-floor', 'not-centred', 'unknown-size', 'bad-name'];
/** The model must match the product within this (um): the project's accuracy rule. */
const TOLERANCE_UM = 1000;
const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const UM_PER_M = 1_000_000;

type Mat = number[]; // 4 x 4, column-major, as glTF writes it
type Node = { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
type Gltf = {
  asset?: { version?: string };
  buffers?: { uri?: string }[];
  images?: { uri?: string }[];
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: Node[];
  meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
};

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat, b: Mat): Mat {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

function localMatrix(n: Node): Mat {
  if (n.matrix?.length === 16) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y! * y! + z! * z!)) * sx!, 2 * (x! * y! + z! * w!) * sx!, 2 * (x! * z! - y! * w!) * sx!, 0,
    2 * (x! * y! - z! * w!) * sy!, (1 - 2 * (x! * x! + z! * z!)) * sy!, 2 * (y! * z! + x! * w!) * sy!, 0,
    2 * (x! * z! + y! * w!) * sz!, 2 * (y! * z! - x! * w!) * sz!, (1 - 2 * (x! * x! + y! * y!)) * sz!, 0,
    tx!, ty!, tz!, 1,
  ];
}

const apply = (m: Mat, p: number[]): number[] => [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!);

function readJson(bytes: Uint8Array): Gltf | null {
  if (bytes.length < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + chunkLength > bytes.length) return null;
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength)));
    return typeof json === 'object' && json !== null ? (json as Gltf) : null;
  } catch {
    return null;
  }
}

/** The bounding box of every mesh of the scene, through the node transforms, metres; null without a mesh. */
function bounds(g: Gltf): { min: number[]; max: number[] } | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let any = false;
  const visit = (index: number, parent: Mat): void => {
    const node = g.nodes?.[index];
    if (node === undefined) return;
    const world = multiply(parent, localMatrix(node));
    for (const primitive of node.mesh === undefined ? [] : (g.meshes?.[node.mesh]?.primitives ?? [])) {
      const accessor = g.accessors?.[primitive.attributes?.POSITION ?? -1];
      if (accessor?.min === undefined || accessor.max === undefined) continue;
      const [lo, hi] = [accessor.min, accessor.max];
      for (const corner of [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0]! : lo[0]!, i & 2 ? hi[1]! : lo[1]!, i & 4 ? hi[2]! : lo[2]!])) {
        const p = apply(world, corner);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, p[k]!);
          max[k] = Math.max(max[k]!, p[k]!);
        }
        any = true;
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of g.scenes?.[g.scene ?? 0]?.nodes ?? []) visit(root, IDENTITY);
  return any ? { min, max } : null;
}

const mmText = (um: number): string => `${Math.round(Math.abs(um) / 100) / 10} mm`;
const signed = (um: number): string => `${um >= 0 ? '+' : '-'}${mmText(um)}`;

export function validateModel(bytes: Uint8Array, fileName: string, product: Product, variantId: string): ModelResult {
  const variant = product.variants.find((v) => v.id === variantId);
  if (variant === undefined || variant.widthUm === null || variant.heightUm === null || variant.depthUm === null) {
    return { ok: false, problems: [{ code: 'unknown-size', message: `"${product.name}" has no known size for "${variantId}", so it cannot have a model.` }] };
  }
  const problems: ModelProblem[] = [];
  const done = (sizeUm: ModelSize | null): ModelResult => {
    if (fileName !== `${product.id}__${variantId}.glb`) problems.push({ code: 'bad-name', message: `The file must be named "${product.id}__${variantId}.glb", not "${fileName}".` });
    problems.sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
    return problems.length === 0 && sizeUm !== null ? { ok: true, sizeUm } : { ok: false, problems };
  };
  const g = readJson(bytes);
  if (g === null) return { ok: false, problems: [{ code: 'not-glb', message: 'This is not a binary glTF (.glb) file.' }] };
  if (!(g.asset?.version ?? '').startsWith('2.')) {
    return { ok: false, problems: [{ code: 'unsupported-version', message: `glTF ${g.asset?.version ?? '(no version)'} is not supported; the contract needs glTF 2.0.` }] };
  }
  if ([...(g.buffers ?? []), ...(g.images ?? [])].some((x) => x.uri !== undefined)) {
    problems.push({ code: 'external-resource', message: 'The model refers to another file; everything must be inside the .glb.' });
  }
  const box = bounds(g);
  if (box === null) {
    problems.push({ code: 'no-mesh', message: 'The model has no mesh to measure.' });
    return done(null);
  }
  const um = (m: number): number => Math.round(m * UM_PER_M);
  const sizeUm = { widthUm: um(box.max[0]! - box.min[0]!), heightUm: um(box.max[1]! - box.min[1]!), depthUm: um(box.max[2]! - box.min[2]!) };
  const axes: [string, number, number][] = [
    ['width', variant.widthUm, sizeUm.widthUm],
    ['height', variant.heightUm, sizeUm.heightUm],
    ['depth', variant.depthUm, sizeUm.depthUm],
  ];
  for (const [axis, expectedUm, actualUm] of axes) {
    if (Math.abs(actualUm - expectedUm) > TOLERANCE_UM) {
      problems.push({ code: 'size-mismatch', message: `The model's ${axis} is ${signed(actualUm - expectedUm)} off the product's ${mmText(expectedUm)}.`, values: { expectedUm, actualUm } });
    }
  }
  const bottomUm = um(box.min[1]!);
  if (Math.abs(bottomUm) > TOLERANCE_UM) problems.push({ code: 'not-on-floor', message: `The model's bottom is ${mmText(bottomUm)} off the floor.`, values: { bottomUm } });
  const offUm = Math.max(Math.abs(um((box.min[0]! + box.max[0]!) / 2)), Math.abs(um((box.min[2]! + box.max[2]!) / 2)));
  if (offUm > TOLERANCE_UM) problems.push({ code: 'not-centred', message: `The model's footprint is ${mmText(offUm)} off its origin.`, values: { offUm } });
  return done(sizeUm);
}
