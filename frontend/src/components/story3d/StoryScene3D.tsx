import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useLanguage } from '../../lib/language-context';
import { bezier, easeOutBack, easeOutBounce, easeOutCubic, flash, lerp, seg } from './anim';
import { EnergyPulse, Laurel, MagicCircle, Orbiters } from './showcase';
import { Burst, Chest3D, Env, GiftBox3D, Glow, Key3D, LightCone, LOCK_X, MapHalf3D, Rays, Ring3D, Shield3D, useMats, type Mats } from './parts';

// The 3D versions of the story windows (components/StoryArtView.tsx picks them when the device can draw WebGL). Every scene is a
// timeline worked out from seconds, so it can be redrawn at any moment and a reduced-motion visitor just gets the finished picture.
// They are also interactive: drag anywhere to turn the scene, tap things to make them happen, and the objects react to the pointer.
//
//   gift   a guardian's key: the gift drops in and waits; tap it (or wait a moment) and it shakes, the lid and bow fly off in
//          confetti and the golden key rises, spinning
//   chest  every third key (3, 6, 9): the chest has THREE keyholes. Tap each key (or wait) and it flies to its own hole, slides
//          in, turns, and stays in the lock; when the third has turned the chest shakes, bursts open and its gift rises out
//   final  level 50: the two map halves join, and the ring of power (tap it, or wait) flies to the round seat on the chest,
//          turns and opens it; the shield rises out. Tap the shield to spin it

export type SceneKind = 'gift' | 'chest' | 'final';
export type SceneReward = 'mapA' | 'mapB' | 'ring';
type Phase = 'ready' | 'playing' | 'done';
type NumRef = MutableRefObject<number | null>;

const clockTime = (still: boolean, clock: THREE.Clock) => (still ? 99 : clock.elapsedTime);
const smooth = (x: number) => x * x * (3 - 2 * x);
/** An angle wrapped into -PI..PI. */
const wrapPi = (a: number) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

/** Sets the cursor while the pointer is over something tappable. */
function useTappable(on: boolean) {
  const over = useRef(false);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  return {
    over,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      over.current = true;
      if (on) document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      over.current = false;
      document.body.style.cursor = '';
    },
  };
}

/**
 * Everything inside turns about the vertical axis: drag to turn it by hand (it eases back to a gentle sway a moment after you let
 * go). Also marks every mesh inside as casting and receiving shadows.
 */
export function Turntable({ children, still }: { children: ReactNode; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const st = useRef({ yaw: 0, user: 0, dragging: false, lastX: 0, touched: -99 });
  useLayoutEffect(() => {
    g.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material | undefined;
      if (mat && (mat.blending === THREE.AdditiveBlending || (mat as THREE.MeshStandardMaterial).alphaTest > 0)) return;
      m.castShadow = true;
      m.receiveShadow = true;
    });
  });
  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const down = (e: PointerEvent) => {
      s.dragging = true;
      s.lastX = e.clientX;
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!s.dragging) return;
      s.user = THREE.MathUtils.clamp(s.user + (e.clientX - s.lastX) * 0.012, -1.4, 1.4);
      s.lastX = e.clientX;
      s.touched = performance.now() / 1000;
    };
    const up = () => {
      s.dragging = false;
      el.style.cursor = '';
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [gl]);
  useFrame(({ clock }) => {
    const s = st.current;
    const t = still ? 0 : clock.elapsedTime;
    const recent = performance.now() / 1000 - s.touched < 2.6;
    const goal = recent || s.dragging ? s.user : Math.sin(t * 0.55) * 0.32;
    if (!recent && !s.dragging) s.user = lerp(s.user, goal, 0.05);
    s.yaw = lerp(s.yaw, goal, 0.1);
    if (g.current) g.current.rotation.y = s.yaw;
  });
  return <group ref={g}>{children}</group>;
}

export function CameraLook({ at }: { at: [number, number, number] }) {
  useFrame(({ camera }) => camera.lookAt(at[0], at[1], at[2]));
  return null;
}

