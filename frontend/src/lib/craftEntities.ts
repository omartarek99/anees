// -------------------------------------------------------------------------------------------
// Passive animals for the Builder's Quarry: pigs (huntable → porkchops), dogs and cats
// (tameable pets that follow you). Low-poly box models; simple wander / follow AI with
// gravity and ground snapping against the voxel world.
// -------------------------------------------------------------------------------------------
import * as THREE from 'three';
import { getTile, isSolidTile, WORLD_Y, type ChunkWorld } from './craftWorld';

export type AnimalKind = 'pig' | 'dog' | 'cat';

export type Animal = {
  kind: AnimalKind;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  heading: number; // wander direction (radians)
  headingTimer: number; // seconds until re-pick
  grounded: boolean;
  hp: number;
  maxHp: number;
  tamed: boolean;
  hurtUntil: number; // perf.now() ms — brief red flash
  group: THREE.Group;
};

const HALF = 0.35; // horizontal half-extent for collision
const HEIGHT = 0.75;

const PALETTE: Record<AnimalKind, { body: number; head: number; leg: number; accent: number; hp: number }> = {
  pig: { body: 0xe59aa5, head: 0xe08e9a, leg: 0xc97d8a, accent: 0xf4b9c2, hp: 6 },
  dog: { body: 0x9a7b57, head: 0xb08e63, leg: 0x7c6144, accent: 0xf2e9dc, hp: 8 },
  cat: { body: 0xd98a3c, head: 0xe09a4e, leg: 0xba7430, accent: 0xfff1dc, hp: 8 },
};

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

export function makeAnimalMesh(kind: AnimalKind): THREE.Group {
  const p = PALETTE[kind];
  const g = new THREE.Group();
  const body = box(0.55, 0.5, 0.95, p.body);
  body.position.y = 0.5;
  g.add(body);
  const head = box(0.42, 0.42, 0.42, p.head);
  head.position.set(0, 0.62, 0.62);
  g.add(head);
  if (kind === 'pig') {
    const snout = box(0.2, 0.16, 0.1, p.accent);
    snout.position.set(0, 0.58, 0.84);
    g.add(snout);
  } else {
    // ears
    for (const s of [-1, 1]) {
      const ear = box(0.12, 0.14, 0.06, p.head);
      ear.position.set(s * 0.13, 0.86, 0.6);
      g.add(ear);
    }
    const tail = box(0.08, 0.08, 0.3, p.body);
    tail.position.set(0, 0.55, -0.55);
    tail.rotation.x = kind === 'cat' ? -0.6 : -0.2;
    g.add(tail);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.16, 0.32, 0.16, p.leg);
      leg.position.set(sx * 0.18, 0.16, sz * 0.32);
      g.add(leg);
    }
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}

export function makeAnimal(kind: AnimalKind, x: number, y: number, z: number): Animal {
  return {
    kind,
    x,
    y,
    z,
    vy: 0,
    yaw: Math.random() * Math.PI * 2,
    heading: Math.random() * Math.PI * 2,
    headingTimer: 1 + Math.random() * 3,
    grounded: false,
    hp: PALETTE[kind].hp,
    maxHp: PALETTE[kind].hp,
    tamed: false,
    hurtUntil: 0,
    group: makeAnimalMesh(kind),
  };
}

function solidAt(world: ChunkWorld, x: number, y: number, z: number): boolean {
  if (y < 0) return true;
  if (y >= WORLD_Y) return false;
  return isSolidTile(getTile(world, Math.floor(x), Math.floor(y), Math.floor(z)));
}
function blockedHoriz(world: ChunkWorld, x: number, y: number, z: number): boolean {
  return (
    solidAt(world, x - HALF, y, z - HALF) ||
    solidAt(world, x + HALF, y, z - HALF) ||
    solidAt(world, x - HALF, y, z + HALF) ||
    solidAt(world, x + HALF, y, z + HALF) ||
    solidAt(world, x - HALF, y + 0.6, z - HALF) ||
    solidAt(world, x + HALF, y + 0.6, z + HALF)
  );
}

const GRAVITY = 22;
const WANDER_SPEED = 1.5;
const FOLLOW_SPEED = 3.2;

