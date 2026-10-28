import { forwardRef, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { rng } from './anim';
import { canvasTexture, giftPaperTexture, paintParchment, paperBump, scuffTexture, woodTextures } from './textures';

// The 3D objects of the story windows, built to look like real things: a chest of grained wood planks with bevelled gold bands,
// rivets and a lock; a key with an ornate bow; two halves of an old torn map on stained paper; the ring of power with prongs and a
// faceted stone that glints; and the unbeatable shield with a rim and rivets. Lit with a soft studio environment so metal reflects.

/** Woods, metals, leather: shared by every scene. */
export function useMats() {
  return useMemo(() => {
    const a = woodTextures(1, '#8a5a2b', [2, 1]);
    const b = woodTextures(7, '#7b4c22', [2, 1]);
    const lid = woodTextures(4, '#86562a', [0.7, 0.7]);
    const scuff = scuffTexture();
    const lockMat = () => new THREE.MeshStandardMaterial({ color: '#f0b429', metalness: 1, roughness: 0.3, emissive: '#fff3c9', emissiveIntensity: 0 });
    const wood = (t: ReturnType<typeof woodTextures>, tint = '#ffffff') =>
      new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.6, color: tint, roughness: 0.82, metalness: 0.02 });
    return {
      gold: new THREE.MeshStandardMaterial({ color: '#f0b429', metalness: 1, roughness: 0.42, roughnessMap: scuff }),
      goldBright: new THREE.MeshStandardMaterial({ color: '#f6bf30', metalness: 1, roughness: 0.2 }),
      goldDark: new THREE.MeshStandardMaterial({ color: '#b9801a', metalness: 0.95, roughness: 0.4, roughnessMap: scuff }),
      iron: new THREE.MeshStandardMaterial({ color: '#2c2a2e', metalness: 0.9, roughness: 0.5 }),
      woodA: wood(a),
      woodB: wood(b, '#e9d2b8'),
      woodLid: wood(lid),
      woodDark: new THREE.MeshStandardMaterial({ color: '#3b2210', roughness: 0.9, metalness: 0 }),
      lining: new THREE.MeshStandardMaterial({ color: '#8a1f30', roughness: 0.96, metalness: 0 }),
      pearl: new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.14, metalness: 0.25 }),
      pink: new THREE.MeshStandardMaterial({ color: '#d63a62', roughness: 0.4, metalness: 0.06 }),
      wrap: new THREE.MeshStandardMaterial({ map: giftPaperTexture(), roughness: 0.5, metalness: 0.05 }),
      satin: new THREE.MeshPhysicalMaterial({ color: '#f6bf30', metalness: 0.5, roughness: 0.28, sheen: 1, sheenColor: new THREE.Color('#fff3c9'), sheenRoughness: 0.4 }),
      locks: [lockMat(), lockMat(), lockMat()],
      gem: new THREE.MeshPhysicalMaterial({ color: '#d8352a', emissive: '#b01810', emissiveIntensity: 0.6, roughness: 0.06, metalness: 0.15, clearcoat: 1, flatShading: true }),
      gemBlue: new THREE.MeshPhysicalMaterial({ color: '#2f7fe0', emissive: '#1a4aa0', emissiveIntensity: 0.5, roughness: 0.06, metalness: 0.15, clearcoat: 1, flatShading: true }),
      gemGreen: new THREE.MeshPhysicalMaterial({ color: '#2fbf6a', emissive: '#157a3f', emissiveIntensity: 0.5, roughness: 0.06, metalness: 0.15, clearcoat: 1, flatShading: true }),
      star: new THREE.MeshStandardMaterial({ color: '#9a1a40', emissive: '#5c0d25', emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.25 }),
      // the lock plate flashes each time a key goes in
      lock: new THREE.MeshStandardMaterial({ color: '#f0b429', metalness: 1, roughness: 0.3, emissive: '#fff3c9', emissiveIntensity: 0 }),
    };
  }, []);
}
export type Mats = ReturnType<typeof useMats>;

