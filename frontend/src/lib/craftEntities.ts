// -------------------------------------------------------------------------------------------
// Animals of the Builder's Quarry at run time: spawning, wander / follow / swim / fly AI, and the
// hit test. What each species looks like and how it moves is DATA (lib/craftAnimals); this file is
// the generic behaviour that reads it. Every animal is one Mesh sharing its species' geometry and
// atlas, and animals far from the player barely update, so a crowded world stays cheap.
// -------------------------------------------------------------------------------------------
import * as THREE from 'three';
import { getTile, isSolidTile, WATER, WORLD_Y, type Biome, type ChunkWorld } from './craftWorld';
import { SPECIES_LIST, speciesOf } from './craftAnimals/registry';
import { createAnimalMesh, getAssets } from './craftAnimals/model';
import type { Pose } from './craftAnimals/rig';
import type { SpeciesSpec } from './craftAnimals/types';

export type AnimalKind = string;

export type Animal = {
  kind: AnimalKind;
  spec: SpeciesSpec;
  variant: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  heading: number; // wander direction (radians)
  headingTimer: number; // seconds until re-pick
  grounded: boolean;
  hp: number;
  tamed: boolean;
  hurtUntil: number; // perf.now() ms: brief red flash
  mesh: THREE.Mesh;
  pose: Pose;
  /** collision half-extent and model height, blocks */
  half: number;
  height: number;
  /** current horizontal speed, blocks/s */
  speed: number;
  /** seconds left standing still (grazing, resting) */
  pause: number;
  /** hop pacing / fliers' and swimmers' height-refresh timer */
  timer: number;
  /** height a flier or swimmer is heading for */
  goalY: number;
  /** water surface (swimmers) or ground (fliers) the goal is measured from */
  refY: number;
  /** time a swimmer has spent out of water */
  stranded: number;
  /** throttled-update accumulator for far animals */
  accum: number;
  /** speed of the current hop */
  hopSpeed: number;
  /** set when the animal should be removed (a fish stranded on land) */
  gone: boolean;
  disposeMesh: () => void;
};

const GRAVITY = 22;
const FOLLOW_SPEED = 3.2;
/** beyond this distance (blocks) from the player an animal is hidden and updates at ~4 Hz */
const SLEEP_DIST = 56;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function makeAnimal(kind: AnimalKind, x: number, y: number, z: number, variant?: number): Animal {
  const spec = speciesOf(kind);
  const assets = getAssets(spec);
  const nVar = Math.max(1, spec.variants ?? 1);
  const v = variant ?? Math.floor(Math.random() * nVar);
  const { mesh, pose, dispose } = createAnimalMesh(assets, v);
  mesh.position.set(x, y, z);
  const a: Animal = {
    kind: spec.kind,
    spec,
    variant: v,
    x,
    y,
    z,
    vy: 0,
    yaw: Math.random() * Math.PI * 2,
    heading: Math.random() * Math.PI * 2,
    headingTimer: rnd(0.5, 2.5),
    grounded: false,
    hp: spec.hp,
    tamed: false,
    hurtUntil: 0,
    mesh,
    pose,
    half: Math.min(0.5, Math.max(0.22, assets.radius * 0.8)),
    height: assets.height,
    speed: 0,
    pause: 0,
    timer: Math.random(),
    goalY: y,
    refY: y,
    stranded: 0,
    accum: 0,
    hopSpeed: 0,
    gone: false,
    disposeMesh: dispose,
  };
  mesh.rotation.y = a.yaw;
  return a;
}

