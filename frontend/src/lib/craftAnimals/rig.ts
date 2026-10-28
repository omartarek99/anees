import * as THREE from 'three';

// Limb / wing / tail animation done in the vertex shader, so an animal stays ONE mesh.
//
// Every vertex carries two extra attributes written by model.ts:
//   aJ = (channel, axis, amplitude, phase)   channel 0 = rigid (not animated)
//   aP = (pivot x, pivot y, pivot z, rest angle)
// and a Mesh sets two per-animal uniforms just before it draws (onBeforeRender), which is why one
// material can be shared by every animal of a species:
//   uPh = (walk phase, flap phase, idle phase, tail phase)   radians, advanced by the AI
//   uK  = (walk gain, flap gain, graze 0..1, hurt flash 0..1)

export interface RigUniforms {
  uPh: { value: THREE.Vector4 };
  uK: { value: THREE.Vector4 };
}

/** Per-animal animation state: the AI writes it, the shader reads it (these ARE the material's uniform vectors). */
export interface Pose {
  readonly ph: THREE.Vector4;
  readonly k: THREE.Vector4;
}

const VS_COMMON = /* glsl */ `
#include <common>
attribute vec4 aJ;
attribute vec4 aP;
uniform vec4 uPh;
uniform vec4 uK;
float jointAngle() {
  float c = aJ.x;
  float v = 1.0;
  float gain = 1.0;
  if (c < 1.5) { v = sin(uPh.x + aJ.w); gain = uK.x; }
  else if (c < 2.5) { v = sin(uPh.y + aJ.w); gain = uK.y; }
  else if (c < 3.5) { v = sin(uPh.z + aJ.w); }
  else if (c < 4.5) { v = sin(uPh.w + aJ.w); }
  else { gain = uK.z; }
  return mix(aP.w, aJ.z * v, gain);
}
vec3 rotJoint(vec3 p, float a) {
  float s = sin(a);
  float c = cos(a);
  if (aJ.y < 0.5) return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  if (aJ.y < 1.5) return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
  return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}
`;

/** One material per ANIMAL (cheap: the compiled program and the texture are shared), because a material's uniforms are only
 *  uploaded when the material changes - so animals that differ in pose cannot share one. */
export function createRigMaterial(map: THREE.Texture, glow = 0): { material: THREE.MeshLambertMaterial; pose: Pose } {
  const uniforms: RigUniforms = { uPh: { value: new THREE.Vector4(0, 0, 0, 0) }, uK: { value: new THREE.Vector4(0, 0, 0, 0) } };
  const material = new THREE.MeshLambertMaterial({
    map,
    alphaTest: 0.5,
    ...(glow > 0 ? { emissive: new THREE.Color(0xffffff), emissiveMap: map, emissiveIntensity: glow } : {}),
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPh = uniforms.uPh;
    shader.uniforms.uK = uniforms.uK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VS_COMMON)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (aJ.x > 0.5) objectNormal = rotJoint(objectNormal, jointAngle());')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (aJ.x > 0.5) transformed = aP.xyz + rotJoint(transformed - aP.xyz, jointAngle());');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uK;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vec3(1.0, 0.2, 0.2), uK.w * 0.55);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'animal-rig';
  return { material, pose: { ph: uniforms.uPh.value, k: uniforms.uK.value } };
}
