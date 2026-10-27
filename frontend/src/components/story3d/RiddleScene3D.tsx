import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { easeOutBack, easeOutCubic, flash, lerp, seg } from './anim';
import { Burst, Chest3D, Env, Glow, LightCone, useMats, type Mats } from './parts';
import { Lights, Turntable, CameraLook } from './StoryScene3D';
import { paperBump, riddleMapTexture, stripeTexture, textTexture, woodTextures } from './textures';

// The riddle map in 3D: an old parchment map unrolls on a wooden desk, a number is written on a plank at each of its four places
// (a mountain, a harbour, a souq tent, a palm oasis) and the answer to the maths problem is the one to tap. A wrong tap makes the
// place shake and flash red; the right one lights it gold, lays a dotted red road to it, marks the X and opens a little chest.
// A falcon flies over the map, a candle flickers, a brass compass swings: all of it is for looking at, drag to turn the desk.

export type Way = 'n' | 'e' | 's' | 'w';

const MAP_W = 7.2;
const MAP_D = 5.8;
const PLACE: Record<Way, { x: number; z: number; order: number }> = {
  n: { x: 0, z: -2.0, order: 0 },
  e: { x: 2.7, z: 0, order: 1 },
  s: { x: 0, z: 2.0, order: 2 },
  w: { x: -2.7, z: 0, order: 3 },
};
const WAYS: Way[] = ['n', 'e', 's', 'w'];

interface Props {
  roads: Record<Way, string>;
  names: Record<Way, string>;
  answer: Way;
  solved: boolean;
  wrongWay: Way | null;
  wrongTick: number;
  onPick: (w: Way) => void;
  still?: boolean;
}

const tt = (still: boolean, clock: THREE.Clock) => (still ? 99 : clock.elapsedTime);

/** A small plank on a post, with the number written on it, and the place's name floating above. */
function Signs({ value, name }: { value: string; name: string }) {
  const num = useMemo(() => textTexture(value, 256, 112, '800 76px Arial, sans-serif', '#fdf3d2', { stroke: '#2a1808' }), [value]);
  const label = useMemo(() => textTexture(name, 512, 128, '800 70px Arial, "Segoe UI", sans-serif', '#ffffff', { stroke: '#2b1a08' }), [name]);
  const wood = useMemo(() => woodTextures(13, '#7a4a20', [1, 1]), []);
  return (
    <>
      <group position={[0, 0, 1.2]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.045, 0.06, 0.45, 8]} />
          <meshStandardMaterial map={wood.map} roughness={0.85} />
        </mesh>
        <RoundedBox args={[1.15, 0.5, 0.08]} radius={0.04} smoothness={3} position={[0, 0.55, 0]}>
          <meshStandardMaterial map={wood.map} bumpMap={wood.bump} bumpScale={1.2} roughness={0.8} />
        </RoundedBox>
        <mesh position={[0, 0.55, 0.045]}>
          <planeGeometry args={[1.05, 0.46]} />
          <meshBasicMaterial map={num} transparent />
        </mesh>
      </group>
      <sprite position={[0, 2.15, 0]} scale={[2.3, 0.575, 1]}>
        <spriteMaterial map={label} transparent depthWrite={false} />
      </sprite>
    </>
  );
}

function Mountain() {
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d9099', roughness: 0.9, flatShading: true }), []);
  const snow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f6f8fb', roughness: 0.6, flatShading: true }), []);
  return (
    <group>
      <mesh position={[0, 0.7, 0]} material={stone}>
        <coneGeometry args={[0.8, 1.45, 6]} />
      </mesh>
      <mesh position={[0, 1.25, 0]} material={snow}>
        <coneGeometry args={[0.31, 0.55, 6]} />
      </mesh>
      <mesh position={[-0.62, 0.45, 0.2]} material={stone}>
        <coneGeometry args={[0.52, 0.95, 5]} />
      </mesh>
      <mesh position={[-0.62, 0.78, 0.2]} material={snow}>
        <coneGeometry args={[0.18, 0.3, 5]} />
      </mesh>
      <mesh position={[0.6, 0.32, 0.25]} material={stone}>
        <coneGeometry args={[0.4, 0.7, 5]} />
      </mesh>
    </group>
  );
}

