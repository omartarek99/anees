import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Topbar } from '../components/Topbar';
import {
  WORLD_X,
  WORLD_Y,
  WORLD_Z,
  AIR,
  GRASS,
  DIRT,
  STONE,
  WOOD,
  LEAVES,
  RUNE,
  RUNEBLOCK,
  BEDROCK,
  AXE,
  AXE_CHOP_MULTIPLIER,
  AXE_RECIPE_WOOD_COST,
  TILE_INFO,
  HOTBAR_ORDER,
  idx,
  getTile,
  genWorld,
  spawnPoint,
  type CraftWorld,
} from '../lib/craftWorld';
import { buildBlockMaterials } from '../lib/craftTextures';

const GRAVITY = 24;
const MOVE_SPEED = 4.3;
const JUMP_V = 8;
const REACH = 5.3;
const PLAYER_HW = 0.3;
const PLAYER_HEIGHT = 1.75;
const EYE_HEIGHT = 1.6;
const SAVE_INTERVAL_MS = 6000;
const ALL_TILE_IDS = [GRASS, DIRT, STONE, WOOD, LEAVES, RUNE, RUNEBLOCK, BEDROCK];

const SWATCH: Record<number, string> = {
  [GRASS]: '#5fa83d',
  [DIRT]: '#7a5230',
  [STONE]: '#9a9aa2',
  [WOOD]: '#8a5a30',
  [LEAVES]: '#4c9a3c',
  [RUNE]: '#6a5acd',
  [RUNEBLOCK]: '#f0a83a',
  [BEDROCK]: '#2c2a30',
  [AXE]: '#c9a24b',
};

type Player3D = { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; pitch: number; grounded: boolean };
type Mining3D = { x: number; y: number; z: number; start: number; dur: number; id: number };
type InstanceGroup = { mesh: THREE.InstancedMesh; coords: [number, number, number][] };
type ReticleHit = { x: number; y: number; z: number; nx: number; ny: number; nz: number };

type GameRef = {
  world: CraftWorld;
  seed: number;
  worldDiff: Map<string, number>;
  player: Player3D;
  mining: Mining3D | null;
  keys: Record<string, boolean>;
  touchMoveX: number;
  touchMoveY: number;
  touchJump: boolean;
  mineHeld: boolean;
  placeQueued: boolean;
  reticle: ReticleHit | null;
  selectedSlot: number;
  inventory: Record<string, number>;
  dirty: boolean;
  saving: boolean;
  locked: boolean;
};

type PuzzleModal = {
  kind: 'rune' | 'practice';
  x?: number;
  y?: number;
  z?: number;
  puzzleId: string;
  question: string;
  choices: number[];
  xpReward: number;
  phase: 'asking' | 'result';
  chosen?: number;
  correct?: boolean;
  correctAnswer?: number;
};

function emptyInventory(): Record<string, number> {
  return Object.fromEntries(HOTBAR_ORDER.map((id) => [String(id), 0]));
}

