/**
 * Builds small binary glTF (.glb) files by hand from the glTF 2.0 spec, for the model-contract tests.
 * No library: the byte layout is written with a DataView. Test-only; the boxes belong to synthetic products.
 */

export type BoxGlbOptions = {
  /** Corner of the box with the smallest x, y, z, in metres. */
  min: [number, number, number];
  /** Corner of the box with the largest x, y, z, in metres. */
  max: [number, number, number];
  /** asset.version; default "2.0". */
  version?: string;
  /** Put a `uri` on the buffer (an external file), so the GLB is not self-contained. */
  externalBuffer?: boolean;
  /** Translation of the one node, in metres. */
  nodeTranslation?: [number, number, number];
  /** Leave out the mesh and the node: a valid glTF with nothing to draw. */
  noMesh?: boolean;
};

/** The 12 triangles of a box over 8 corners; corner i has x = bit 0, y = bit 1, z = bit 2 (0 = min, 1 = max). */
const INDICES = [
  0, 1, 3, 0, 3, 2, // z min
  4, 6, 7, 4, 7, 5, // z max
  0, 2, 6, 0, 6, 4, // x min
  1, 5, 7, 1, 7, 3, // x max
  0, 4, 5, 0, 5, 1, // y min
  2, 3, 7, 2, 7, 6, // y max
];

const pad4 = (n: number): number => (n + 3) & ~3;

/** Wraps a JSON text and a BIN payload into a GLB container. */
export function glbContainer(json: string, bin: Uint8Array, version = 2): Uint8Array {
  const jsonBytes = new TextEncoder().encode(json);
  const jsonLen = pad4(jsonBytes.length);
  const binLen = pad4(bin.length);
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, version, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.fill(0x20, 20, 20 + jsonLen); // pad with spaces
  out.set(jsonBytes, 20);
  const binStart = 20 + jsonLen;
  view.setUint32(binStart, binLen, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
  out.set(bin, binStart + 8); // padding stays zero
  return out;
}

export function boxGlb(options: BoxGlbOptions): Uint8Array {
  const { min, max } = options;
  const positionBytes = 8 * 3 * 4;
  const indexBytes = INDICES.length * 2;
  const bin = new Uint8Array(pad4(positionBytes + indexBytes));
  const view = new DataView(bin.buffer);
  for (let corner = 0; corner < 8; corner++) {
    for (let axis = 0; axis < 3; axis++) {
      const useMax = (corner >> axis) & 1;
      view.setFloat32((corner * 3 + axis) * 4, useMax ? max[axis]! : min[axis]!, true);
    }
  }
  INDICES.forEach((index, i) => view.setUint16(positionBytes + i * 2, index, true));

  const buffer: Record<string, unknown> = { byteLength: bin.length };
  if (options.externalBuffer) buffer.uri = 'box.bin';

  const gltf: Record<string, unknown> = {
    asset: { version: options.version ?? '2.0', generator: 'view-3d test' },
    scene: 0,
    scenes: [{ nodes: options.noMesh ? [] : [0] }],
    buffers: [buffer],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes, target: 34962 },
      { buffer: 0, byteOffset: positionBytes, byteLength: indexBytes, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [...min], max: [...max] },
      { bufferView: 1, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
    ],
  };
  if (!options.noMesh) {
    gltf.meshes = [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }];
    gltf.nodes = [options.nodeTranslation ? { mesh: 0, translation: [...options.nodeTranslation] } : { mesh: 0 }];
  }
  return glbContainer(JSON.stringify(gltf), bin);
}
