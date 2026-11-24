// How heavy the landing page's moving parts may be on this device (the particle form, the helix's pixel ratio):
// 'off' when the browser draws WebGL in software (no usable GPU: SwiftShader, llvmpipe, Microsoft Basic Render -- a full-screen particle
// field there runs at about one frame a second) or the person asked to save data; 'lite' on phones and on computers with 4 cores or fewer or
// 4 GB of memory or less; 'full' otherwise. Worked out once per page load. Development only: ?pf=full|lite|off forces one (performance tests).
type DeviceTier = 'full' | 'lite' | 'off';

let cached: DeviceTier | null = null;

export function deviceTier(phone = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches): DeviceTier {
  if (cached) return cached;
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('pf') : null;
  if (forced === 'full' || forced === 'lite' || forced === 'off') return (cached = forced);
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return (cached = 'off');
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
  if (!gl) return (cached = 'off');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return (cached = 'off');
  return (cached = phone || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 ? 'lite' : 'full');
}
