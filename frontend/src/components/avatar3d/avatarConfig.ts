// WebGL capability checks for the 3D scenes (map, map riddle, story art). No three.js import here -- this file is loaded eagerly.

// Browsers cap live WebGL contexts (~8-16 per page; the oldest is silently killed past that),
// so 3D scenes are only ever drawn in one or two places at a time and the probe context
// used here is released straight away. Cached: it never changes during a page's life.
let webglSupported: boolean | undefined;
export function canUseWebGL(): boolean {
  if (webglSupported === undefined) {
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
      webglSupported = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webglSupported = false;
    }
  }
  return webglSupported;
}

// Cheap hint for phones / low-end laptops: fewer pixels and a smaller shadow map.
export function isLowPower(): boolean {
  const cores = navigator.hardwareConcurrency ?? 8;
  return cores <= 4 || window.matchMedia('(max-width: 640px)').matches;
}
