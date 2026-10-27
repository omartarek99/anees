import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Mats } from './parts';

// The magic around the two big prizes, the ring of power and the unbeatable shield: a turning circle of runes behind them,
// sparks that circle them, a laurel wreath for the shield, and a ring of energy that bursts out whenever you tap them.

type NumRef = MutableRefObject<number | null>;
const additive = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false } as const;

/** Two counter-turning rings of runes, a triangle and a hexagram, facing the viewer. About 4 across. */
export function MagicCircle({ color = '#8fd0ff', accent = '#ffe08a', still = false }: { color?: string; accent?: string; still?: boolean }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const star = useRef<THREE.Group>(null);
  const runes = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2;
        return { x: Math.cos(a) * 1.72, y: Math.sin(a) * 1.72, a, big: i % 3 === 0 };
      }),
    []
  );
  useFrame(({ clock }) => {
    const t = still ? 0 : clock.elapsedTime;
    if (outer.current) outer.current.rotation.z = t * 0.35;
    if (inner.current) inner.current.rotation.z = -t * 0.6;
    if (star.current) star.current.rotation.z = t * 0.9;
  });
  return (
    <group>
      <group ref={outer}>
        <mesh>
          <torusGeometry args={[1.95, 0.04, 8, 96]} />
          <meshBasicMaterial color={color} opacity={0.85} {...additive} />
        </mesh>
        <mesh>
          <torusGeometry args={[1.5, 0.03, 8, 96]} />
          <meshBasicMaterial color={color} opacity={0.6} {...additive} />
        </mesh>
        {runes.map((r, i) => (
          <mesh key={i} position={[r.x, r.y, 0]} rotation={[0, 0, r.a]}>
            <boxGeometry args={[r.big ? 0.22 : 0.1, r.big ? 0.05 : 0.03, 0.01]} />
            <meshBasicMaterial color={r.big ? accent : color} opacity={0.9} {...additive} />
          </mesh>
        ))}
      </group>
      <group ref={inner}>
        <mesh>
          <ringGeometry args={[1.24, 1.27, 3]} />
          <meshBasicMaterial color={accent} opacity={0.75} side={THREE.DoubleSide} {...additive} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI]}>
          <ringGeometry args={[1.24, 1.27, 3]} />
          <meshBasicMaterial color={accent} opacity={0.75} side={THREE.DoubleSide} {...additive} />
        </mesh>
      </group>
      <group ref={star}>
        <mesh>
          <ringGeometry args={[0.8, 0.82, 5]} />
          <meshBasicMaterial color={color} opacity={0.7} side={THREE.DoubleSide} {...additive} />
        </mesh>
      </group>
    </group>
  );
}

/** Sparks circling around the middle on tilted loops: `radius` is the size of the loop. */
export function Orbiters({ count = 8, radius = 1.3, color = '#bfe6ff', still = false }: { count?: number; radius?: number; color?: string; still?: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = still ? 0 : clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const a = t * (0.9 + (i % 3) * 0.25) + (i / count) * Math.PI * 2;
      const tilt = (i % 4) * 0.5;
      g.position.set(Math.cos(a) * radius, Math.sin(a * 1.0 + tilt) * radius * 0.45, Math.sin(a) * radius * 0.55);
      g.scale.setScalar(0.7 + Math.sin(t * 5 + i) * 0.3);
    });
  });
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)}>
          <mesh>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshBasicMaterial color={color} opacity={0.35} {...additive} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A laurel wreath: two curved branches of gold leaves meeting at the bottom, around a circle of radius `radius`. */
export function Laurel({ mats, radius = 1.45 }: { mats: Mats; radius?: number }) {
  const leaves = useMemo(() => {
    const out: { x: number; y: number; rot: number; s: number; berry: boolean }[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 13; i++) {
        const f = i / 12;
        // from the bottom, up each side, to about 70 degrees from the top
        const a = Math.PI * 1.5 + side * (0.15 + f * 2.1);
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        out.push({ x, y, rot: a + (side < 0 ? 0.5 : -0.5), s: 1 - f * 0.25, berry: false });
        out.push({ x: x * 0.93, y: y * 0.93, rot: a - (side < 0 ? 0.6 : -0.6), s: 0.85 * (1 - f * 0.25), berry: i % 4 === 2 });
      }
    }
    return out;
  }, [radius]);
  return (
    <group>
      {leaves.map((l, i) => (
        <mesh key={i} position={[l.x, l.y, 0]} rotation={[0, 0, l.rot]} scale={[l.s * 0.34, l.s * 0.11, 0.05]} material={l.berry ? mats.gem : mats.goldBright}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      ))}
      <mesh position={[0, -radius - 0.05, 0.02]} material={mats.goldBright}>
        <sphereGeometry args={[0.12, 14, 14]} />
      </mesh>
    </group>
  );
}

/** A ring of energy that bursts outward and fades, once `at` is set to the moment of the tap. */
export function EnergyPulse({ at, color = '#9fdcff', size = 3.2, still = false }: { at: NumRef; color?: string; size?: number; still?: boolean }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const start = at.current;
    const tau = start === null || still ? -1 : clock.elapsedTime - start;
    [a.current, b.current].forEach((m, i) => {
      if (!m) return;
      const k = tau - i * 0.18;
      m.visible = k > 0 && k < 1.1;
      if (!m.visible) return;
      m.scale.setScalar(0.3 + k * size);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k / 1.1) * 0.9;
    });
  });
  return (
    <group>
      {[0, 1].map((i) => (
        <mesh key={i} ref={i === 0 ? a : b} visible={false}>
          <torusGeometry args={[1, 0.035, 8, 80]} />
          <meshBasicMaterial color={color} opacity={0} {...additive} />
        </mesh>
      ))}
    </group>
  );
}