/** A soft studio environment (made on the spot, no download) so metal has something to reflect. */
export function Env({ intensity = 0.55 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

/** A round glow, bright in the middle fading to nothing: used additively for light bursts and halos. */
export function useGlowTexture() {
  return useMemo(
    () =>
      canvasTexture(128, 128, (x) => {
        const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,236,170,1)');
        g.addColorStop(0.35, 'rgba(255,200,90,0.55)');
        g.addColorStop(1, 'rgba(255,190,70,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 128, 128);
      }),
    []
  );
}

/** A glowing sprite: `opacity` and `size` are set by the scene every frame through the ref. */
export const Glow = forwardRef<THREE.Sprite, { position?: [number, number, number]; color?: string }>(function Glow({ position, color = '#ffd36a' }, ref) {
  const map = useGlowTexture();
  return (
    <sprite ref={ref} position={position} renderOrder={5}>
      <spriteMaterial map={map} color={color} blending={THREE.AdditiveBlending} transparent depthWrite={false} opacity={0} />
    </sprite>
  );
});

/** Light rays turning slowly behind the treasure. */
export const Rays = forwardRef<THREE.Group, { count?: number; length?: number; width?: number }>(function Rays({ count = 14, length = 6, width = 0.34 }, ref) {
  const map = useMemo(
    () =>
      canvasTexture(16, 128, (x) => {
        const g = x.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, 'rgba(255,220,120,0)');
        g.addColorStop(0.25, 'rgba(255,220,120,0.9)');
        g.addColorStop(1, 'rgba(255,220,120,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 16, 128);
      }),
    []
  );
  return (
    <group ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} rotation={[0, 0, (i / count) * Math.PI * 2]}>
          <mesh position={[0, length / 2, 0]}>
            <planeGeometry args={[width, length]} />
            <meshBasicMaterial map={map} color="#ffcf6a" blending={THREE.AdditiveBlending} transparent depthWrite={false} opacity={0.2} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/** A golden key lying along x, centred on its middle, about 2.3 long, with an ornate bow. Turn it about y to show it off. */
export function Key3D({ mats }: { mats: Mats }) {
  return (
    <group position={[-0.5, 0, 0]}>
      {/* the bow: a ring with a clover of small rings around the hole */}
      <mesh material={mats.goldBright} position={[-0.66, 0, 0]}>
        <torusGeometry args={[0.4, 0.14, 18, 40]} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        return (
          <mesh key={i} material={mats.goldBright} position={[-0.66 + Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0]}>
            <torusGeometry args={[0.13, 0.06, 10, 20]} />
          </mesh>
        );
      })}
      {/* the shaft with collars */}
      <mesh material={mats.goldBright} position={[0.62, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.095, 0.095, 1.8, 20]} />
      </mesh>
      {[-0.1, 0.12].map((x) => (
        <mesh key={x} material={mats.goldBright} position={[x + 0.02, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.13, 0.045, 10, 24]} />
        </mesh>
      ))}
      {/* the bit */}
      <RoundedBox args={[0.22, 0.46, 0.15]} radius={0.03} smoothness={3} position={[1.22, -0.24, 0]} material={mats.goldBright} />
      <RoundedBox args={[0.18, 0.32, 0.15]} radius={0.03} smoothness={3} position={[1.5, -0.17, 0]} material={mats.goldBright} />
      <RoundedBox args={[0.14, 0.2, 0.15]} radius={0.03} smoothness={3} position={[0.98, -0.15, 0]} material={mats.goldBright} />
    </group>
  );
}

/** A semicircular prism along x (a chest lid): `r` radius, `depth` length along x. */
function lidGeometry(r: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.absarc(0, 0, r, Math.PI, 0, true);
  shape.lineTo(-r, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 28 });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** Where the three keyholes sit across the front of the chest (x). */
export const LOCK_X = [-0.72, 0, 0.72] as const;

/**
 * The treasure chest, 3 wide, 1.5 high, 1.8 deep, standing on y = 0. `lidRef` is the lid's hinge (turn it about x to open it,
 * negative opens). `locks` is what opens it: 'keys' gives three keyholes (one key in each), 'ring' a round seat for the ring of
 * power. `children` ride on the lid.
 */
export function Chest3D({ mats, lidRef, locks = 'keys', children }: { mats: Mats; lidRef: React.RefObject<THREE.Group>; locks?: 'keys' | 'ring'; children?: React.ReactNode }) {
  const lid = useMemo(() => lidGeometry(0.9, 3), []);
  const lidBand = useMemo(() => lidGeometry(0.95, 0.3), []);
  const heap = useMemo(() => {
    const r = rng(11);
    const coins = Array.from({ length: 46 }, () => ({ x: (r() - 0.5) * 2.3, z: (r() - 0.5) * 1.25, y: 1.5 + r() * 0.16, rx: r() * 0.7, ry: r() * 6, rz: r() * 0.7 }));
    const pearls = Array.from({ length: 9 }, () => ({ x: (r() - 0.5) * 2, z: (r() - 0.5) * 1.1, y: 1.62 + r() * 0.1 }));
    return { coins, pearls };
  }, []);
  return (
    <group>
      {/* the planks */}
      {[0, 1, 2].map((i) => (
        <RoundedBox key={i} args={[3, 0.5, 1.8]} radius={0.05} smoothness={3} position={[0, 0.25 + i * 0.5, 0]} material={i % 2 ? mats.woodB : mats.woodA} />
      ))}
      {/* inside: the red lining, gold coins, pearls and a few gems */}
      <mesh position={[0, 1.47, 0]} material={mats.lining}>
        <boxGeometry args={[2.7, 0.1, 1.5]} />
      </mesh>
      {heap.coins.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} rotation={[c.rx, c.ry, c.rz]} material={mats.goldBright}>
          <cylinderGeometry args={[0.19, 0.19, 0.05, 18]} />
        </mesh>
      ))}
      {heap.pearls.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} material={mats.pearl}>
          <sphereGeometry args={[0.13, 20, 20]} />
        </mesh>
      ))}
      <mesh position={[0.35, 1.68, 0.15]} material={mats.gem}>
        <octahedronGeometry args={[0.16]} />
      </mesh>
      <mesh position={[-0.5, 1.66, -0.1]} material={mats.gemBlue}>
        <octahedronGeometry args={[0.13]} />
      </mesh>
      <mesh position={[0.9, 1.64, -0.25]} material={mats.gemGreen}>
        <octahedronGeometry args={[0.12]} />
      </mesh>
      {/* gold bands with rivets, corner plates and hinges */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RoundedBox args={[0.3, 1.52, 1.86]} radius={0.04} smoothness={3} position={[s * 1.28, 0.75, 0]} material={mats.gold} />
          {[0.15, 0.55, 0.95, 1.35].map((y) =>
            [-1, 1].map((z) => (
              <mesh key={`${y}${z}`} position={[s * 1.28, y, z * 0.95]} material={mats.goldDark}>
                <sphereGeometry args={[0.055, 12, 12]} />
              </mesh>
            ))
          )}
          {[-1, 1].map((z) => (
            <RoundedBox key={z} args={[0.2, 0.34, 0.2]} radius={0.03} smoothness={2} position={[s * 1.46, 0.14, z * 0.84]} material={mats.goldDark} />
          ))}
          <mesh position={[s * 1.28, 1.5, -0.92]} rotation={[0, 0, Math.PI / 2]} material={mats.goldBright}>
            <cylinderGeometry args={[0.1, 0.1, 0.34, 16]} />
          </mesh>
        </group>
      ))}
      {locks === 'keys' ? (
        /* three keyholes, one for each key */
        LOCK_X.map((x, i) => (
          <group key={i} position={[x, 0.98, 0.93]}>
            <RoundedBox args={[0.5, 0.66, 0.12]} radius={0.04} smoothness={3} material={mats.locks[i]} />
            <mesh position={[0, 0.08, 0.07]} rotation={[Math.PI / 2, 0, 0]} material={mats.iron}>
              <cylinderGeometry args={[0.065, 0.065, 0.04, 16]} />
            </mesh>
            <mesh position={[0, -0.03, 0.07]} material={mats.iron}>
              <boxGeometry args={[0.05, 0.15, 0.04]} />
            </mesh>
            {[-1, 1].map((sx) =>
              [-1, 1].map((sy) => (
                <mesh key={`${sx}${sy}`} position={[sx * 0.19, sy * 0.26, 0.07]} material={mats.goldDark}>
                  <sphereGeometry args={[0.03, 10, 10]} />
                </mesh>
              ))
            )}
          </group>
        ))
      ) : (
        /* a round seat for the ring of power: a plate, a groove the ring sits in, and a small stone above */
        <group position={[0, 0.8, 0.93]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.lock}>
            <cylinderGeometry args={[0.52, 0.52, 0.12, 48]} />
          </mesh>
          <mesh position={[0, 0, 0.065]} material={mats.iron}>
            <circleGeometry args={[0.4, 40]} />
          </mesh>
          <mesh position={[0, 0, 0.08]} material={mats.goldDark}>
            <torusGeometry args={[0.4, 0.035, 12, 48]} />
          </mesh>
          <mesh position={[0, 0.5, 0.08]} material={mats.gem}>
            <octahedronGeometry args={[0.07]} />
          </mesh>
        </group>
      )}
      {/* the lid, hinged at the back */}
      <group ref={lidRef} position={[0, 1.5, -0.9]}>
        <mesh position={[0, 0, 0.9]} geometry={lid} material={mats.woodLid} />
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.28, 0, 0.9]} geometry={lidBand} material={mats.gold} />
        ))}
        {children}
      </group>
    </group>
  );
}