export function updateAnimal(a: Animal, dt: number, world: ChunkWorld, player: { x: number; y: number; z: number }): void {
  // --- decide a target heading + speed ---
  let speed = WANDER_SPEED;
  const dpx = player.x - a.x;
  const dpz = player.z - a.z;
  const distToPlayer = Math.hypot(dpx, dpz);

  if (a.tamed && distToPlayer > 2.4) {
    a.heading = Math.atan2(dpx, dpz);
    speed = distToPlayer > 6 ? FOLLOW_SPEED : WANDER_SPEED;
    if (distToPlayer > 22) {
      // teleport a stuck pet back to the player
      a.x = player.x + (Math.random() - 0.5) * 2;
      a.z = player.z + (Math.random() - 0.5) * 2;
      a.y = player.y;
    }
  } else if (a.tamed) {
    speed = 0; // sit near the player
  } else {
    a.headingTimer -= dt;
    if (a.headingTimer <= 0) {
      a.heading += (Math.random() - 0.5) * 2.4;
      a.headingTimer = 1.5 + Math.random() * 3.5;
      if (Math.random() < 0.25) speed = 0; // pause
    }
  }

  // --- horizontal move with wall / ledge avoidance ---
  if (speed > 0) {
    const mvx = Math.sin(a.heading) * speed * dt;
    const mvz = Math.cos(a.heading) * speed * dt;
    const feetY = a.y + 0.1;
    const nx = a.x + mvx;
    const nz = a.z + mvz;
    let moved = false;
    if (!blockedHoriz(world, nx, feetY, a.z)) {
      // ledge check: don't stroll off a >2-block drop (tamed pets are allowed to)
      const groundOk = a.tamed || solidAt(world, nx, a.y - 1.2, a.z) || solidAt(world, nx, a.y - 0.2, a.z);
      if (groundOk) {
        a.x = nx;
        moved = true;
      }
    }
    if (!blockedHoriz(world, a.x, feetY, nz)) {
      const groundOk = a.tamed || solidAt(world, a.x, a.y - 1.2, nz) || solidAt(world, a.x, a.y - 0.2, nz);
      if (groundOk) {
        a.z = nz;
        moved = true;
      }
    }
    if (!moved && !a.tamed) a.heading += 1.6; // turn away from the obstacle
    // hop up a single step
    if (!moved && a.grounded && blockedHoriz(world, a.x + Math.sin(a.heading) * 0.4, feetY, a.z + Math.cos(a.heading) * 0.4)) {
      if (!blockedHoriz(world, a.x, a.y + 1.1, a.z)) a.vy = 6;
    }
    a.yaw += ((a.heading - a.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
  }

  // --- gravity + ground snap ---
  a.vy -= GRAVITY * dt;
  if (a.vy < -24) a.vy = -24;
  const ny = a.y + a.vy * dt;
  const footSolid = solidAt(world, a.x, ny, a.z) || solidAt(world, a.x - HALF, ny, a.z - HALF) || solidAt(world, a.x + HALF, ny, a.z + HALF);
  if (a.vy <= 0 && footSolid) {
    a.y = Math.ceil(ny);
    a.vy = 0;
    a.grounded = true;
  } else if (a.vy > 0 && solidAt(world, a.x, a.y + HEIGHT + a.vy * dt, a.z)) {
    a.vy = 0;
  } else {
    a.y = ny;
    a.grounded = false;
  }
  if (a.y < -8) {
    a.x = player.x + (Math.random() - 0.5) * 3;
    a.z = player.z + (Math.random() - 0.5) * 3;
    a.y = player.y + 1;
    a.vy = 0;
  }

  // --- sync mesh ---
  a.group.position.set(a.x, a.y, a.z);
  a.group.rotation.y = a.yaw;
  const hurt = performance.now() < a.hurtUntil;
  a.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshLambertMaterial;
      m.emissive.setHex(hurt ? 0x661111 : 0x000000);
    }
  });
}

export function disposeAnimal(a: Animal): void {
  a.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

/** AABB test used for hitting / taming the animal you're looking at. Padded generously so
 * a rough aim from standing height still connects (kid-friendly). */
export function rayHitsAnimal(a: Animal, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): boolean {
  const pad = 0.22;
  const min = new THREE.Vector3(a.x - HALF - pad, a.y - 0.1, a.z - HALF - pad);
  const max = new THREE.Vector3(a.x + HALF + pad, a.y + HEIGHT + 0.55, a.z + HALF + pad);
  let tmin = 0;
  let tmax = maxDist;
  for (const ax of ['x', 'y', 'z'] as const) {
    const o = origin[ax];
    const d = dir[ax];
    if (Math.abs(d) < 1e-8) {
      if (o < min[ax] || o > max[ax]) return false;
    } else {
      let t1 = (min[ax] - o) / d;
      let t2 = (max[ax] - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