export function Lights() {
  return (
    <>
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[3.5, 7, 5]}
        intensity={1.7}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={8}
        shadow-camera-bottom={-5}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <directionalLight position={[-4, 3, -2]} intensity={0.7} color="#9ab8ff" />
    </>
  );
}

/** Catches the shadows on the floor, so objects sit on something. */
export function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <shadowMaterial transparent opacity={0.42} />
    </mesh>
  );
}

/** Reports a change of phase to the page (for the hint under the scene), only when it changes. */
function usePhase(onPhase: (p: Phase) => void) {
  const last = useRef<Phase | null>(null);
  return (p: Phase) => {
    if (last.current !== p) {
      last.current = p;
      onPhase(p);
    }
  };
}

const GIFT_AUTO = 4.4;

/** The gift: it drops in and waits to be tapped. */
function GiftScene({ mats, still, onPhase }: { mats: Mats; still: boolean; onPhase: (p: Phase) => void }) {
  const report = usePhase(onPhase);
  const box = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const bow = useRef<THREE.Group>(null);
  const tag = useRef<THREE.Group>(null);
  const key = useRef<THREE.Group>(null);
  const rays = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const hint = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  const cone = useRef<THREE.Mesh>(null);
  const openAt: NumRef = useRef<number | null>(still ? -99 : null);
  const burstAt: NumRef = useRef<number | null>(still ? -99 + 0.75 : null);
  const tap = useTappable(true);
  const clock = useThree((s) => s.clock);
  const open = () => {
    if (openAt.current === null && clock.elapsedTime > 1.1) {
      openAt.current = clock.elapsedTime;
      burstAt.current = clock.elapsedTime + 0.75;
    }
  };
  useFrame(({ clock: c }) => {
    const t = clockTime(still, c);
    if (openAt.current === null && t > GIFT_AUTO) {
      openAt.current = t;
      burstAt.current = t + 0.75;
    }
    const u = openAt.current === null ? -1 : t - openAt.current;
    report(u < 0 ? (t > 1.1 ? 'ready' : 'playing') : u > 2.4 ? 'done' : 'playing');
    if (box.current) {
      const wait = u < 0 && t > 1.1 ? Math.sin(t * 3) * 0.05 + (tap.over.current ? 0.12 : 0) : 0;
      box.current.position.y = lerp(7, 0, easeOutBounce(seg(t, 0.05, 1.0))) + Math.max(0, wait);
      const sh = seg(u, 0, 0.65);
      box.current.rotation.z = sh > 0 && sh < 1 ? Math.sin(sh * Math.PI * 9) * 0.1 * (1 - sh) : 0;
      box.current.rotation.x = sh > 0 && sh < 1 ? Math.sin(sh * Math.PI * 7) * 0.05 * (1 - sh) : 0;
      // squash a little when it lands, stretch as it shakes
      const land = seg(t, 0.9, 1.25);
      const squash = land > 0 && land < 1 ? Math.sin(land * Math.PI) * 0.1 : 0;
      box.current.scale.set((u < 0 && tap.over.current ? 1.04 : 1) + squash, (u < 0 && tap.over.current ? 1.04 : 1) - squash, (u < 0 && tap.over.current ? 1.04 : 1) + squash);
    }
    if (bow.current) {
      const pop = seg(u, 0.55, 0.75);
      bow.current.scale.setScalar((1 + Math.sin(t * 3) * 0.03) * (1 + Math.sin(pop * Math.PI) * 0.3));
      bow.current.rotation.y = Math.sin(t * 1.5) * 0.12;
    }
    if (tag.current) tag.current.rotation.z = Math.sin(t * 2.6) * 0.22 * (u < 0 ? 1 : 1.8);
    if (lid.current) {
      const v = Math.max(0, u - 0.7);
      lid.current.position.set(2.6 * v, 1.5 + 5.4 * v - 7.2 * v * v, 1.4 * v);
      lid.current.rotation.set(1.6 * v, 0.8 * v, -3.2 * v);
      lid.current.visible = v < 1.5;
    }
    if (key.current) {
      const k = seg(u, 0.8, 1.75);
      key.current.position.y = lerp(1.4, 3.4, easeOutBack(k)) + (k >= 1 ? Math.sin((u - 1.75) * 2.4) * 0.12 : 0);
      key.current.scale.setScalar(Math.max(0.001, lerp(0.2, 1.15, easeOutCubic(k))));
      key.current.rotation.y = t * 2.4;
      key.current.rotation.z = -0.5;
    }
    const glow = seg(u, 0.75, 1.55);
    if (rays.current) {
      rays.current.rotation.z = t * 0.25;
      rays.current.visible = glow > 0;
      rays.current.scale.setScalar(glow);
    }
    if (halo.current) {
      halo.current.position.set(0, 3.1, 0);
      halo.current.scale.setScalar(lerp(0.5, 4.2, glow) * (1 + Math.sin(t * 3) * 0.06));
      (halo.current.material as THREE.SpriteMaterial).opacity = glow * 0.9;
    }
    if (cone.current) {
      cone.current.visible = glow > 0;
      (cone.current.material as THREE.MeshBasicMaterial).opacity = glow * (0.34 + Math.sin(t * 4) * 0.05);
    }
    if (hint.current) {
      // a pulsing glow under the gift says "tap me"
      hint.current.position.set(0, 0.9, 0.2);
      hint.current.scale.setScalar(4.4 + Math.sin(t * 4) * 0.5);
      (hint.current.material as THREE.SpriteMaterial).opacity = u < 0 && t > 1.0 ? 0.5 + Math.sin(t * 4) * 0.2 : 0;
    }
    if (light.current) light.current.intensity = glow * 14 + flash(u, 0.72, 0.5) * 30;
  });
  return (
    <>
      <group position={[0, 2.4, -2.2]}>
        <Rays ref={rays} length={6.5} />
      </group>
      <group ref={box} onClick={(e) => (e.delta < 6 ? open() : undefined)} onPointerOver={tap.onPointerOver} onPointerOut={tap.onPointerOut}>
        <GiftBox3D mats={mats} lidRef={lid} bowRef={bow} tagRef={tag} />
      </group>
      <group ref={key} position={[0, 1.4, 0]}>
        <Key3D mats={mats} />
      </group>
      <LightCone ref={cone} position={[0, 3.3, 0]} />
      <Glow ref={halo} />
      <Glow ref={hint} color="#ffb3c8" />
      <pointLight ref={light} position={[0, 3, 2]} color="#ffd36a" distance={9} intensity={0} />
      <Burst at={burstAt} origin={[0, 1.7, 0]} mats={mats} still={still} count={56} />
      <Sparkles count={36} scale={[5, 4, 3]} position={[0, 2.2, 0]} size={5} speed={0.5} color="#ffeaa8" />
    </>
  );
}