export function CraftPage() {
  const { refreshUser } = useAuth();
  const { t, lang } = useLanguage();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameRef | null>(null);
  const rebuildRef = useRef<() => void>(() => {});
  const puzzleOpenRef = useRef(false);
  const introOpenRef = useRef(false);
  const attemptLockRef = useRef<() => void>(() => {});

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [introOpen, setIntroOpenState] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [inventory, setInventory] = useState<Record<string, number>>(emptyInventory);
  const [puzzle, setPuzzle] = useState<PuzzleModal | null>(null);
  const [puzzleBusy, setPuzzleBusy] = useState(false);
  const [showTouch, setShowTouch] = useState(false);
  const [locked, setLocked] = useState(false);
  // Some browser contexts (embedded frames, certain security policies) silently refuse
  // pointer lock — no error is guaranteed, so this flips on a timeout too. When it does,
  // mouse-look falls back to drag-to-look (reusing the same layer built for touch) instead
  // of leaving the camera stuck.
  const [pointerLockUnavailable, setPointerLockUnavailable] = useState(false);

  function exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function setIntroOpen(v: boolean) {
    introOpenRef.current = v;
    setIntroOpenState(v);
    if (v) exitLock();
  }

  // ---- initial load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{
          save: {
            seed: number;
            worldDiff: Record<string, number>;
            inventory: Record<string, number>;
            playerX: number;
            playerY: number;
            playerZ: number;
          } | null;
        }>('/craft');
        if (cancelled) return;

        let seed: number;
        let diffEntries: [string, number][] = [];
        let inv = emptyInventory();
        let px: number, py: number, pz: number;
        let firstTime = false;

        if (data.save) {
          seed = data.save.seed;
          diffEntries = Object.entries(data.save.worldDiff);
          inv = { ...emptyInventory(), ...data.save.inventory };
          px = data.save.playerX;
          py = data.save.playerY;
          pz = data.save.playerZ;
        } else {
          seed = Math.floor(Math.random() * 1e9);
          const spawn = spawnPoint(genWorld(seed));
          px = spawn.x;
          py = spawn.y;
          pz = spawn.z;
          firstTime = true;
        }

        const world = genWorld(seed);
        const worldDiff = new Map<string, number>();
        for (const [key, val] of diffEntries) {
          const [x, y, z] = key.split(',').map(Number);
          world.tiles[idx(x, y, z)] = val;
          worldDiff.set(key, val);
        }

        gameRef.current = {
          world,
          seed,
          worldDiff,
          player: { x: px, y: py, z: pz, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: -0.15, grounded: false },
          mining: null,
          keys: {},
          touchMoveX: 0,
          touchMoveY: 0,
          touchJump: false,
          mineHeld: false,
          placeQueued: false,
          reticle: null,
          selectedSlot: 0,
          inventory: inv,
          dirty: false,
          saving: false,
          locked: false,
        };
        setInventory(inv);
        setShowTouch(window.matchMedia('(pointer: coarse)').matches);
        if (firstTime) setIntroOpen(true);
        setReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? translateApiError(lang, err.message) : t('craft.loadError'));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- three.js engine (runs once data is ready) ----
  useEffect(() => {
    if (!ready) return;
    const game = gameRef.current!;
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const world = game.world;

    const scene = new THREE.Scene();
    const sky = new THREE.Color(0xbcd9f0);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky.getHex(), 16, 40);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 60);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
    sun.position.set(30, 60, 20);
    scene.add(sun);

    const cubeGeom = new THREE.BoxGeometry(1, 1, 1);
    // Pixel-art canvas textures per block type (grass/wood use a different texture per face).
    const blockMaterials = buildBlockMaterials();
    const materials = blockMaterials.materials;

    const instances = new Map<number, InstanceGroup>();
    const dummy = new THREE.Object3D();

    function neighborOpen(x: number, y: number, z: number): boolean {
      if (x < 0 || x >= WORLD_X || z < 0 || z >= WORLD_Z) return true;
      if (y < 0) return false;
      if (y >= WORLD_Y) return true;
      return world.tiles[idx(x, y, z)] === AIR;
    }

    function rebuildAllInstances() {
      const grouped = new Map<number, [number, number, number][]>();
      for (let y = 0; y < WORLD_Y; y++) {
        for (let z = 0; z < WORLD_Z; z++) {
          for (let x = 0; x < WORLD_X; x++) {
            const id = world.tiles[idx(x, y, z)];
            if (id === AIR) continue;
            if (!neighborOpen(x + 1, y, z) && !neighborOpen(x - 1, y, z) && !neighborOpen(x, y + 1, z) && !neighborOpen(x, y - 1, z) && !neighborOpen(x, y, z + 1) && !neighborOpen(x, y, z - 1)) {
              continue;
            }
            let list = grouped.get(id);
            if (!list) {
              list = [];
              grouped.set(id, list);
            }
            list.push([x, y, z]);
          }
        }
      }

      for (const id of ALL_TILE_IDS) {
        const coords = grouped.get(id) ?? [];
        let group = instances.get(id);
        if (coords.length === 0) {
          if (group) {
            scene.remove(group.mesh);
            group.mesh.dispose();
            instances.delete(id);
          }
          continue;
        }
        if (!group || group.mesh.instanceMatrix.count < coords.length) {
          if (group) {
            scene.remove(group.mesh);
            group.mesh.dispose();
          }
          const capacity = Math.ceil(coords.length * 1.3) + 24;
          const mesh = new THREE.InstancedMesh(cubeGeom, materials[id], capacity);
          mesh.frustumCulled = false;
          scene.add(mesh);
          group = { mesh, coords: [] };
          instances.set(id, group);
        }
        group.coords = coords;
        for (let i = 0; i < coords.length; i++) {
          const [x, y, z] = coords[i];
          dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
          dummy.updateMatrix();
          group.mesh.setMatrixAt(i, dummy.matrix);
        }
        group.mesh.count = coords.length;
        group.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    rebuildRef.current = rebuildAllInstances;
    rebuildAllInstances();

    function resize() {
      const rect = wrap.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- physics ----
    function isSolidAt(x: number, y: number, z: number): boolean {
      if (x < 0 || x >= WORLD_X || z < 0 || z >= WORLD_Z) return true;
      if (y < 0) return true;
      if (y >= WORLD_Y) return false;
      return getTile(world, Math.floor(x), Math.floor(y), Math.floor(z)) !== AIR;
    }
    function boxCollides(px: number, py: number, pz: number): boolean {
      const x0 = Math.floor(px - PLAYER_HW);
      const x1 = Math.floor(px + PLAYER_HW);
      const z0 = Math.floor(pz - PLAYER_HW);
      const z1 = Math.floor(pz + PLAYER_HW);
      const y0 = Math.floor(py);
      const y1 = Math.floor(py + PLAYER_HEIGHT - 0.02);
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (isSolidAt(x, y, z)) return true;
      return false;
    }
    function overlapsPlayerVoxel(vx: number, vy: number, vz: number): boolean {
      const p = game.player;
      return !(p.x + PLAYER_HW <= vx || p.x - PLAYER_HW >= vx + 1 || p.z + PLAYER_HW <= vz || p.z - PLAYER_HW >= vz + 1 || p.y + PLAYER_HEIGHT <= vy || p.y >= vy + 1);
    }

    const forwardVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();
    const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    function updatePhysics(dt: number) {
      const p = game.player;
      lookEuler.set(0, p.yaw, 0);
      forwardVec.set(0, 0, -1).applyEuler(lookEuler);
      rightVec.set(1, 0, 0).applyEuler(lookEuler);

      let mz = 0;
      let mx = 0;
      if (game.keys['KeyW'] || game.keys['ArrowUp']) mz += 1;
      if (game.keys['KeyS'] || game.keys['ArrowDown']) mz -= 1;
      if (game.keys['KeyD'] || game.keys['ArrowRight']) mx += 1;
      if (game.keys['KeyA'] || game.keys['ArrowLeft']) mx -= 1;
      mx += game.touchMoveX;
      mz -= game.touchMoveY;
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }

      const velX = (forwardVec.x * mz + rightVec.x * mx) * MOVE_SPEED;
      const velZ = (forwardVec.z * mz + rightVec.z * mx) * MOVE_SPEED;

      p.vy -= GRAVITY * dt;
      if (p.vy < -20) p.vy = -20;
      if ((game.keys['Space'] || game.touchJump) && p.grounded) {
        p.vy = JUMP_V;
        p.grounded = false;
      }

      const nx = p.x + velX * dt;
      if (!boxCollides(nx, p.y, p.z)) p.x = nx;
      const nz = p.z + velZ * dt;
      if (!boxCollides(p.x, p.y, nz)) p.z = nz;

      const ny = p.y + p.vy * dt;
      if (!boxCollides(p.x, ny, p.z)) {
        p.y = ny;
        p.grounded = false;
      } else {
        if (p.vy < 0) {
          p.y = Math.ceil(ny);
          p.grounded = true;
        } else if (p.vy > 0) {
          p.y = Math.floor(ny + PLAYER_HEIGHT) - PLAYER_HEIGHT;
        }
        p.vy = 0;
      }

      if (p.y < -10) {
        const spawn = spawnPoint(world);
        p.x = spawn.x;
        p.y = spawn.y;
        p.z = spawn.z;
        p.vy = 0;
      }
    }

    // ---- raycasting / mining / placing ----
    const raycaster = new THREE.Raycaster();
    raycaster.far = REACH;
    const centerNDC = new THREE.Vector2(0, 0);

    function updateReticle() {
      raycaster.setFromCamera(centerNDC, camera);
      const meshes: THREE.InstancedMesh[] = [];
      const idByMesh = new Map<THREE.InstancedMesh, number>();
      instances.forEach((g, id) => {
        meshes.push(g.mesh);
        idByMesh.set(g.mesh, id);
      });
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0 && hits[0].instanceId !== undefined && hits[0].object instanceof THREE.InstancedMesh) {
        const hit = hits[0];
        const id = idByMesh.get(hit.object as THREE.InstancedMesh)!;
        const group = instances.get(id)!;
        const [x, y, z] = group.coords[hit.instanceId!];
        const n = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
        game.reticle = { x, y, z, nx: Math.round(n.x), ny: Math.round(n.y), nz: Math.round(n.z) };
      } else {
        game.reticle = null;
      }
    }

    function syncInventoryUI() {
      setInventory({ ...game.inventory });
    }

    function spawnBurst(x: number, y: number, z: number, color: string) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
      const bits: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geo, mat.clone());
        m.position.set(x + 0.5, y + 0.5, z + 0.5);
        group.add(m);
        bits.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 2.6 + 0.6, (Math.random() - 0.5) * 2.4) });
      }
      scene.add(group);
      const startT = performance.now();
      function anim() {
        const t = (performance.now() - startT) / 500;
        if (t >= 1) {
          scene.remove(group);
          group.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              (o.material as THREE.Material).dispose();
            }
          });
          return;
        }
        for (const b of bits) {
          b.vel.y -= 5 * 0.016;
          b.mesh.position.addScaledVector(b.vel, 0.016);
          (b.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        }
        requestAnimationFrame(anim);
      }
      anim();
    }

    function completeMining() {
      const m = game.mining!;
      game.mining = null;
      if (m.id === RUNE) {
        puzzleOpenRef.current = true;
        exitLock();
        void requestRunePuzzle(m.x, m.y, m.z);
        return;
      }
      world.tiles[idx(m.x, m.y, m.z)] = AIR;
      game.worldDiff.set(`${m.x},${m.y},${m.z}`, AIR);
      game.dirty = true;
      game.inventory[String(m.id)] = (game.inventory[String(m.id)] || 0) + 1;
      syncInventoryUI();
      spawnBurst(m.x, m.y, m.z, SWATCH[m.id] ?? '#999');
      rebuildAllInstances();
    }

    function holdingAxe(): boolean {
      return HOTBAR_ORDER[game.selectedSlot] === AXE && (game.inventory[String(AXE)] || 0) > 0;
    }

    function updateMining() {
      const target = game.reticle;
      if (game.mineHeld && target) {
        if (!game.mining || game.mining.x !== target.x || game.mining.y !== target.y || game.mining.z !== target.z) {
          const id = getTile(world, target.x, target.y, target.z);
          if (id !== AIR && id !== BEDROCK) {
            let dur = TILE_INFO[id].mineMs;
            if ((id === WOOD || id === LEAVES) && holdingAxe()) dur *= AXE_CHOP_MULTIPLIER;
            game.mining = { x: target.x, y: target.y, z: target.z, start: performance.now(), dur, id };
          } else game.mining = null;
        }
      } else {
        game.mining = null;
      }
      if (game.mining) {
        const prog = (performance.now() - game.mining.start) / game.mining.dur;
        if (prog >= 1) completeMining();
      }
    }

    function tryPlace() {
      const target = game.reticle;
      if (!target) return;
      const px = target.x + target.nx;
      const py = target.y + target.ny;
      const pz = target.z + target.nz;
      if (px < 0 || px >= WORLD_X || py < 0 || py >= WORLD_Y || pz < 0 || pz >= WORLD_Z) return;
      if (getTile(world, px, py, pz) !== AIR) return;
      if (overlapsPlayerVoxel(px, py, pz)) return;
      const placeId = HOTBAR_ORDER[game.selectedSlot];
      if (placeId === AXE) return; // a tool, not a placeable block
      if ((game.inventory[String(placeId)] || 0) <= 0) return;
      world.tiles[idx(px, py, pz)] = placeId;
      game.worldDiff.set(`${px},${py},${pz}`, placeId);
      game.inventory[String(placeId)] -= 1;
      game.dirty = true;
      syncInventoryUI();
      spawnBurst(px, py, pz, SWATCH[placeId] ?? '#999');
      rebuildAllInstances();
    }

    // ---- pointer lock (desktop) ----
    function attemptLock() {
      if (puzzleOpenRef.current || introOpenRef.current || showTouch) return;
      const result = canvas.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => setPointerLockUnavailable(true));
      }
      // Some contexts neither resolve/reject a promise nor fire `pointerlockerror` — if we
      // still aren't locked shortly after asking, treat lock as unsupported here rather than
      // leaving the camera permanently stuck with no way to look around.
      window.setTimeout(() => {
        if (document.pointerLockElement !== canvas) setPointerLockUnavailable(true);
      }, 400);
    }
    attemptLockRef.current = attemptLock;
    function onClickCanvas() {
      attemptLock();
    }
    function onPointerLockChange() {
      game.locked = document.pointerLockElement === canvas;
      setLocked(game.locked);
      if (game.locked) setPointerLockUnavailable(false);
    }
    function onPointerLockError() {
      setPointerLockUnavailable(true);
    }
    function onMouseMove(e: MouseEvent) {
      if (!game.locked) return;
      const p = game.player;
      p.yaw -= e.movementX * 0.0022;
      p.pitch -= e.movementY * 0.0022;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
    }
    function onMouseDown(e: MouseEvent) {
      if (!game.locked) return;
      if (e.button === 0) game.mineHeld = true;
      if (e.button === 2) tryPlace();
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) game.mineHeld = false;
    }
    function onContextMenu(e: Event) {
      e.preventDefault();
    }

    canvas.addEventListener('click', onClickCanvas);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    function onKeyDown(e: KeyboardEvent) {
      if (puzzleOpenRef.current || introOpenRef.current) return;
      game.keys[e.code] = true;
      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        const n = parseInt(e.code.slice(5), 10) - 1;
        if (n < HOTBAR_ORDER.length) {
          game.selectedSlot = n;
          setSelectedSlot(n);
        }
      }
      if (e.code === 'Space') e.preventDefault();
    }
    function onKeyUp(e: KeyboardEvent) {
      game.keys[e.code] = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ---- render loop ----
    let lastT = performance.now();
    let rafId = 0;
    function loop(tMs: number) {
      const dt = Math.min(0.033, (tMs - lastT) / 1000);
      lastT = tMs;
      if (!puzzleOpenRef.current && !introOpenRef.current) {
        updatePhysics(dt);
      }
      const p = game.player;
      camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(p.pitch, p.yaw, 0);
      // Raycasting needs this frame's fresh camera transform, but matrixWorld only
      // updates during renderer.render() — force it now so aim isn't a frame stale.
      camera.updateMatrixWorld();
      if (!puzzleOpenRef.current && !introOpenRef.current) {
        updateReticle();
        updateMining();
        if (game.placeQueued) {
          game.placeQueued = false;
          tryPlace();
        }
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    // ---- puzzle networking ----
    async function requestRunePuzzle(x: number, y: number, z: number) {
      try {
        const data = await api.post<{ puzzleId: string; question: string; choices: number[]; xpReward: number }>('/craft/puzzle');
        setPuzzle({ kind: 'rune', x, y, z, puzzleId: data.puzzleId, question: data.question, choices: data.choices, xpReward: data.xpReward, phase: 'asking' });
      } catch {
        puzzleOpenRef.current = false;
      }
    }

    // ---- autosave ----
    async function saveNow(force = false) {
      const g = gameRef.current;
      if (!g || g.saving || (!g.dirty && !force)) return;
      g.saving = true;
      try {
        await api.post('/craft/save', {
          seed: g.seed,
          worldDiff: Object.fromEntries(g.worldDiff),
          inventory: g.inventory,
          playerX: g.player.x,
          playerY: g.player.y,
          playerZ: g.player.z,
        });
        g.dirty = false;
        setSaveError(false);
      } catch {
        setSaveError(true);
      } finally {
        g.saving = false;
      }
    }
    const saveInterval = window.setInterval(() => saveNow(false), SAVE_INTERVAL_MS);
    function onVisibility() {
      if (document.visibilityState === 'hidden') void saveNow(true);
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('click', onClickCanvas);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(saveInterval);
      void saveNow(true);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      instances.forEach((g) => {
        g.mesh.dispose();
      });
      cubeGeom.dispose();
      blockMaterials.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ---- puzzle answer handling ----
  async function answerPuzzle(choiceVal: number) {
    if (!puzzle || puzzleBusy) return;
    setPuzzleBusy(true);
    try {
      const data = await api.post<{ correct: boolean; correctAnswer: number; xpEarned: number }>(`/craft/puzzle/${puzzle.puzzleId}/answer`, {
        choice: choiceVal,
      });
      setPuzzle((p) => (p ? { ...p, phase: 'result', chosen: choiceVal, correct: data.correct, correctAnswer: data.correctAnswer } : p));

      const g = gameRef.current;
      if (data.correct && g) {
        if (puzzle.kind === 'rune' && puzzle.x !== undefined && puzzle.y !== undefined && puzzle.z !== undefined) {
          g.world.tiles[idx(puzzle.x, puzzle.y, puzzle.z)] = AIR;
          g.worldDiff.set(`${puzzle.x},${puzzle.y},${puzzle.z}`, AIR);
          g.inventory[String(RUNEBLOCK)] = (g.inventory[String(RUNEBLOCK)] || 0) + 1;
          setInventory({ ...g.inventory });
          rebuildRef.current();
        }
        g.dirty = true;
        void refreshUser();
      }
      setTimeout(() => {
        setPuzzle(null);
        puzzleOpenRef.current = false;
      }, 1200);
    } catch {
      setPuzzle((p) => (p ? { ...p, phase: 'result', correct: false, correctAnswer: undefined } : p));
      setTimeout(() => {
        setPuzzle(null);
        puzzleOpenRef.current = false;
      }, 1200);
    } finally {
      setPuzzleBusy(false);
    }
  }

  function closePuzzle() {
    setPuzzle(null);
    puzzleOpenRef.current = false;
  }

  function selectSlot(i: number) {
    if (gameRef.current) gameRef.current.selectedSlot = i;
    setSelectedSlot(i);
  }

  const woodCount = inventory[String(WOOD)] ?? 0;
  const canCraftAxe = woodCount >= AXE_RECIPE_WOOD_COST;

  function craftAxe() {
    const g = gameRef.current;
    if (!g) return;
    const wood = g.inventory[String(WOOD)] || 0;
    if (wood < AXE_RECIPE_WOOD_COST) return;
    g.inventory[String(WOOD)] = wood - AXE_RECIPE_WOOD_COST;
    g.inventory[String(AXE)] = (g.inventory[String(AXE)] || 0) + 1;
    g.dirty = true;
    setInventory({ ...g.inventory });
    // Jump straight to the axe slot so the new tool is immediately equipped and usable.
    const axeSlot = HOTBAR_ORDER.indexOf(AXE);
    if (axeSlot !== -1) selectSlot(axeSlot);
  }

  async function openPracticePuzzle() {
    try {
      const data = await api.post<{ puzzleId: string; question: string; choices: number[]; xpReward: number }>('/craft/puzzle');
      puzzleOpenRef.current = true;
      exitLock();
      setPuzzle({ kind: 'practice', puzzleId: data.puzzleId, question: data.question, choices: data.choices, xpReward: data.xpReward, phase: 'asking' });
    } catch {
      /* transient network hiccup — user can just press the button again */
    }
  }

  function startFreshWorld() {
    setConfirmOpen(false);
    const g = gameRef.current;
    if (!g) return;
    const seed = Math.floor(Math.random() * 1e9);
    const world = genWorld(seed);
    const spawn = spawnPoint(world);
    g.world = world;
    g.seed = seed;
    g.worldDiff = new Map();
    g.inventory = emptyInventory();
    g.player.x = spawn.x;
    g.player.y = spawn.y;
    g.player.z = spawn.z;
    g.player.vy = 0;
    g.dirty = true;
    setInventory(emptyInventory());
    rebuildRef.current();
    void api.post('/craft/save', {
      seed,
      worldDiff: {},
      inventory: g.inventory,
      playerX: g.player.x,
      playerY: g.player.y,
      playerZ: g.player.z,
    });
  }

  const tileNameKey = (id: number) => TILE_INFO[id]?.nameKey ?? '';

  return (
    <div className="stack">
      <Topbar title={t('craft.title')} subtitle={t('craft.subtitle')} />

      {loadError && <div className="form-error-banner">{loadError}</div>}
      {saveError && !loadError && <div className="form-error-banner">{t('craft.saveError')}</div>}

      {!ready && !loadError && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}

      {ready && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex-between" style={{ padding: '16px 18px 0', flexWrap: 'wrap', gap: 8 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
              {showTouch ? t('craft.digHintTouch') : t('craft.moveHint')}
            </span>
            <div className="flex gap-sm">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIntroOpen(true)}>
                ❓ {t('craft.help')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmOpen(true)}>
                🔄 {t('craft.newWorld')}
              </button>
            </div>
          </div>

          <div
            ref={wrapRef}
            dir="ltr"
            style={{
              position: 'relative',
              height: 'min(58vh, 480px)',
              margin: '14px 18px',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-3d-sm)',
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', cursor: showTouch ? 'default' : 'crosshair', touchAction: 'none' }} />

            {/* crosshair */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 10,
                height: 10,
                marginLeft: -5,
                marginTop: -5,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,.85)',
                boxShadow: '0 0 2px rgba(0,0,0,.6)',
                pointerEvents: 'none',
              }}
            />

            {!showTouch && !locked && !pointerLockUnavailable && (
              <div
                onClick={() => attemptLockRef.current()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(24,35,56,.35)',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    background: 'rgba(245,247,251,.9)',
                    color: 'var(--ink)',
                    fontWeight: 800,
                    fontSize: 14,
                    padding: '10px 18px',
                    borderRadius: 'var(--radius-pill)',
                    boxShadow: 'var(--shadow-3d-md)',
                  }}
                >
                  {t('craft.clickToPlay')}
                </span>
              </div>
            )}

            {showTouch && (
              <>
                <LookDragLayer gameRef={gameRef} />
                <div style={{ position: 'absolute', left: 14, bottom: 14, zIndex: 2 }}>
                  <TouchJoystick
                    onChange={(x, y) => {
                      if (gameRef.current) {
                        gameRef.current.touchMoveX = x;
                        gameRef.current.touchMoveY = y;
                      }
                    }}
                  />
                </div>
                <div style={{ position: 'absolute', right: 14, bottom: 84, zIndex: 2 }}>
                  <TouchActionButton label="⤒" onDown={() => setTouchFlag(gameRef, 'touchJump', true)} onUp={() => setTouchFlag(gameRef, 'touchJump', false)} />
                </div>
                <div style={{ position: 'absolute', right: 84, bottom: 14, zIndex: 2 }}>
                  <TouchActionButton label="⛏" onDown={() => setMineHeld(gameRef, true)} onUp={() => setMineHeld(gameRef, false)} />
                </div>
                <div style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 2 }}>
                  <TouchActionButton label="🧱" onDown={() => queuePlace(gameRef)} onUp={() => {}} />
                </div>
              </>
            )}

            {/* Pointer lock isn't available in this browser/context (some embedded frames and
                security policies block it) — fall back to drag-to-look with on-screen dig/build
                buttons instead of leaving the camera unable to turn. Keyboard WASD still moves. */}
            {!showTouch && pointerLockUnavailable && (
              <>
                <LookDragLayer gameRef={gameRef} />
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 2,
                    background: 'rgba(24,35,56,.6)',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-pill)',
                    pointerEvents: 'none',
                  }}
                >
                  {t('craft.dragToLookHint')}
                </div>
                <div style={{ position: 'absolute', right: 84, bottom: 14, zIndex: 2 }}>
                  <TouchActionButton label="⛏" onDown={() => setMineHeld(gameRef, true)} onUp={() => setMineHeld(gameRef, false)} />
                </div>
                <div style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 2 }}>
                  <TouchActionButton label="🧱" onDown={() => queuePlace(gameRef)} onUp={() => {}} />
                </div>
              </>
            )}
          </div>

          <div className="pill-row" style={{ padding: '0 18px 18px', alignItems: 'center' }}>
            {HOTBAR_ORDER.map((id, i) => (
              <button
                key={id}
                type="button"
                className={`category-pill stat-card-blue${selectedSlot === i ? ' selected' : ''}`}
                style={{ width: 84 }}
                onClick={() => selectSlot(i)}
                title={t(tileNameKey(id))}
              >
                {id === AXE ? (
                  <span className="category-pill-icon">🪓</span>
                ) : (
                  <span className="category-pill-icon" style={{ background: SWATCH[id] }} />
                )}
                <span style={{ fontSize: 11 }}>
                  {t(tileNameKey(id))}
                  <br />
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>{inventory[String(id)] ?? 0}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flexShrink: 0, marginInlineStart: 6 }}
              onClick={craftAxe}
              disabled={!canCraftAxe}
              title={t('craft.craftAxeHint', { cost: AXE_RECIPE_WOOD_COST })}
            >
              {t('craft.craftAxeButton', { cost: AXE_RECIPE_WOOD_COST })}
            </button>
            <button type="button" className="btn btn-gold btn-sm" style={{ flexShrink: 0 }} onClick={openPracticePuzzle}>
              {t('craft.practicePuzzleButton')}
            </button>
          </div>
        </div>
      )}

      {/* Intro / help modal */}
      {introOpen && (
        <div className="modal-overlay" onClick={() => setIntroOpen(false)}>
          <div className="modal-panel text-center" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 20 }}>{t('craft.introTitle')}</h2>
            <p className="muted" style={{ marginBottom: 16 }}>
              {t('craft.introBody')}
            </p>
            <ul style={{ textAlign: 'start', paddingInlineStart: 20, fontWeight: 700, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.9, marginBottom: 18 }}>
              <li>{showTouch ? t('craft.introMoveTouch') : t('craft.introMove')}</li>
              <li>{showTouch ? t('craft.introDigTouch') : t('craft.introDig')}</li>
              <li>{showTouch ? t('craft.introBuildTouch') : t('craft.introBuild')}</li>
              <li>{t('craft.introAxe')}</li>
              <li>{t('craft.introRune')}</li>
            </ul>
            <button type="button" className="btn btn-primary" onClick={() => setIntroOpen(false)}>
              {t('craft.start')}
            </button>
          </div>
        </div>
      )}

      {/* New-world confirm modal */}
      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal-panel text-center" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17 }}>{t('craft.newWorldConfirmTitle')}</h2>
            <p className="muted" style={{ marginBottom: 18 }}>
              {t('craft.newWorldConfirmBody')}
            </p>
            <div className="flex gap-sm flex-center">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>
                {t('craft.keepWorld')}
              </button>
              <button type="button" className="btn btn-danger" onClick={startFreshWorld}>
                {t('craft.startFresh')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Puzzle modal */}
      {puzzle && (
        <div className="modal-overlay">
          <div className="modal-panel text-center" style={{ maxWidth: 420 }}>
            <span className={`badge ${puzzle.kind === 'rune' ? 'badge-maroon' : 'badge-gold'}`} style={{ marginBottom: 10 }}>
              {puzzle.kind === 'rune' ? t('craft.runePuzzleTag') : t('craft.practicePuzzleTag')}
            </span>
            <h2 style={{ fontSize: 30, margin: '8px 0 6px', fontVariantNumeric: 'tabular-nums' }}>{puzzle.question} = ?</h2>
            <p className="muted" style={{ marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
              {puzzle.kind === 'rune' ? t('craft.solveForRune', { xp: puzzle.xpReward }) : t('craft.solveForXp', { xp: puzzle.xpReward })}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
              {puzzle.choices.map((val) => {
                const isChosen = puzzle.chosen === val;
                const isCorrectChoice = puzzle.phase === 'result' && val === puzzle.correctAnswer;
                const isWrongChosen = puzzle.phase === 'result' && isChosen && !puzzle.correct;
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={puzzle.phase === 'result' || puzzleBusy}
                    className={`btn boss-choice-btn${isCorrectChoice ? ' boss-choice-correct' : ''}${isWrongChosen ? ' boss-choice-wrong' : ''}`}
                    style={{ justifyContent: 'center', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', minHeight: 56 }}
                    onClick={() => answerPuzzle(val)}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
            {puzzle.phase === 'result' && (
              <p style={{ fontWeight: 800, fontSize: 14, color: puzzle.correct ? 'var(--success)' : 'var(--danger)', marginTop: 10 }}>
                {puzzle.correct ? t('craft.correct', { xp: puzzle.xpReward }) : t('craft.incorrect', { answer: puzzle.correctAnswer ?? '' })}
              </p>
            )}
            {puzzle.phase === 'asking' && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={closePuzzle}>
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- touch helpers ----
type GameRefT = RefObject<GameRef | null>;

function setTouchFlag(ref: GameRefT, key: 'touchJump', val: boolean) {
  if (ref.current) ref.current[key] = val;
}
function setMineHeld(ref: GameRefT, val: boolean) {
  if (ref.current) ref.current.mineHeld = val;
}
function queuePlace(ref: GameRefT) {
  if (ref.current) ref.current.placeQueued = true;
}

function LookDragLayer({ gameRef }: { gameRef: GameRefT }) {
  const drag = useRef({ active: false, lastX: 0, lastY: 0 });
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 1, touchAction: 'none' }}
      onPointerDown={(e) => {
        drag.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!drag.current.active || !gameRef.current) return;
        const dx = e.clientX - drag.current.lastX;
        const dy = e.clientY - drag.current.lastY;
        drag.current.lastX = e.clientX;
        drag.current.lastY = e.clientY;
        const p = gameRef.current.player;
        p.yaw -= dx * 0.0055;
        p.pitch -= dy * 0.0055;
        p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
      }}
      onPointerUp={() => {
        drag.current.active = false;
      }}
      onPointerCancel={() => {
        drag.current.active = false;
      }}
    />
  );
}

function TouchJoystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);
  const center = useRef({ x: 0, y: 0 });
  const RADIUS = 38;

  function apply(clientX: number, clientY: number) {
    const dx = clientX - center.current.x;
    const dy = clientY - center.current.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, RADIUS);
    const nx = len ? (dx / len) * clamped : 0;
    const ny = len ? (dy / len) * clamped : 0;
    setKnob({ x: nx, y: ny });
    onChange(nx / RADIUS, ny / RADIUS);
  }

  return (
    <div
      ref={baseRef}
      style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        background: 'rgba(245,247,251,.55)',
        boxShadow: 'var(--shadow-3d-sm)',
        position: 'relative',
        touchAction: 'none',
        zIndex: 2,
      }}
      onPointerDown={(e) => {
        const rect = baseRef.current!.getBoundingClientRect();
        center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        active.current = true;
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current) apply(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        active.current = false;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
      }}
      onPointerCancel={() => {
        active.current = false;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 42,
          height: 42,
          borderRadius: '50%',
          background: 'rgba(24,35,56,.55)',
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
        }}
      />
    </div>
  );
}

function TouchActionButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'rgba(245,247,251,.8)',
        boxShadow: 'var(--shadow-3d-sm)',
        display: 'grid',
        placeItems: 'center',
        fontSize: 21,
        color: 'var(--ink)',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </div>
  );
}
