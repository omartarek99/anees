import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { lerp, smoothstep } from './math';
import { ZONES } from './layout';
import { ZONE_MODULES } from './zones';

// Sky, fog and light follow the camera along the map: the desert's warm noon melts into the souq's amber, the sea's
// bright blue, the observatory's night and the mountain's clear mint. There are no shadow maps (they would double the work
// of every frame); the flat-shaded faces and the sun's fixed direction give the blocks their depth.

const BLEND = 14; // blocks either side of a zone seam over which the mood changes

interface Mood {
  sky: THREE.Color;
  fog: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  ambient: THREE.Color;
  ambientIntensity: number;
}

export function Atmosphere() {
  const scene = useThree((s) => s.scene);
  const sun = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  const moods = useMemo<Mood[]>(
    () =>
      ZONES.map((z) => {
        const a = ZONE_MODULES[z.key].atmosphere;
        return { sky: new THREE.Color(a.sky), fog: new THREE.Color(a.fog), sun: new THREE.Color(a.sun), sunIntensity: a.sunIntensity, ambient: new THREE.Color(a.ambient), ambientIntensity: a.ambientIntensity };
      }),
    []
  );

  useLayoutEffect(() => {
    scene.background = new THREE.Color(moods[0].sky);
    scene.fog = new THREE.Fog(moods[0].fog, 70, 215);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene, moods]);

  useFrame(({ controls, camera }) => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target;
    if (!target || !sun.current || !ambient.current || !hemi.current) return;
    const z = target.z;
    // which two moods to mix, and how much
    let a = moods[0];
    let b = moods[0];
    let w = 0;
    for (let i = 0; i < ZONES.length; i++) {
      const zone = ZONES[i];
      if (z < zone.z1 + BLEND) {
        if (i < ZONES.length - 1 && z > zone.z1 - BLEND) {
          a = moods[i];
          b = moods[i + 1];
          w = smoothstep(zone.z1 - BLEND, zone.z1 + BLEND, z);
        } else {
          a = b = moods[i];
        }
        break;
      }
      a = b = moods[i];
    }
    (scene.background as THREE.Color).copy(a.sky).lerp(b.sky, w);
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(a.fog).lerp(b.fog, w);
    // the haze starts further out the higher the camera is, and close by when walking on the road
    const d = camera.position.distanceTo(target);
    fog.near = Math.max(45, d * 0.9 + 20);
    fog.far = fog.near + 150;
    sun.current.color.copy(a.sun).lerp(b.sun, w);
    sun.current.intensity = lerp(a.sunIntensity, b.sunIntensity, w);
    ambient.current.color.copy(a.ambient).lerp(b.ambient, w);
    ambient.current.intensity = lerp(a.ambientIntensity, b.ambientIntensity, w);
    hemi.current.intensity = 0.35 * lerp(a.ambientIntensity, b.ambientIntensity, w);
  });

  return (
    <>
      <ambientLight ref={ambient} />
      <hemisphereLight ref={hemi} args={['#ffffff', '#6d6a7a', 0.3]} />
      <directionalLight ref={sun} position={[-24, 46, 26]} />
    </>
  );
}