const KEY_START: [number, number, number][] = [[-2.9, 3.9, 0.8], [0, 4.6, 0.8], [2.9, 3.9, 0.8]];
const KEY_SCALE = 0.5;
const HOLE_Y = 1.06; // the keyholes are at this height on the chest front
const HOLE_IN = 1.5; // where a key sits once it is in (its bow sticks out)
const HOLE_OUT = 2.7; // where it lines up before sliding in
const KT = { fly: 0.75, push: 1.0, twist: 1.35, total: 1.4 }; // seconds after a key is sent: flies, slides in, turns

/** The chest with its three keyholes and the three keys, and what comes out of it. */
function ChestScene({ mats, reward, still, onPhase }: { mats: Mats; reward: SceneReward; still: boolean; onPhase: (p: Phase) => void }) {
  const report = usePhase(onPhase);
  const chest = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const keyOuter = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const keyInner = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const gift = useRef<THREE.Group>(null);
  const rays = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Sprite>(null);
  const cone = useRef<THREE.Mesh>(null);
  const lockLight = useRef<THREE.PointLight>(null);
  const openLight = useRef<THREE.PointLight>(null);
  const sent = useRef<(number | null)[]>(still ? [-9, -9, -9] : [null, null, null]);
  const openRef: NumRef = useRef<number | null>(still ? -9 + KT.total + 0.3 : null);
  const hover = useRef(-1);
  const spin = useRef({ extra: 0, over: false });
  const aura = useRef<THREE.Group>(null);
  const pulseAt: NumRef = useRef<number | null>(null);
  const clock = useThree((s) => s.clock);
  const tmp = useRef({ p: new THREE.Vector3(), c: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() }).current;
  const send = (i: number) => {
    if (sent.current[i] === null && clock.elapsedTime > 0.9) sent.current[i] = clock.elapsedTime;
  };
  const giftTap = useTappable(true);
  useFrame(({ clock: c }) => {
    const t = clockTime(still, c);
    const S = sent.current;
    // keys that are not tapped go by themselves, one at a time
    const lastSent = Math.max(2.2, ...S.filter((x): x is number => x !== null));
    if (t > lastSent + 2.6) {
      const i = S.findIndex((x) => x === null);
      if (i >= 0) S[i] = t;
    }
    const OPEN = S.every((x) => x !== null) ? Math.max(...(S as number[])) + KT.total + 0.3 : Infinity;
    openRef.current = Number.isFinite(OPEN) ? OPEN : null;
    report(!Number.isFinite(OPEN) ? (t > 0.9 ? 'ready' : 'playing') : t > OPEN + 2 ? 'done' : 'playing');
    if (chest.current) {
      chest.current.scale.setScalar(lerp(0.7, 1, easeOutBack(seg(t, 0, 0.5))));
      const sk = seg(t, OPEN - 0.5, OPEN);
      chest.current.rotation.z = sk > 0 && sk < 1 ? Math.sin(sk * Math.PI * 8) * 0.035 : 0;
    }
    let hit = 0;
    let hitAt = 1;
    keyOuter.forEach((ref, i) => {
      const g = ref.current;
      const inner = keyInner[i].current;
      if (!g || !inner) return;
      const t0 = S[i];
      const appear = easeOutBack(seg(t, 0.15 + i * 0.12, 0.55 + i * 0.12));
      const s0 = KEY_START[i];
      const lx = LOCK_X[i];
      const lock = mats.locks[i];
      if (t0 === null) {
        // waiting to be tapped: hovering and turning, quicker and bigger under the pointer
        const hov = hover.current === i;
        g.position.set(s0[0], s0[1] + Math.sin(t * 2.2 + i) * 0.14 + (hov ? 0.18 : 0), s0[2]);
        g.rotation.set(0, t * (hov ? 4.2 : 2.4) + i, -0.4);
        g.scale.setScalar(KEY_SCALE * 1.25 * Math.max(0.001, appear) * (hov ? 1.18 : 1));
        inner.rotation.x = 0;
        lock.emissiveIntensity = 0;
        return;
      }
      const s = t - t0;
      const a0 = (t0 * 2.4 + i) % (Math.PI * 2);
      if (s < KT.fly) {
        // flies to the front of its own keyhole, turning to point into it, with one full spin on the way
        const f = seg(s, 0, KT.fly);
        tmp.a.set(s0[0], s0[1], s0[2]);
        tmp.b.set(lx, HOLE_Y, HOLE_OUT);
        tmp.c.set(s0[0] * 0.3 + lx * 0.7, 3.4, 4.2);
        bezier(tmp.p, tmp.a, tmp.c, tmp.b, smooth(f));
        g.position.copy(tmp.p);
        g.rotation.set(0, lerp(a0, Math.PI / 2 + Math.PI * 2, smooth(seg(f, 0.15, 1))), lerp(-0.4, 0, smooth(seg(f, 0.4, 1))));
        g.scale.setScalar(lerp(KEY_SCALE * 1.25, KEY_SCALE, smooth(f)));
        inner.rotation.x = 0;
      } else {
        // slides into the hole, then turns a quarter, and stays there
        const p = easeOutCubic(seg(s, KT.fly, KT.push));
        g.position.set(lx, HOLE_Y, lerp(HOLE_OUT, HOLE_IN, p));
        g.rotation.set(0, Math.PI / 2, 0);
        g.scale.setScalar(KEY_SCALE);
        inner.rotation.x = easeOutBack(seg(s, KT.push, KT.twist)) * (Math.PI / 2);
      }
      lock.emissiveIntensity = flash(s, KT.push, 0.5) * 1.8 + (s > KT.twist ? 0.3 : 0) + flash(s, KT.twist, 0.4) * 1.2;
      const fl = Math.max(flash(s, KT.push, 0.5), flash(s, KT.twist, 0.4));
      if (fl > hit) {
        hit = fl;
        hitAt = i;
      }
    });
    if (lockLight.current) {
      lockLight.current.position.set(LOCK_X[hitAt], 1.2, 2.4);
      lockLight.current.intensity = hit * 18;
    }
    if (lid.current) lid.current.rotation.x = -easeOutBack(seg(t, OPEN, OPEN + 0.8)) * 1.95;
    const o = seg(t, OPEN, OPEN + 1.0);
    if (burst.current) {
      burst.current.position.set(0, 1.9, 0.4);
      burst.current.scale.setScalar(lerp(0.5, 11, easeOutCubic(o)));
      (burst.current.material as THREE.SpriteMaterial).opacity = o > 0 ? Math.max(0, 1 - o) : 0;
    }
    if (cone.current) {
      cone.current.visible = t > OPEN + 0.1;
      (cone.current.material as THREE.MeshBasicMaterial).opacity = seg(t, OPEN + 0.1, OPEN + 0.9) * (0.36 + Math.sin(t * 3.5) * 0.05);
    }
    if (openLight.current) openLight.current.intensity = flash(t, OPEN, 1.2) * 40 + seg(t, OPEN + 0.3, OPEN + 1.2) * 8;
    if (rays.current) {
      rays.current.visible = t > OPEN;
      rays.current.rotation.z = t * 0.22;
      rays.current.scale.setScalar(seg(t, OPEN, OPEN + 0.9));
    }
    if (gift.current) {
      const r = seg(t, OPEN + 0.15, OPEN + 1.1);
      const bob = r >= 1 ? Math.sin((t - OPEN) * 2.2) * 0.12 : 0;
      gift.current.position.set(0, lerp(1.3, reward === 'ring' ? 3.1 : 3.5, easeOutBack(r)) + bob, 0);
      gift.current.scale.setScalar(Math.max(0.001, lerp(0.4, 1, easeOutCubic(r))) * (spin.current.over ? 1.08 : 1) * (reward === 'ring' ? 1.15 : 1));
      spin.current.extra = lerp(spin.current.extra, 0, 0.04);
      gift.current.rotation.y = Math.sin((t - OPEN) * 1.1) * 0.5 + spin.current.extra;
      gift.current.visible = r > 0;
      if (aura.current) {
        aura.current.visible = r > 0;
        aura.current.position.set(0, gift.current.position.y, -0.7);
        aura.current.scale.setScalar(Math.max(0.001, easeOutCubic(r)) * 0.92);
      }
    }
  });
  return (
    <>
      <group position={[0, 2.2, -2.4]}>
        <Rays ref={rays} length={7} />
      </group>
      <group ref={chest}>
        <Chest3D mats={mats} lidRef={lid} locks="keys" />
      </group>
      {keyOuter.map((ref, i) => (
        <group
          key={i}
          ref={ref}
          onClick={(e) => (e.delta < 6 ? send(i) : undefined)}
          onPointerOver={(e) => {
            e.stopPropagation();
            hover.current = i;
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            hover.current = -1;
            document.body.style.cursor = '';
          }}
        >
          <group ref={keyInner[i]}>
            <Key3D mats={mats} />
          </group>
        </group>
      ))}
      <LightCone ref={cone} position={[0, 3.6, 0]} />
      <group
        ref={gift}
        onClick={(e) => {
          if (e.delta < 6) {
            spin.current.extra += Math.PI * 2;
            pulseAt.current = clock.elapsedTime;
          }
        }}
        onPointerOver={(e) => {
          giftTap.onPointerOver(e);
          spin.current.over = true;
        }}
        onPointerOut={() => {
          giftTap.onPointerOut();
          spin.current.over = false;
        }}
      >
        {reward === 'ring' ? <Ring3D mats={mats} /> : <MapHalf3D side={reward === 'mapA' ? 'a' : 'b'} />}
      </group>
      {reward === 'ring' && (
        <group ref={aura} visible={false}>
          <MagicCircle still={still} />
          <Orbiters radius={1.3} still={still} />
          <EnergyPulse at={pulseAt} still={still} />
        </group>
      )}
      <Glow ref={burst} />
      <pointLight ref={lockLight} position={[0, 1.2, 2.4]} color="#fff3c9" distance={5} intensity={0} />
      <pointLight ref={openLight} position={[0, 2.2, 1.5]} color="#ffd36a" distance={10} intensity={0} />
      <Burst at={openRef} origin={[0, 1.7, 0.2]} coins mats={mats} still={still} count={30} />
      <Sparkles count={30} scale={[5, 3.5, 3]} position={[0, 2.4, 0]} size={5} speed={0.45} color="#ffeaa8" />
    </>
  );
}