/** A cone of light opening upward from the chest: shown, fading, once it opens. `opacity` is set through the ref's material. */
export const LightCone = forwardRef<THREE.Mesh, { position?: [number, number, number] }>(function LightCone({ position = [0, 3.5, 0] }, ref) {
  const map = useMemo(
    () =>
      canvasTexture(4, 128, (x) => {
        const g = x.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, 'rgba(255,230,150,0.95)');
        g.addColorStop(1, 'rgba(255,230,150,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 4, 128);
      }),
    []
  );
  return (
    <mesh ref={ref} position={position} rotation={[Math.PI, 0, 0]} visible={false}>
      <coneGeometry args={[1.6, 4, 40, 1, true]} />
      <meshBasicMaterial map={map} color="#ffd36a" blending={THREE.AdditiveBlending} transparent depthWrite={false} opacity={0} side={THREE.DoubleSide} />
    </mesh>
  );
});

/**
 * The key-gift box: 2 x 1.5 x 2 on y = 0, wrapped in red paper with gold stars, a satin ribbon, a gold plaque with a key on the front
 * and a bow with a hanging tag on the lid. The lid (bow and tag with it) is a separate group so it can fly off. `bowRef` is the
 * bow and `tagRef` the swinging tag.
 */
export function GiftBox3D({ mats, lidRef, bowRef, tagRef }: { mats: Mats; lidRef: React.RefObject<THREE.Group>; bowRef: React.RefObject<THREE.Group>; tagRef: React.RefObject<THREE.Group> }) {
  return (
    <group>
      <RoundedBox args={[2, 1.5, 2]} radius={0.08} smoothness={4} position={[0, 0.75, 0]} material={mats.wrap} />
      {/* the satin ribbon, a little proud of the paper */}
      <RoundedBox args={[0.36, 1.52, 2.03]} radius={0.03} smoothness={3} position={[0, 0.75, 0]} material={mats.satin} />
      <RoundedBox args={[2.03, 1.52, 0.36]} radius={0.03} smoothness={3} position={[0, 0.75, 0]} material={mats.satin} />
      {/* the plaque: a round maroon seal with a gold rim and a key on it */}
      <group position={[0, 0.78, 1.02]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.lining}>
          <cylinderGeometry args={[0.46, 0.46, 0.06, 40]} />
        </mesh>
        <mesh position={[0, 0, 0.03]} material={mats.goldBright}>
          <torusGeometry args={[0.46, 0.045, 12, 40]} />
        </mesh>
        <group position={[0.1, 0, 0.06]} scale={0.27} rotation={[0, 0, 0.5]}>
          <Key3D mats={mats} />
        </group>
      </group>
      <group ref={lidRef} position={[0, 1.5, 0]}>
        <RoundedBox args={[2.24, 0.42, 2.24]} radius={0.08} smoothness={4} position={[0, 0.21, 0]} material={mats.wrap} />
        <RoundedBox args={[0.4, 0.44, 2.26]} radius={0.03} smoothness={3} position={[0, 0.21, 0]} material={mats.satin} />
        <RoundedBox args={[2.26, 0.44, 0.4]} radius={0.03} smoothness={3} position={[0, 0.21, 0]} material={mats.satin} />
        {/* the bow: four puffed loops, two tails and a knot */}
        <group ref={bowRef} position={[0, 0.42, 0]}>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            return (
              <group key={i} rotation={[0, -a, 0]}>
                <mesh position={[0.3, 0.3, 0]} rotation={[0, 0, 0.25]} scale={[1, 1.35, 0.6]} material={mats.satin}>
                  <torusGeometry args={[0.28, 0.085, 14, 36]} />
                </mesh>
              </group>
            );
          })}
          {[-1, 1].map((s) => (
            <RoundedBox key={s} args={[0.2, 0.04, 0.9]} radius={0.02} smoothness={2} position={[s * 0.22, 0.04, 0.6]} rotation={[0.18, s * 0.28, s * 0.22]} material={mats.satin} />
          ))}
          <mesh position={[0, 0.2, 0]} material={mats.satin}>
            <sphereGeometry args={[0.2, 24, 24]} />
          </mesh>
        </group>
        {/* the tag, hanging from the bow by a string */}
        <group ref={tagRef} position={[0.55, 0.42, 1.12]}>
          <mesh position={[0, -0.14, 0]} material={mats.goldDark}>
            <cylinderGeometry args={[0.012, 0.012, 0.3, 6]} />
          </mesh>
          <group position={[0, -0.5, 0]}>
            <RoundedBox args={[0.46, 0.58, 0.03]} radius={0.02} smoothness={2} material={mats.pearl} />
            <mesh position={[0, 0.2, 0.02]} material={mats.goldBright}>
              <torusGeometry args={[0.045, 0.014, 8, 20]} />
            </mesh>
            <group position={[0, -0.06, 0.025]} scale={0.14} rotation={[0, 0, Math.PI / 2 + 0.2]}>
              <Key3D mats={mats} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/** One half of the treasure map: old stained paper with a torn edge, curled slightly; a compass or the X are painted on. 2.4 wide. */