/** A little harbour: the water ripples, a dhow rocks on it and a pearl floats. */
function Sea({ still }: { still: boolean }) {
  const water = useRef<THREE.Mesh>(null);
  const boat = useRef<THREE.Group>(null);
  const pearl = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.9, 1.9, 22, 22);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const sail = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.55, 0);
    s.lineTo(0, 0.85);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  useFrame(({ clock }) => {
    const t = tt(still, clock);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, Math.sin(x * 3.2 + t * 2) * 0.035 + Math.sin(z * 4 - t * 1.6) * 0.03);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    if (boat.current) {
      boat.current.position.y = 0.1 + Math.sin(t * 1.8) * 0.04;
      boat.current.rotation.z = Math.sin(t * 1.4) * 0.08;
      boat.current.rotation.x = Math.sin(t * 1.1) * 0.05;
    }
    if (pearl.current) pearl.current.position.y = 0.3 + Math.sin(t * 2.2) * 0.06;
  });
  return (
    <group>
      {/* the stone quay */}
      <RoundedBox args={[2.2, 0.16, 2.2]} radius={0.05} smoothness={3} position={[0, 0.0, 0]}>
        <meshStandardMaterial color="#b9a98f" roughness={0.9} />
      </RoundedBox>
      <mesh ref={water} geometry={geo} position={[0, 0.1, 0]}>
        <meshStandardMaterial color="#2a7fc4" roughness={0.12} metalness={0.2} transparent opacity={0.93} />
      </mesh>
      <group ref={boat} position={[-0.2, 0.1, 0.1]}>
        <RoundedBox args={[0.8, 0.16, 0.28]} radius={0.06} smoothness={3} position={[0, 0.05, 0]}>
          <meshStandardMaterial color="#7a4a20" roughness={0.8} />
        </RoundedBox>
        <mesh position={[0.46, 0.1, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.14, 0.22, 8]} />
          <meshStandardMaterial color="#7a4a20" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
          <meshStandardMaterial color="#4d2d12" />
        </mesh>
        <mesh geometry={sail} position={[-0.25, 0.2, 0]} scale={[1, 1, 1]}>
          <meshStandardMaterial color="#f4ead2" side={THREE.DoubleSide} roughness={0.9} />
        </mesh>
      </group>
      <mesh ref={pearl} position={[0.5, 0.3, -0.4]}>
        <sphereGeometry args={[0.2, 24, 24]} />
        <meshStandardMaterial color="#fbf7ee" roughness={0.1} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** A souq tent in red and cream stripes, with a flag that flutters. */
function Tent({ still }: { still: boolean }) {
  const stripes = useMemo(() => stripeTexture(), []);
  const flag = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(tt(still, clock) * 5) * 0.35;
  });
  return (
    <group>
      <mesh position={[0, 0.6, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.95, 1.2, 4]} />
        <meshStandardMaterial map={stripes} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.17, 0.5]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.36, 0.34, 0.04]} />
        <meshStandardMaterial color="#2a1808" roughness={1} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.5, 6]} />
        <meshStandardMaterial color="#4d2d12" />
      </mesh>
      <mesh ref={flag} position={[0.14, 1.58, 0]}>
        <planeGeometry args={[0.28, 0.17]} />
        <meshStandardMaterial color="#c0392b" side={THREE.DoubleSide} />
      </mesh>
      {[[-0.75, 0.12, 0.5], [0.8, 0.1, 0.4]].map(([x, y, z], i) => (
        <RoundedBox key={i} args={[0.25, 0.22, 0.25]} radius={0.03} smoothness={2} position={[x, y, z]}>
          <meshStandardMaterial color="#8a5a2b" roughness={0.9} />
        </RoundedBox>
      ))}
    </group>
  );
}