const RING_AUTO = 5.2;
const SEAT = new THREE.Vector3(0, 0.8, 1.14);
const RING_HOVER = new THREE.Vector3(0, 4.0, 0);

/** Level 50: the map halves join above; the ring of power flies to the round seat on the chest, turns and opens it. */
function FinalScene({ mats, still, onPhase }: { mats: Mats; still: boolean; onPhase: (p: Phase) => void }) {
  const report = usePhase(onPhase);
  const a = useRef<THREE.Group>(null);
  const b = useRef<THREE.Group>(null);
  const ringOuter = useRef<THREE.Group>(null);
  const ringInner = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const shield = useRef<THREE.Group>(null);
  const rays = useRef<THREE.Group>(null);
  const seam = useRef<THREE.Sprite>(null);
  const burst = useRef<THREE.Sprite>(null);
  const cone = useRef<THREE.Mesh>(null);
  const openLight = useRef<THREE.PointLight>(null);
  const seatLight = useRef<THREE.PointLight>(null);
  const ringAt: NumRef = useRef<number | null>(still ? -99 : null);
  const openRef: NumRef = useRef<number | null>(still ? -99 + 1.75 : null);
  const spin = useRef({ extra: 0, over: false });
  const aura = useRef<THREE.Group>(null);
  const pulseAt: NumRef = useRef<number | null>(null);
  const tap = useTappable(true);
  const ringTap = useTappable(true);
  const clock = useThree((s) => s.clock);
  const tmp = useRef({ p: new THREE.Vector3(), c: new THREE.Vector3() }).current;
  const placeRing = () => {
    if (ringAt.current === null && clock.elapsedTime > 2.2) ringAt.current = clock.elapsedTime;
  };
  useFrame(({ clock: cl }) => {
    const t = clockTime(still, cl);
    if (ringAt.current === null && t > RING_AUTO) ringAt.current = t;
    const u = ringAt.current === null ? -1 : t - ringAt.current;
    const OPEN = ringAt.current === null ? Infinity : ringAt.current + 1.75;
    openRef.current = Number.isFinite(OPEN) ? OPEN : null;
    report(u < 0 ? (t > 2.2 ? 'ready' : 'playing') : t > OPEN + 1.8 ? 'done' : 'playing');
    const j = easeOutBack(seg(t, 0.2, 1.2));
    if (a.current) {
      a.current.position.set(lerp(-4.2, -1.2, j), 5.6, 0);
      a.current.rotation.z = lerp(-0.25, 0, j);
    }
    if (b.current) {
      b.current.position.set(lerp(4.2, 1.2, j), 5.6, 0);
      b.current.rotation.z = lerp(0.25, 0, j);
    }
    if (seam.current) {
      seam.current.position.set(0, 5.6, 0.1);
      seam.current.scale.setScalar(lerp(0.5, 3.4, seg(t, 1.1, 1.6)));
      (seam.current.material as THREE.SpriteMaterial).opacity = flash(t, 1.1, 0.9);
    }
    // the ring: hovers above the chest, then flies to the seat, settles and turns
    const o = ringOuter.current;
    const r2 = ringInner.current;
    if (o && r2) {
      const appear = seg(t, 1.4, 2.0);
      if (u < 0) {
        const hov = ringTap.over.current;
        o.position.set(0, lerp(4.8, 4.0, easeOutBack(appear)) + Math.sin(t * 2) * 0.06 + (hov ? 0.15 : 0), 0);
        o.rotation.set(0, t * (hov ? 3.2 : 1.6), 0);
        o.scale.setScalar(Math.max(0.001, 0.62 * easeOutBack(appear)) * (hov ? 1.14 : 1));
        r2.rotation.z = 0;
      } else {
        const f = seg(u, 0, 0.9);
        const e = smooth(f);
        tmp.c.set(0, 3.5, 3.6);
        bezier(tmp.p, RING_HOVER, tmp.c, SEAT, e);
        o.position.copy(tmp.p);
        o.rotation.set(0, wrapPi(ringAt.current! * 1.6) * (1 - e), 0);
        o.scale.setScalar(lerp(0.62, 0.5, e));
        r2.rotation.z = easeOutBack(seg(u, 1.0, 1.55)) * Math.PI * 2;
      }
    }
    mats.lock.emissiveIntensity = u < 0 ? 0 : flash(u, 0.95, 0.6) * 1.9 + (u > 1.0 ? 0.3 : 0) + flash(u, 1.55, 0.4) * 1.2;
    if (seatLight.current) seatLight.current.intensity = u < 0 ? 0 : Math.max(flash(u, 0.95, 0.6), flash(u, 1.55, 0.4)) * 18;
    if (lid.current) lid.current.rotation.x = -easeOutBack(seg(t, OPEN, OPEN + 0.8)) * 1.95;
    if (shield.current) {
      const r = seg(t, OPEN + 0.25, OPEN + 1.25);
      shield.current.position.set(0, lerp(1.2, 2.55, easeOutBack(r)) + (r >= 1 ? Math.sin((t - OPEN) * 2) * 0.08 : 0), 0.3);
      shield.current.scale.setScalar(Math.max(0.001, lerp(0.3, 0.9, easeOutCubic(r))) * (spin.current.over ? 1.06 : 1));
      spin.current.extra = lerp(spin.current.extra, 0, 0.035);
      shield.current.rotation.y = Math.sin((t - OPEN) * 1.3) * 0.5 + spin.current.extra;
      shield.current.visible = r > 0;
      if (aura.current) {
        aura.current.visible = r > 0;
        aura.current.position.set(0, shield.current.position.y, -0.5);
        aura.current.scale.setScalar(Math.max(0.001, easeOutCubic(r)) * 0.95);
      }
    }
    const op = seg(t, OPEN, OPEN + 1.0);
    if (burst.current) {
      burst.current.position.set(0, 1.9, 0.4);
      burst.current.scale.setScalar(lerp(0.5, 11, easeOutCubic(op)));
      (burst.current.material as THREE.SpriteMaterial).opacity = op > 0 ? Math.max(0, 1 - op) : 0;
    }
    if (cone.current) {
      cone.current.visible = t > OPEN + 0.1;
      (cone.current.material as THREE.MeshBasicMaterial).opacity = seg(t, OPEN + 0.1, OPEN + 0.9) * (0.36 + Math.sin(t * 3.5) * 0.05);
    }
    if (openLight.current) openLight.current.intensity = flash(t, OPEN, 1.2) * 40 + seg(t, OPEN + 0.3, OPEN + 1.2) * 10;
    if (rays.current) {
      rays.current.visible = t > OPEN;
      rays.current.rotation.z = t * 0.2;
      rays.current.scale.setScalar(seg(t, OPEN, OPEN + 1.0));
    }
  });
  return (
    <>
      <group position={[0, 2.3, -2.6]}>
        <Rays ref={rays} length={8} />
      </group>
      <group ref={a}>
        <MapHalf3D side="a" />
      </group>
      <group ref={b}>
        <MapHalf3D side="b" />
      </group>
      <Glow ref={seam} />
      <group ref={ringOuter} onClick={(e) => (e.delta < 6 ? placeRing() : undefined)} onPointerOver={ringTap.onPointerOver} onPointerOut={ringTap.onPointerOut}>
        <group ref={ringInner}>
          <Ring3D mats={mats} />
        </group>
      </group>
      <Chest3D mats={mats} lidRef={lid} locks="ring" />
      <LightCone ref={cone} position={[0, 3.6, 0]} />
      <group
        ref={shield}
        onClick={(e) => {
          if (e.delta < 6) {
            spin.current.extra += Math.PI * 2;
            pulseAt.current = clock.elapsedTime;
          }
        }}
        onPointerOver={(e) => {
          tap.onPointerOver(e);
          spin.current.over = true;
        }}
        onPointerOut={() => {
          tap.onPointerOut();
          spin.current.over = false;
        }}
      >
        <Shield3D mats={mats} />
      </group>
      <group ref={aura} visible={false}>
        <MagicCircle color="#ffd36a" accent="#fff3c9" still={still} />
        <Laurel mats={mats} radius={1.5} />
        <Orbiters radius={1.45} color="#ffe9a8" still={still} />
        <EnergyPulse at={pulseAt} color="#ffe08a" still={still} />
      </group>
      <Glow ref={burst} />
      <pointLight ref={seatLight} position={[0, 1.0, 2.6]} color="#fff3c9" distance={5} intensity={0} />
      <pointLight ref={openLight} position={[0, 2.4, 2]} color="#ffd36a" distance={11} intensity={0} />
      <Burst at={openRef} origin={[0, 1.7, 0.2]} coins mats={mats} still={still} count={34} />
      <Burst at={openRef} origin={[0, 1.7, 0.4]} mats={mats} still={still} count={40} />
      <Sparkles count={46} scale={[8, 6, 3]} position={[0, 3.2, 0]} size={5} speed={0.45} color="#ffeaa8" />
    </>
  );
}