export function MapHalf3D({ side }: { side: 'a' | 'b' }) {
  const { map, bump, geo } = useMemo(() => {
    const a = side === 'a';
    const W = 640;
    const H = 512;
    const tex = canvasTexture(W, H, (x) => {
      const r = rng(a ? 3 : 9);
      const m = 10;
      x.beginPath();
      if (a) {
        x.moveTo(m, m);
        x.lineTo(W - 44, m);
        for (let i = 0; i <= 12; i++) x.lineTo(W - 44 + (i % 2 ? 34 : 0) + r() * 8, m + ((H - 2 * m) * i) / 12);
        x.lineTo(m, H - m);
      } else {
        x.moveTo(W - m, m);
        x.lineTo(44, m);
        for (let i = 0; i <= 12; i++) x.lineTo(44 - (i % 2 ? 34 : 0) - r() * 8, m + ((H - 2 * m) * i) / 12);
        x.lineTo(W - m, H - m);
      }
      x.closePath();
      x.save();
      x.clip();
      paintParchment(x, W, H, a ? 5 : 8);
      // the painted route
      x.strokeStyle = '#5b3513';
      x.lineWidth = 7;
      x.setLineDash([18, 15]);
      x.lineCap = 'round';
      x.beginPath();
      if (a) {
        x.moveTo(110, 390);
        x.quadraticCurveTo(230, 160, 350, 310);
        x.quadraticCurveTo(440, 400, 540, 180);
      } else {
        x.moveTo(70, 150);
        x.quadraticCurveTo(230, 190, 320, 310);
        x.quadraticCurveTo(370, 380, 450, 360);
      }
      x.stroke();
      x.setLineDash([]);
      x.fillStyle = 'rgba(70,45,15,0.7)';
      for (const [px, py] of a ? [[180, 250], [300, 220], [420, 360]] : [[120, 210], [250, 280], [380, 380]]) {
        x.beginPath();
        x.moveTo(px, py - 16);
        x.lineTo(px + 14, py + 8);
        x.lineTo(px - 14, py + 8);
        x.fill();
      }
      if (a) {
        // a compass rose
        x.save();
        x.translate(112, 112);
        x.strokeStyle = '#5b3513';
        x.lineWidth = 4;
        x.beginPath();
        x.arc(0, 0, 50, 0, Math.PI * 2);
        x.stroke();
        x.beginPath();
        x.arc(0, 0, 40, 0, Math.PI * 2);
        x.lineWidth = 1.5;
        x.stroke();
        x.fillStyle = '#5b3513';
        x.beginPath();
        x.moveTo(0, -72);
        x.lineTo(11, 0);
        x.lineTo(0, 72);
        x.lineTo(-11, 0);
        x.fill();
        x.beginPath();
        x.moveTo(-72, 0);
        x.lineTo(0, -11);
        x.lineTo(72, 0);
        x.lineTo(0, 11);
        x.fill();
        x.fillStyle = '#b3261e';
        x.beginPath();
        x.moveTo(0, -72);
        x.lineTo(11, 0);
        x.lineTo(-11, 0);
        x.fill();
        x.restore();
      } else {
        x.strokeStyle = '#b3261e';
        x.lineWidth = 20;
        x.beginPath();
        x.moveTo(410, 320);
        x.lineTo(500, 410);
        x.moveTo(500, 320);
        x.lineTo(410, 410);
        x.stroke();
        x.strokeStyle = '#3f6f95';
        x.lineWidth = 5;
        x.beginPath();
        for (let k = 0; k < 3; k++) {
          const yy = 420 + k * 18;
          x.moveTo(70, yy);
          x.quadraticCurveTo(100, yy - 22, 130, yy);
          x.quadraticCurveTo(160, yy + 22, 190, yy);
        }
        x.stroke();
      }
      x.restore();
      x.strokeStyle = 'rgba(100,60,20,0.85)';
      x.lineWidth = 6;
      x.stroke();
    });
    const bumpTex = paperBump(W, H, a ? 5 : 8);
    // a little curl: the sheet bows towards the middle and its tear edge lifts
    const g = new THREE.PlaneGeometry(2.4, 1.92, 30, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const edge = a ? x : -x;
      p.setZ(i, Math.sin((x / 2.4) * Math.PI) * 0.05 + Math.max(0, edge / 1.2) * 0.09 * Math.cos(y * 1.4));
    }
    g.computeVertexNormals();
    return { map: tex, bump: bumpTex, geo: g };
  }, [side]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial map={map} bumpMap={bump} bumpScale={1.2} transparent alphaTest={0.4} side={THREE.DoubleSide} roughness={0.92} metalness={0} />
    </mesh>
  );
}