/** A palm tree beside a pond, swaying. */
function Oasis({ still }: { still: boolean }) {
  const top = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = tt(still, clock);
    if (top.current) {
      top.current.rotation.z = Math.sin(t * 1.3) * 0.04;
      top.current.children.forEach((c, i) => (c.rotation.x = Math.sin(t * 1.8 + i) * 0.06));
    }
  });
  return (
    <group>
      <mesh position={[0.3, 0.03, 0.2]}>
        <cylinderGeometry args={[0.65, 0.65, 0.07, 40]} />
        <meshStandardMaterial color="#3a8fd0" roughness={0.1} metalness={0.15} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <mesh key={i} position={[0.3 + Math.cos(i) * 0.68, 0.06, 0.2 + Math.sin(i) * 0.68]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color="#9a8f78" roughness={1} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.03, 0.15 + i * 0.23, 0]} rotation={[0, 0, -0.06 - i * 0.015]}>
          <cylinderGeometry args={[0.07 - i * 0.004, 0.085 - i * 0.004, 0.26, 8]} />
          <meshStandardMaterial color="#8a5a2b" roughness={0.9} />
        </mesh>
      ))}
      <group ref={top} position={[-0.1, 1.5, 0]}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <group key={i} rotation={[0, (i / 7) * Math.PI * 2, 0]}>
            <mesh position={[0.4, -0.12, 0]} rotation={[0, 0, -1.15]} scale={[1, 1, 0.35]}>
              <coneGeometry args={[0.15, 1.0, 6]} />
              <meshStandardMaterial color={i % 2 ? '#2f8f4a' : '#3da35a'} roughness={0.8} />
            </mesh>
          </group>
        ))}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.1, -0.1, Math.sin(i * 2.1) * 0.1]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshStandardMaterial color="#6b4423" roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** One of the four places: a round plinth, its model, a plank with the number and a name; it reacts to the pointer and to answers. */
function Place3D({ way, props, mats, still }: { way: Way; props: Props; mats: Mats; still: boolean }) {
  void mats;
  const { x, z, order } = PLACE[way];
  const g = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const hover = useRef(false);
  const shakeAt = useRef(-99);
  const lastTick = useRef(0);
  const y = useRef(0);
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    []
  );
  useFrame(({ clock }) => {
    const t = tt(still, clock);
    const isWrong = props.wrongWay === way;
    if (isWrong && props.wrongTick !== lastTick.current) {
      lastTick.current = props.wrongTick;
      shakeAt.current = t;
    }
    const sh = t - shakeAt.current;
    const shake = sh >= 0 && sh < 0.5 ? Math.sin(sh * 45) * 0.1 * (1 - sh / 0.5) : 0;
    const isAnswer = props.solved && props.answer === way;
    const appear = easeOutBack(seg(t, 1.0 + order * 0.16, 1.55 + order * 0.16));
    const target = (hover.current && !props.solved ? 0.2 : 0) + (isAnswer ? 0.18 + Math.sin(t * 3) * 0.05 : 0);
    y.current = lerp(y.current, target, 0.15);
    if (g.current) {
      g.current.position.set(x + shake, y.current, z);
      g.current.scale.setScalar(Math.max(0.001, appear) * (hover.current && !props.solved ? 1.05 : 1) * (props.solved && !isAnswer ? 0.93 : 1));
    }
    if (halo.current) {
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      const wrongFlash = isWrong ? flash(sh, 0, 0.6) : 0;
      mat.color.set(isAnswer ? '#ffd36a' : wrongFlash > 0 ? '#ff4a3a' : '#fff1c9');
      mat.opacity = isAnswer ? 0.9 : wrongFlash > 0 ? wrongFlash * 0.9 : hover.current ? 0.55 : 0.18;
      halo.current.scale.setScalar(isAnswer ? 1 + Math.sin(t * 4) * 0.05 : 1);
    }
  });
  const KIND = { n: <Mountain />, e: <Sea still={still} />, s: <Tent still={still} />, w: <Oasis still={still} /> } as const;
  return (
    <group
      ref={g}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hover.current = true;
        if (!props.solved) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hover.current = false;
        document.body.style.cursor = '';
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta < 6 && !props.solved) props.onPick(way);
      }}
    >
      <mesh ref={halo} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.3, 48]} />
        <meshBasicMaterial color="#fff1c9" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[1.08, 1.12, 0.08, 48]} />
        <meshStandardMaterial color="#e6d3a3" roughness={0.9} />
      </mesh>
      <group position={[0, 0.08, 0]}>{KIND[way]}</group>
      <Signs value={props.roads[way]} name={props.names[way]} />
    </group>
  );
}