export default function StoryScene3D({ kind, reward = 'mapA', still = false }: { kind: SceneKind; reward?: SceneReward; still?: boolean }) {
  const mats = useMats();
  const { t } = useLanguage();
  const final = kind === 'final';
  const [phase, setPhase] = useState<Phase>('playing');
  const onPhase = useCallback((p: Phase) => setPhase(p), []);
  const hint =
    phase === 'ready'
      ? kind === 'gift'
        ? t('story.tapGift')
        : kind === 'chest'
          ? t('story.tapKeys')
          : t('story.tapRing')
      : phase === 'done'
        ? kind === 'gift'
          ? t('story.dragTurn')
          : t('story.dragTapSpin')
        : '';
  return (
    <div className={`story-3d story-3d-${kind}`}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: final ? [0, 3.3, 15] : [0, 2.5, 10], fov: 32, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Env />
        <Lights />
        <CameraLook at={final ? [0, 3.0, 0] : [0, 2.2, 0]} />
        <Floor />
        <Turntable still={still}>
          {kind === 'gift' && <GiftScene mats={mats} still={still} onPhase={onPhase} />}
          {kind === 'chest' && <ChestScene mats={mats} reward={reward} still={still} onPhase={onPhase} />}
          {final && <FinalScene mats={mats} still={still} onPhase={onPhase} />}
        </Turntable>
      </Canvas>
      <p className={`story-3d-hint${hint ? ' is-on' : ''}`} aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
