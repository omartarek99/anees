import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundHeight } from '../ground';
import { WATER_Y, ZONE } from './cornicheLand';

// The sea: ONE flat plane with a small shader, no CPU work per frame (only `uTime` moves, and not at all for reduced motion).
// A tiny depth texture (one texel per terrain column, built from the very same ground height) tells the shader how deep the
// water is anywhere, so every landform gets its own surf: pale turquoise over the shallows and the reef, white foam at each
// waterline, rings of foam rolling in, and soft ripple lines on half-block "pixels" to match the voxel world.

const X0 = -28; // the terrain's columns: the playable strip plus its 10 blocks of margin either side
const W = 56;
const MAX_DEPTH = 4;
/** The pose a still scene shows (seconds into the animation). */
const STILL_T = 4.2;

const VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uDepth;
uniform vec4 uBox; // x0, z0, width, depth of the terrain, in blocks
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec3 uFoam;
varying vec3 vWorld;
#include <fog_pars_fragment>

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  float t = uTime;
  vec2 p = (floor(vWorld.xz * 2.0) + 0.5) * 0.5; // half-block pixels
  float depth = texture2D(uDepth, clamp((vWorld.xz - uBox.xy) / uBox.zw, 0.0, 1.0)).r * ${MAX_DEPTH.toFixed(1)};

  // turquoise over the shallows, deeper blue offshore, with a slow drift between the two
  float drift = vn(p * 0.16 + vec2(t * 0.04, t * 0.025));
  vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 2.8, depth + (drift - 0.5) * 0.9));

  // a few soft, thin ripple lines drifting across
  float r = vn(p * 0.22 + vec2(t * 0.07, t * 0.03)) * 0.7 + vn(p * 0.6 + vec2(t * 0.04, -t * 0.08)) * 0.3;
  col = mix(col, uLight, smoothstep(0.43, 0.5, abs(fract(r * 5.0) - 0.5)) * 0.4);

  // foam: one ring rolling in towards each shore, and a lapping band at every waterline
  float ring = fract(depth * 0.8 - t * 0.1 + vn(p * 0.3) * 0.5);
  col = mix(col, uFoam, smoothstep(0.88, 0.97, ring) * (1.0 - smoothstep(0.5, 1.1, depth)) * 0.55);
  float lap = 0.7 + 0.3 * sin(t * 1.5 + p.x * 1.3 + p.y * 0.9);
  col = mix(col, uFoam, (1.0 - smoothstep(0.2, 0.6, depth)) * lap * 0.9);

  // a few sunlit sparkles, one half-block each
  col = mix(col, uFoam, step(0.94, vn(p * 1.9 + vec2(t * 0.2, -t * 0.15))) * 0.6);

  // see-through over the shallows (the sand shows), more solid offshore
  gl_FragColor = vec4(col, mix(0.38, 0.78, smoothstep(0.2, 2.4, depth)));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** One byte per terrain column: how far the surface is above the floor (0 on land). */
function depthTexture() {
  const H = ZONE.z1 - ZONE.z0;
  const data = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const depth = WATER_Y - groundHeight(X0 + c + 0.5, ZONE.z0 + r + 0.5);
      data[r * W + c] = Math.round((Math.max(0, Math.min(MAX_DEPTH, depth)) / MAX_DEPTH) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; // crisp, blocky shorelines like the terrain's
  tex.minFilter = THREE.NearestFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export function Water({ still }: { still: boolean }) {
  const { geometry, material, texture } = useMemo(() => {
    const H = ZONE.z1 - ZONE.z0;
    const g = new THREE.PlaneGeometry(W, H);
    g.rotateX(-Math.PI / 2);
    const depth = depthTexture();
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    uniforms.uTime = { value: STILL_T };
    uniforms.uDepth = { value: depth };
    uniforms.uBox = { value: new THREE.Vector4(X0, ZONE.z0, W, H) };
    uniforms.uShallow = { value: new THREE.Color('#8fe6df') };
    uniforms.uDeep = { value: new THREE.Color('#2a95d6') };
    uniforms.uLight = { value: new THREE.Color('#bff1f7') };
    uniforms.uFoam = { value: new THREE.Color('#f6fdff') };
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true });
    return { geometry: g, material: m, texture: depth };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
    [geometry, material, texture]
  );
  useFrame(({ clock }) => {
    if (!still) material.uniforms.uTime.value = clock.elapsedTime;
  });
  return <mesh geometry={geometry} material={material} position={[X0 + W / 2, WATER_Y, (ZONE.z0 + ZONE.z1) / 2]} />;
}