/** A brass compass whose needle swings. */
function Compass({ still }: { still: boolean }) {
  const needle = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (needle.current) needle.current.rotation.y = Math.sin(tt(still, clock) * 1.1) * 0.9 + Math.sin(tt(still, clock) * 3.1) * 0.12;
  });
  return (
    <group position={[3.0, 0.06, 2.25]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.42, 0.45, 0.12, 40]} />
        <meshStandardMaterial color="#b9801a" metalness={1} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.02, 40]} />
        <meshStandardMaterial color="#f6eed6" roughness={0.6} />
      </mesh>
      <group ref={needle} position={[0, 0.16, 0]}>
        <mesh position={[0, 0, -0.14]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.04, 0.3, 4]} />
          <meshStandardMaterial color="#c0392b" />
        </mesh>
        <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.04, 0.3, 4]} />
          <meshStandardMaterial color="#eeeeee" />
        </mesh>
      </group>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.01, 40]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.12} roughness={0} clearcoat={1} />
      </mesh>
    </group>
  );
}

/** A falcon crossing over the map in a wide loop, its shadow sliding over the parchment. */
function Falcon({ still }: { still: boolean }) {
  const g = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Mesh>(null);
  const wingR = useRef<THREE.Mesh>(null);
  const wing = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.85, 0.12);
    s.lineTo(0.5, -0.3);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  useFrame(({ clock }) => {
    const t = tt(still, clock);
    const a = t * 0.5 + 1;
    const rx = 3.6;
    const rz = 2.6;
    if (g.current) {
      g.current.position.set(Math.cos(a) * rx, 2.3 + Math.sin(t * 1.2) * 0.15, Math.sin(a) * rz);
      g.current.rotation.set(0, Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz), Math.sin(a) * 0.12);
    }
    const flap = Math.sin(t * 9) * 0.6 + 0.15;
    if (wingL.current) wingL.current.rotation.set(Math.PI / 2, 0, flap);
    if (wingR.current) wingR.current.rotation.set(Math.PI / 2, Math.PI, -flap);
  });
  return (
    <group ref={g}>
      <mesh castShadow scale={[0.17, 0.13, 0.42]}>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color="#5a3d22" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 0.4]} scale={[0.1, 0.1, 0.12]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#f1e6d0" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0, -0.5]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.16, 0.02, 0.34]} />
        <meshStandardMaterial color="#3f2a16" />
      </mesh>
      <mesh ref={wingL} geometry={wing} castShadow position={[0.1, 0.02, 0.05]}>
        <meshStandardMaterial color="#4d3219" side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wingR} geometry={wing} castShadow position={[-0.1, 0.02, 0.05]}>
        <meshStandardMaterial color="#4d3219" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** A candle: its flame flickers and lights the map warmly. */
function Candle({ still }: { still: boolean }) {
  const flame = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = tt(still, clock);
    const f = 1 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.1;
    if (flame.current) {
      flame.current.scale.set(0.5 * f, 0.7 * f, 1);
      (flame.current.material as THREE.SpriteMaterial).opacity = 0.9;
    }
    if (light.current) light.current.intensity = 5 * f;
  });
  const map = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 40, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,250,210,1)');
    g.addColorStop(0.3, 'rgba(255,190,70,0.9)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <group position={[-3.35, 0, -2.45]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.13, 0.14, 0.6, 20]} />
        <meshStandardMaterial color="#f3e6c8" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.3, 0.32, 0.06, 28]} />
        <meshStandardMaterial color="#b9801a" metalness={1} roughness={0.35} />
      </mesh>
      <sprite ref={flame} position={[0, 0.78, 0]}>
        <spriteMaterial map={map} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </sprite>
      <pointLight ref={light} position={[0, 0.9, 0.2]} color="#ffb45a" distance={5.5} intensity={5} />
    </group>
  );
}