/** The ring of power: a gold band with an engraved line, four prongs and a faceted red stone with a light that glints around it. */
export function Ring3D({ mats }: { mats: Mats }) {
  const glint = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (!glint.current) return;
    const t = clock.elapsedTime * 2.4;
    glint.current.position.set(Math.cos(t) * 0.7, 1.0, Math.sin(t) * 0.7);
    glint.current.intensity = 1.5 + Math.sin(t * 3) * 1.2;
  });
  return (
    <group>
      <mesh material={mats.goldBright}>
        <torusGeometry args={[0.55, 0.14, 24, 64]} />
      </mesh>
      <mesh material={mats.goldDark}>
        <torusGeometry args={[0.55, 0.145, 6, 64]} />
      </mesh>
      <mesh material={mats.goldBright} position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.3, 0.2, 0.2, 8]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh key={i} material={mats.goldBright} position={[Math.cos(a) * 0.24, 0.84, Math.sin(a) * 0.24]} rotation={[Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]}>
            <cylinderGeometry args={[0.035, 0.05, 0.34, 8]} />
          </mesh>
        );
      })}
      <mesh material={mats.gem} position={[0, 0.9, 0]} scale={[1, 1.25, 1]}>
        <octahedronGeometry args={[0.3]} />
      </mesh>
      <pointLight ref={glint} color="#ff9a8a" distance={3} intensity={2} />
    </group>
  );
}