function solidAt(world: ChunkWorld, x: number, y: number, z: number): boolean {
  if (y < 0) return true;
  if (y >= WORLD_Y) return false;
  return isSolidTile(getTile(world, Math.floor(x), Math.floor(y), Math.floor(z)));
}
function waterAt(world: ChunkWorld, x: number, y: number, z: number): boolean {
  if (y < 0 || y >= WORLD_Y) return false;
  return getTile(world, Math.floor(x), Math.floor(y), Math.floor(z)) === WATER;
}
function blockedHoriz(world: ChunkWorld, a: Animal, x: number, y: number, z: number): boolean {
  const h = a.half;
  const tall = Math.min(a.height * 0.85, 1.5);
  return (
    solidAt(world, x - h, y, z - h) ||
    solidAt(world, x + h, y, z - h) ||
    solidAt(world, x - h, y, z + h) ||
    solidAt(world, x + h, y, z + h) ||
    solidAt(world, x - h, y + 0.6, z - h) ||
    solidAt(world, x + h, y + 0.6, z + h) ||
    (tall > 0.9 && (solidAt(world, x - h, y + tall, z - h) || solidAt(world, x + h, y + tall, z + h)))
  );
}
const turnTo = (a: Animal, target: number, dt: number, rate = 8) => {
  a.yaw += (((target - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * rate);
};

/** is there water in the cell an animal at (x, y, z) would occupy, or in the next two cells below it (a step off a bank)? */
function waterAhead(world: ChunkWorld, x: number, y: number, z: number): boolean {
  return waterAt(world, x, y + 0.2, z) || waterAt(world, x, y - 0.6, z) || waterAt(world, x, y - 1.6, z);
}

/** gravity + landing for ground animals (and anything knocked out of its element) */
function fall(a: Animal, dt: number, world: ChunkWorld): void {
  if (a.spec.move !== 'swim' && waterAt(world, a.x, a.y + 0.4, a.z)) {
    // a land animal in water floats instead of resting on the lakebed
    a.vy = Math.min(2.5, Math.max(a.vy, -1.5) + 9 * dt);
    a.y += a.vy * dt;
    a.grounded = false;
    return;
  }
  a.vy -= GRAVITY * dt;
  if (a.vy < -24) a.vy = -24;
  const ny = a.y + a.vy * dt;
  const h = a.half;
  const footSolid = solidAt(world, a.x, ny, a.z) || solidAt(world, a.x - h, ny, a.z - h) || solidAt(world, a.x + h, ny, a.z + h);
  if (a.vy <= 0 && footSolid) {
    a.y = Math.ceil(ny);
    a.vy = 0;
    a.grounded = true;
  } else if (a.vy > 0 && solidAt(world, a.x, a.y + a.height + a.vy * dt, a.z)) {
    a.vy = 0;
  } else {
    a.y = ny;
    a.grounded = false;
  }
}

function stepGround(a: Animal, dt: number, world: ChunkWorld, player: { x: number; y: number; z: number }, dist: number): void {
  const spec = a.spec;
  const hopper = spec.move === 'hop';
  const wander = spec.speed;
  const follow = Math.max(FOLLOW_SPEED, wander * 2.2);
  let speed = wander;

  if (a.tamed && dist > 2.6) {
    a.heading = Math.atan2(player.x - a.x, player.z - a.z);
    speed = dist > 6 ? follow : wander;
    a.pause = 0;
    if (dist > 22) {
      // teleport a stuck pet back to the player
      a.x = player.x + (Math.random() - 0.5) * 2;
      a.z = player.z + (Math.random() - 0.5) * 2;
      a.y = player.y;
    }
  } else if (a.tamed) {
    speed = 0; // sit near the player
  } else if (a.pause > 0) {
    a.pause -= dt;
    speed = 0;
  } else {
    a.headingTimer -= dt;
    if (a.headingTimer <= 0) {
      a.heading += (Math.random() - 0.5) * 2.4;
      a.headingTimer = rnd(1.5, 5);
      if (Math.random() < 0.3) a.pause = rnd(1.5, 4.5);
    }
  }

  if (hopper) {
    a.timer -= dt;
    if (a.grounded && speed > 0 && a.timer <= 0) {
      a.vy = spec.hop ?? 6;
      a.hopSpeed = speed * 2.2;
      a.timer = rnd(0.35, 1.3);
    }
    speed = a.grounded ? 0 : a.hopSpeed;
  }
  a.speed = speed;

  if (speed > 0) {
    const mvx = Math.sin(a.heading) * speed * dt;
    const mvz = Math.cos(a.heading) * speed * dt;
    const feetY = a.y + 0.1;
    const wet = waterAt(world, a.x, a.y + 0.4, a.z); // already in water: any way out is fine
    const nx = a.x + mvx;
    const nz = a.z + mvz;
    let moved = false;
    if (!blockedHoriz(world, a, nx, feetY, a.z)) {
      // ledge check: don't stroll off a >2-block drop (tamed pets and hoppers mid-air are allowed to)
      const groundOk = a.tamed || hopper || solidAt(world, nx, a.y - 1.2, a.z) || solidAt(world, nx, a.y - 0.2, a.z);
      // and keep out of water: land animals do not swim
      if (groundOk && (wet || !waterAhead(world, nx, a.y, a.z))) {
        a.x = nx;
        moved = true;
      }
    }
    if (!blockedHoriz(world, a, a.x, feetY, nz)) {
      const groundOk = a.tamed || hopper || solidAt(world, a.x, a.y - 1.2, nz) || solidAt(world, a.x, a.y - 0.2, nz);
      if (groundOk && (wet || !waterAhead(world, a.x, a.y, nz))) {
        a.z = nz;
        moved = true;
      }
    }
    if (!moved && !a.tamed) a.heading += 1.6; // turn away from the obstacle
    // hop up a single step
    if (!moved && a.grounded && !hopper && blockedHoriz(world, a, a.x + Math.sin(a.heading) * 0.4, feetY, a.z + Math.cos(a.heading) * 0.4)) {
      if (!blockedHoriz(world, a, a.x, a.y + 1.1, a.z)) a.vy = 6;
    }
    turnTo(a, a.heading, dt);
  }
  fall(a, dt, world);
}

function stepSwim(a: Animal, dt: number, world: ChunkWorld): void {
  const spec = a.spec;
  const cy = a.y + a.height * 0.5;
  if (!waterAt(world, a.x, cy, a.z)) {
    // out of the water (the pond was dug away, or it spawned badly): flop about, then vanish
    a.stranded += dt;
    a.speed = 0;
    fall(a, dt, world);
    if (a.stranded > 6) a.gone = true;
    return;
  }
  a.stranded = 0;
  a.timer -= dt;
  if (a.timer <= 0) {
    // measure the water column: lakebed and surface, then pick a depth to hold
    const cx = Math.floor(a.x);
    const cz = Math.floor(a.z);
    let top = Math.floor(cy);
    for (let i = 0; i < 12 && waterAt(world, cx, top + 1, cz); i++) top++;
    let bottom = Math.floor(cy);
    for (let i = 0; i < 12 && waterAt(world, cx, bottom - 1, cz); i++) bottom--;
    const surface = top + 0.88;
    const [dMin, dMax] = spec.depth ?? [0.5, 3];
    const want = surface - rnd(dMin, dMax) - a.height;
    a.goalY = Math.max(bottom + 0.1, Math.min(surface - a.height - 0.1, want));
    a.timer = rnd(1, 3);
  }
  a.headingTimer -= dt;
  if (a.headingTimer <= 0) {
    a.heading += (Math.random() - 0.5) * 2.6;
    a.headingTimer = rnd(1.2, 4);
    a.pause = Math.random() < 0.15 ? rnd(0.5, 1.5) : 0;
  }
  a.pause = Math.max(0, a.pause - dt);
  const speed = a.pause > 0 ? 0 : spec.speed;
  a.speed = speed;
  if (speed > 0) {
    const nx = a.x + Math.sin(a.heading) * speed * dt;
    const nz = a.z + Math.cos(a.heading) * speed * dt;
    // stay inside the pond: the cell ahead (at the body's height) must be water
    if (waterAt(world, nx + Math.sin(a.heading) * 0.4, cy, nz + Math.cos(a.heading) * 0.4)) {
      a.x = nx;
      a.z = nz;
    } else {
      a.heading += Math.PI * rnd(0.6, 1.4);
      a.headingTimer = rnd(0.8, 2);
    }
    turnTo(a, a.heading, dt, 5);
  }
  const ny = a.y + (a.goalY - a.y) * Math.min(1, dt * 1.4);
  if (waterAt(world, a.x, ny + a.height * 0.5, a.z) && waterAt(world, a.x, ny + 0.05, a.z)) a.y = ny;
  a.vy = 0;
  a.grounded = false;
}

function stepAir(a: Animal, dt: number, world: ChunkWorld, player: { x: number; y: number; z: number }, dist: number): void {
  const spec = a.spec;
  const floater = spec.move === 'float';
  a.timer -= dt;
  if (a.timer <= 0) {
    // ground below, to hold a height above it
    let ground = Math.floor(a.y);
    for (let i = 0; i < 40 && ground > 1 && !solidAt(world, a.x, ground, a.z); i++) ground--;
    if (ground <= 1) {
      for (let g = Math.floor(a.y) + 1; g < WORLD_Y - 1 && !solidAt(world, a.x, g, a.z); g++) ground = g; // under the map? climb out
    }
    a.refY = ground + 1;
    const [lo, hi] = spec.altitude ?? [2, 6];
    a.goalY = a.refY + rnd(lo, hi);
    a.timer = rnd(0.7, 1.6);
  }
  let speed = spec.speed;
  let goalY = a.goalY;
  if (a.tamed && dist > 3.2) {
    a.heading = Math.atan2(player.x - a.x, player.z - a.z);
    speed = dist > 7 ? Math.max(spec.speed * 1.8, FOLLOW_SPEED) : spec.speed;
    goalY = player.y + 1.6 + Math.sin(performance.now() * 0.002 + a.x) * 0.5;
    if (dist > 28) {
      a.x = player.x + (Math.random() - 0.5) * 3;
      a.z = player.z + (Math.random() - 0.5) * 3;
      a.y = player.y + 2;
    }
  } else if (a.tamed) {
    speed = spec.speed * 0.3;
    goalY = player.y + 1.7 + Math.sin(performance.now() * 0.002 + a.x) * 0.5;
  } else {
    a.headingTimer -= dt;
    if (a.headingTimer <= 0) {
      // fliers dart about, floaters drift
      a.heading += (Math.random() - 0.5) * (floater ? 1.2 : 3.2);
      a.headingTimer = floater ? rnd(4, 9) : rnd(0.6, 2.4);
    }
  }
  a.speed = speed;
  const nx = a.x + Math.sin(a.heading) * speed * dt;
  const nz = a.z + Math.cos(a.heading) * speed * dt;
  const midY = a.y + a.height * 0.5;
  if (!solidAt(world, nx, midY, nz) && !solidAt(world, nx, a.y + a.height, nz)) {
    a.x = nx;
    a.z = nz;
  } else if (!a.tamed) {
    a.heading += Math.PI * rnd(0.5, 1.5);
  }
  turnTo(a, a.heading, dt, floater ? 2 : 6);
  const maxV = floater ? 1.4 : 3.2;
  const dy = Math.max(-maxV, Math.min(maxV, (goalY - a.y) * 1.2));
  const ny = a.y + dy * dt;
  if (!solidAt(world, a.x, ny + a.height + 0.1, a.z) && !solidAt(world, a.x, ny - 0.05, a.z)) a.y = ny;
  else if (solidAt(world, a.x, a.y - 0.05, a.z)) a.y += 2 * dt; // never sink into the ground
  a.vy = 0;
  a.grounded = false;
}

export function updateAnimal(a: Animal, dt: number, world: ChunkWorld, player: { x: number; y: number; z: number }): void {
  const dpx = player.x - a.x;
  const dpz = player.z - a.z;
  const dist = Math.hypot(dpx, dpz);
  if (!a.tamed && dist > SLEEP_DIST) {
    // out in the fog: hidden, thinks a few times a second
    a.mesh.visible = false;
    a.accum += dt;
    if (a.accum < 0.25) return;
    dt = Math.min(a.accum, 0.5);
    a.accum = 0;
  } else {
    a.mesh.visible = true;
  }

  switch (a.spec.move) {
    case 'swim':
      stepSwim(a, dt, world);
      break;
    case 'fly':
    case 'float':
      stepAir(a, dt, world, player, dist);
      break;
    default:
      stepGround(a, dt, world, player, dist);
  }
  if (a.y < -8) {
    a.x = player.x + (Math.random() - 0.5) * 3;
    a.z = player.z + (Math.random() - 0.5) * 3;
    a.y = player.y + 1;
    a.vy = 0;
  }

  // ---- pose: what the shader animates ----
  const p = a.pose;
  const now = performance.now();
  const moving = a.spec.move === 'hop' ? !a.grounded : a.speed > 0.05;
  const k = Math.min(1, dt * 8);
  p.k.x += ((moving ? 1 : 0) - p.k.x) * k;
  p.ph.x += dt * (4 + a.speed * 3) * (moving ? 1 : 0.2);
  const swims = a.spec.move === 'swim';
  const flies = a.spec.move === 'fly';
  p.k.y += ((flies || swims ? 1 : 0) - p.k.y) * k;
  p.ph.y += dt * (flies ? 24 : swims ? 5 + a.speed * 4 : 0);
  p.ph.z += dt * 1.7;
  p.ph.w += dt * (3 + a.speed * 2.5);
  const grazing = a.spec.graze && a.pause > 0 && a.grounded && !a.tamed;
  p.k.z += ((grazing ? 1 : 0) - p.k.z) * Math.min(1, dt * 4);
  p.k.w = now < a.hurtUntil ? 1 : 0;

  // ---- sync mesh ----
  const m = a.mesh;
  m.position.set(a.x, a.y, a.z);
  m.rotation.y = a.yaw;
  m.rotation.z = a.spec.shiver ? Math.sin(now * 0.045) * 0.05 : 0;
}

export function disposeAnimal(a: Animal): void {
  a.disposeMesh();
}

/** centre height of the animal's body, for aiming */
export const animalCenterY = (a: Animal) => a.y + a.height * 0.5;

/** AABB test used for hitting / taming the animal you're looking at. Padded generously so
 * a rough aim from standing height still connects (kid-friendly). */
export function rayHitsAnimal(a: Animal, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): boolean {
  const pad = 0.22;
  const r = Math.max(a.half, 0.3);
  const min = new THREE.Vector3(a.x - r - pad, a.y - 0.1, a.z - r - pad);
  const max = new THREE.Vector3(a.x + r + pad, a.y + a.height + 0.15, a.z + r + pad);
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

// ---- choosing what to spawn ------------------------------------------------------------------------
export type SpawnSpot = { kind: 'land' | 'water' | 'air'; biome: Biome; waterDepth?: number };

/** A weighted random species that lives at this kind of spot, in this biome. */
export function pickSpecies(spot: SpawnSpot): SpeciesSpec | null {
  const pool: SpeciesSpec[] = [];
  let total = 0;
  for (const s of SPECIES_LIST) {
    const fits =
      spot.kind === 'land' ? s.move === 'walk' || s.move === 'hop' : spot.kind === 'water' ? s.move === 'swim' && (s.minWater ?? 1) <= (spot.waterDepth ?? 1) : s.move === 'fly' || s.move === 'float';
    if (!fits) continue;
    if (s.habitat.biomes && !s.habitat.biomes.includes(spot.biome)) continue;
    pool.push(s);
    total += s.habitat.weight;
  }
  if (!pool.length) return null;
  let r = Math.random() * total;
  for (const s of pool) {
    r -= s.habitat.weight;
    if (r <= 0) return s;
  }
  return pool[pool.length - 1];
}

export const animalName = (a: Animal | SpeciesSpec, lang: string): string => {
  const spec = 'spec' in a ? a.spec : a;
  return lang === 'ar' ? spec.name.ar : spec.name.en;
};