/** The map sheet and its two scroll rods: it unrolls when the scene opens. */
function MapSheet({ tex, bump, still }: { tex: THREE.Texture; bump: THREE.Texture; still: boolean }) {
  const sheet = useRef<THREE.Mesh>(null);
  const rodL = useRef<THREE.Group>(null);
  const rodR = useRef<THREE.Group>(null);
  const rodMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a4a20', roughness: 0.7 }), []);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f0b429', metalness: 1, roughness: 0.3 }), []);
  useFrame(({ clock }) => {
    const t = tt(still, clock);
    const u = easeOutCubic(seg(t, 0.15, 1.25));
    const w = lerp(0.03, 1, u);
    if (sheet.current) sheet.current.scale.x = w;
    const edge = (MAP_W / 2) * w + 0.1;
    if (rodL.current) {
      rodL.current.position.x = -edge;
      rodL.current.rotation.z = u * 9;
    }
    if (rodR.current) {
      rodR.current.position.x = edge;
      rodR.current.rotation.z = -u * 9;
    }
  });
  const rod = (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={rodMat}>
        <cylinderGeometry args={[0.16, 0.16, MAP_D + 0.3, 20]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0, s * (MAP_D / 2 + 0.22)]} material={gold}>
          <sphereGeometry args={[0.2, 16, 16]} />
        </mesh>
      ))}
    </>
  );
  return (
    <group position={[0, 0.02, 0]}>
      <mesh ref={sheet} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[MAP_W, MAP_D, 1, 1]} />
        <meshStandardMaterial map={tex} bumpMap={bump} bumpScale={1.2} transparent alphaTest={0.4} side={THREE.DoubleSide} roughness={0.92} />
      </mesh>
      <group ref={rodL} position={[0, 0.12, 0]}>
        {rod}
      </group>
      <group ref={rodR} position={[0, 0.12, 0]}>
        {rod}
      </group>
    </group>
  );
}