const SHIELD_SCALE = 0.04;
function shieldShape(k = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 34 * k);
  s.lineTo(28 * k, 24 * k);
  s.lineTo(28 * k, -6 * k);
  s.quadraticCurveTo(28 * k, -26 * k, 0, -38 * k);
  s.quadraticCurveTo(-28 * k, -26 * k, -28 * k, -6 * k);
  s.lineTo(-28 * k, 24 * k);
  s.closePath();
  return s;
}
function starShape() {
  const pts: [number, number][] = [[0, 16], [4.7, 5], [16, 4.2], [7.4, -3.4], [10, -14.6], [0, -8.6], [-10, -14.6], [-7.4, -3.4], [-16, 4.2], [-4.7, 5]];
  const s = new THREE.Shape();
  pts.forEach(([px, py], i) => (i ? s.lineTo(px, py) : s.moveTo(px, py)));
  s.closePath();
  return s;
}

/** The Unbeatable Shield: a bevelled gold rim studded with rivets, a raised inner plate and an embossed red star, about 2.3 high. */
export function Shield3D({ mats }: { mats: Mats }) {
  const parts = useMemo(() => {
    const rimShape = shieldShape();
    rimShape.holes.push(new THREE.Path(shieldShape(0.84).getPoints(24).reverse()));
    const rim = new THREE.ExtrudeGeometry(rimShape, { depth: 7, bevelEnabled: true, bevelThickness: 2.6, bevelSize: 2.2, bevelSegments: 5 });
    const plate = new THREE.ExtrudeGeometry(shieldShape(0.86), { depth: 3, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.2, bevelSegments: 4 });
    const star = new THREE.ExtrudeGeometry(starShape(), { depth: 2.4, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.9, bevelSegments: 3 });
    const rivets = shieldShape(0.93).getSpacedPoints(18).slice(0, 18);
    return { rim, plate, star, rivets };
  }, []);
  return (
    <group scale={SHIELD_SCALE}>
      <mesh geometry={parts.rim} material={mats.gold} />
      <mesh geometry={parts.plate} material={mats.goldDark} position={[0, -1, 4]} />
      <mesh geometry={parts.star} material={mats.star} position={[0, 2, 10]} scale={1.2} />
      {parts.rivets.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 11]} material={mats.goldBright}>
          <sphereGeometry args={[1.5, 12, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/** Confetti or coins thrown out of `origin` once `at` is set (a number, or a ref filled in later), falling under gravity. */
export function Burst({
  at,
  origin,
  coins = false,
  count = 36,
  mats,
  still,
}: {
  at: number | MutableRefObject<number | null>;
  origin: [number, number, number];
  coins?: boolean;
  count?: number;
  mats: Mats;
  still: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bits = useMemo(() => {
    const r = rng(coins ? 5 : 17);
    const palette = ['#f7c948', '#e8456b', '#4aa3df', '#7ed957', '#ffffff'];
    return Array.from({ length: count }, (_, i) => ({
      v: new THREE.Vector3((r() - 0.5) * 5, 3 + r() * 3.4, (r() - 0.3) * 3),
      spin: new THREE.Vector3(r() * 9, r() * 9, r() * 9),
      color: new THREE.Color(coins ? '#f6bf30' : palette[i % palette.length]),
      s: 0.7 + r() * 0.6,
    }));
  }, [coins, count]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    bits.forEach((b, i) => mesh.setColorAt(i, b.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bits]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const start = typeof at === 'number' ? at : at.current;
    const tau = start === null ? -1 : (still ? 99 : clock.elapsedTime) - start;
    bits.forEach((b, i) => {
      if (tau < 0 || tau > 2.4) {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(origin[0] + b.v.x * tau, origin[1] + b.v.y * tau - 4.8 * tau * tau, origin[2] + b.v.z * tau);
        dummy.rotation.set(b.spin.x * tau, b.spin.y * tau, b.spin.z * tau);
        dummy.scale.setScalar(b.s * (tau > 1.9 ? 1 - (tau - 1.9) / 0.5 : 1));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false} material={coins ? mats.goldBright : undefined}>
      {coins ? <cylinderGeometry args={[0.18, 0.18, 0.04, 16]} /> : <boxGeometry args={[0.16, 0.26, 0.02]} />}
      {!coins && <meshStandardMaterial roughness={0.5} metalness={0.1} side={THREE.DoubleSide} />}
    </instancedMesh>
  );
}
