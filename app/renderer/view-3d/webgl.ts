/** The WebGL 2 renderer's name, or null when this computer has no WebGL 2 (the app never turns on software 3D). */
export function graphicsName(): string | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (gl === null) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return name;
}