/** What happens when the riddle is solved: a dotted red road to the place, the X, a little chest, a beam of light and confetti. */
function SolvedFx({ answer, solved, mats, still }: { answer: Way; solved: boolean; mats: Mats; still: boolean }) {
  const clock = useThree((s) => s.clock);
  const at = useRef<number | null>(null);
  const burstAt = useRef<number | null>(null);
  const dashes = useRef<(THREE.Mesh | null)[]>([]);
  const xMark = useRef<THREE.Group>(null);
  const chest = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const cone = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const target = PLACE[answer];
  const curve = useMemo(() => {
    const a = new THREE.Vector3(0, 0.09, 0);
    const b = new THREE.Vector3(target.x * 0.86, 0.09, target.z * 0.86);
    const c = new THREE.Vector3(target.x * 0.4 - target.z * 0.25, 0.09, target.z * 0.4 + target.x * 0.25);
    return new THREE.QuadraticBezierCurve3(a, c, b);
  }, [target.x, target.z]);
  const N = 18;
  useEffect(() => {
    at.current = solved ? (still ? -9 : clock.elapsedTime) : null;
    burstAt.current = at.current === null ? null : at.current + 0.2;
  }, [solved, clock, still]);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpT = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock: c }) => {
    const t = tt(still, c);
    const u = at.current === null ? -1 : t - at.current;
    dashes.current.forEach((m, i) => {
      if (!m) return;
      const k = seg(u, i * 0.07, i * 0.07 + 0.25);
      m.visible = k > 0;
      curve.getPoint((i + 0.5) / N, tmpP);
      curve.getTangent((i + 0.5) / N, tmpT);
      m.position.set(tmpP.x, tmpP.y + 0.02, tmpP.z);
      m.rotation.y = Math.atan2(tmpT.x, tmpT.z);
      m.scale.setScalar(Math.max(0.001, easeOutBack(k)));
    });
    const xs = easeOutBack(seg(u, 1.1, 1.6));
    if (xMark.current) {
      xMark.current.visible = u > 1.1;
      xMark.current.scale.setScalar(Math.max(0.001, xs));
    }
    if (chest.current) {
      chest.current.visible = u > 1.4;
      chest.current.scale.setScalar(Math.max(0.001, easeOutBack(seg(u, 1.4, 1.9))) * 0.3);
    }
    if (lid.current) lid.current.rotation.x = -easeOutBack(seg(u, 1.9, 2.5)) * 1.95;
    if (cone.current) {
      cone.current.visible = u > 1.9;
      (cone.current.material as THREE.MeshBasicMaterial).opacity = seg(u, 1.9, 2.6) * (0.3 + Math.sin(t * 3.5) * 0.05);
    }
    if (glow.current) {
      glow.current.scale.setScalar(lerp(0.5, 3.2, seg(u, 0, 0.8)));
      (glow.current.material as THREE.SpriteMaterial).opacity = u < 0 ? 0 : Math.max(0, 1 - u / 2.4) * 0.8;
    }
  });
  const bx = target.x * 0.86 + 0.95;
  const bz = target.z * 0.86 - 0.95;
  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i} ref={(m) => (dashes.current[i] = m)} visible={false}>
          <boxGeometry args={[0.1, 0.04, 0.2]} />
          <meshStandardMaterial color="#c0392b" emissive="#8a1010" emissiveIntensity={0.7} roughness={0.5} />
        </mesh>
      ))}
      <group ref={xMark} position={[bx, 0.1, bz]} visible={false}>
        {[Math.PI / 4, -Math.PI / 4].map((r, i) => (
          <mesh key={i} rotation={[0, r, 0]}>
            <boxGeometry args={[0.8, 0.06, 0.16]} />
            <meshStandardMaterial color="#c0392b" emissive="#8a1010" emissiveIntensity={0.8} roughness={0.5} />
          </mesh>
        ))}
      </group>
      <group ref={chest} position={[bx, 0.1, bz - 0.55]} visible={false}>
        <Chest3D mats={mats} lidRef={lid} locks="ring" />
      </group>
      <LightCone ref={cone} position={[target.x, 2.4, target.z]} />
      <Glow ref={glow} position={[target.x, 0.6, target.z]} />
      <Burst at={burstAt} origin={[target.x, 0.8, target.z]} mats={mats} still={still} count={40} />
    </>
  );
}

export default function RiddleScene3D(props: Props) {
  const mats = useMats();
  const still = !!props.still;
  const W = 1152;
  const H = Math.round((W * MAP_D) / MAP_W);
  const { tex, bump, desk } = useMemo(() => {
    const px = (X: number) => (X / MAP_W + 0.5) * W;
    const pz = (Z: number) => (Z / MAP_D + 0.5) * H;
    const ends = WAYS.map((w) => ({ x: px(PLACE[w].x), y: pz(PLACE[w].z) }));
    const wood = woodTextures(9, '#4a2c14', [6, 4]);
    return { tex: riddleMapTexture(W, H, { x: px(0), y: pz(0) }, ends), bump: paperBump(W, H, 21), desk: wood };
  }, [H]);
  return (
    <div className="riddle-3d">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 8.6, 8.2], fov: 34, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Env intensity={0.4} />
        <Lights />
        <CameraLook at={[0, 0.4, 0.5]} />
        <Turntable still={still}>
          {/* the desk */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
            <planeGeometry args={[18, 14]} />
            <meshStandardMaterial map={desk.map} bumpMap={desk.bump} bumpScale={1.5} roughness={0.75} />
          </mesh>
          <MapSheet tex={tex} bump={bump} still={still} />
          {WAYS.map((w) => (
            <Place3D key={w} way={w} props={props} mats={mats} still={still} />
          ))}
          <Compass still={still} />
          <Candle still={still} />
          <Falcon still={still} />
          <SolvedFx answer={props.answer} solved={props.solved} mats={mats} still={still} />
          <Sparkles count={26} scale={[7, 2.5, 5]} position={[0, 1.4, 0]} size={4} speed={0.4} color="#ffeaa8" />
        </Turntable>
      </Canvas>
    </div>
  );
}
