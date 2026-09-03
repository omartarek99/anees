import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as THREE from 'three';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Topbar } from '../components/Topbar';
import { CraftMenu } from '../components/CraftMenu';
import {
  CHUNK,
  WORLD_Y,
  AIR,
  RUNE,
  RUNEBLOCK,
  BEDROCK,
  TRANSPARENT,
  chunkKey,
  chunkCoord,
  lidx,
  worldKey,
  makeWorld,
  ensureChunk,
  dropChunk,
  getTile,
  setTile,
  isSolidTile,
  spawnPoint,
  type ChunkWorld,
} from '../lib/craftWorld';
import {
  ITEM,
  RECIPES,
  BOTTLE,
  RAW_PORK,
  POTION_SECONDS,
  applyCraft,
  invCount,
  blockDrop,
  toolMineFactor,
  computeHotbar,
  type Inv,
  type PotionKind,
} from '../lib/craftItems';
import { buildBlockMaterials } from '../lib/craftTextures';
import { makeAnimal, updateAnimal, disposeAnimal, rayHitsAnimal, type Animal, type AnimalKind } from '../lib/craftEntities';

const GRAVITY = 24;
const MOVE_SPEED = 4.3;
const JUMP_V = 8;
const REACH = 5.3;
const PLAYER_HW = 0.3;
const PLAYER_HEIGHT = 1.75;
const EYE_HEIGHT = 1.6;
const SAVE_INTERVAL_MS = 6000;
const LOAD_RADIUS = 3; // chunks around the player kept meshed (endless streaming)
const FOG_NEAR = 20;
const FOG_FAR = 46;
const MAX_ANIMALS = 8;
const SAVE_VERSION = 2;

type Player3D = { x: number; y: number; z: number; vy: number; yaw: number; pitch: number; grounded: boolean; groundRefY: number };
type Mining3D = { x: number; y: number; z: number; elapsed: number; dur: number; id: number };
type ReticleHit = { x: number; y: number; z: number; nx: number; ny: number; nz: number; dist: number };
type Effects = { speed: number; jump: number; night: number }; // performance.now() expiry ms

type GameRef = {
  world: ChunkWorld;
  seed: number;
  player: Player3D;
  mining: Mining3D | null;
  keys: Record<string, boolean>;
  touchMoveX: number;
  touchMoveY: number;
  touchJump: boolean;
  mineHeld: boolean;
  minePrev: boolean;
  useQueued: boolean;
  reticle: ReticleHit | null;
  selectedSlot: number;
  hotbarIds: number[];
  inventory: Inv;
  hp: number;
  food: number;
  effects: Effects;
  animals: Animal[];
  hungerTimer: number;
  healTimer: number;
  spawnTimer: number;
  hitCooldown: number;
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

const glyph = (id: number) => ITEM[id]?.emoji ?? ITEM[id]?.label ?? '▪';

export function CraftPage() {
  const { refreshUser } = useAuth();
  const { t, lang } = useLanguage();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameRef | null>(null);
  const rebuildAllRef = useRef<() => void>(() => {});
  const rebuildChunkAtRef = useRef<(wx: number, wz: number) => void>(() => {});
  const puzzleOpenRef = useRef(false);
  const introOpenRef = useRef(false);
  const menuOpenRef = useRef(false);
  const attemptLockRef = useRef<() => void>(() => {});
  const openMenuRef = useRef<() => void>(() => {});

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [introOpen, setIntroOpenState] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpenState] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenBlocked, setFullscreenBlocked] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [craftPop, setCraftPop] = useState<{ n: number; label: string }>({ n: 0, label: '' });
  const [toast, setToast] = useState<{ n: number; text: string } | null>(null);
  const [inventory, setInventory] = useState<Inv>({});
  const [survival, setSurvival] = useState({ hp: 20, food: 20 });
  const [effectChips, setEffectChips] = useState<{ kind: PotionKind; secs: number }[]>([]);
  const [puzzle, setPuzzle] = useState<PuzzleModal | null>(null);
  const [puzzleBusy, setPuzzleBusy] = useState(false);
  const [showTouch, setShowTouch] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pointerLockUnavailable, setPointerLockUnavailable] = useState(false);

  const hotbarIds = useMemo(() => computeHotbar(inventory), [inventory]);
  useEffect(() => {
    if (gameRef.current) gameRef.current.hotbarIds = hotbarIds;
    setSelectedSlot((s) => Math.max(0, Math.min(s, hotbarIds.length - 1)));
  }, [hotbarIds]);

  function toastMsg(text: string) {
    setToast({ n: Date.now(), text });
  }

  function exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  const fsElement = () =>
    document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null;
  function exitFullscreen() {
    const d = document as unknown as { exitFullscreen?: () => Promise<void>; webkitExitFullscreen?: () => void };
    if (!fsElement()) return;
    (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(document);
  }
  function suspendImmersion() {
    exitLock();
    exitFullscreen();
  }
  function toggleFullscreen() {
    const el = wrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    if (!el) return;
    if (fsElement()) {
      exitFullscreen();
      return;
    }
    const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
    try {
      const p = req?.call(el);
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch {
      /* ignore */
    }
  }
  function setIntroOpen(v: boolean) {
    introOpenRef.current = v;
    setIntroOpenState(v);
    if (v) suspendImmersion();
  }
  function setMenuOpen(v: boolean) {
    menuOpenRef.current = v;
    setMenuOpenState(v);
    if (gameRef.current) setInventory({ ...gameRef.current.inventory }); // menu reads the live counts
    if (v) suspendImmersion();
  }
  openMenuRef.current = () => setMenuOpen(true);

  useEffect(() => {
    setFullscreenBlocked(document.fullscreenEnabled === false);
    const onChange = () => setIsFullscreen(!!fsElement());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // ---- initial load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{
          save: {
            version?: number;
            seed: number;
            worldDiff: Record<string, number>;
            inventory: Record<string, number>;
            playerX: number;
            playerY: number;
            playerZ: number;
            hp?: number;
            food?: number;
          } | null;
        }>('/craft');
        if (cancelled) return;

        const valid = data.save && data.save.version === SAVE_VERSION;
        const seed = valid ? data.save!.seed : Math.floor(Math.random() * 1e9);
        const diff = new Map<string, number>();
        if (valid) for (const [k, v] of Object.entries(data.save!.worldDiff)) diff.set(k, v);
        const world = makeWorld(seed, diff);
        const inv: Inv = valid ? { ...data.save!.inventory } : {};

        let spawn = spawnPoint(world);
        if (valid) spawn = { x: data.save!.playerX, y: data.save!.playerY, z: data.save!.playerZ };

        gameRef.current = {
          world,
          seed,
          player: { x: spawn.x, y: spawn.y, z: spawn.z, vy: 0, yaw: 0, pitch: -0.2, grounded: false, groundRefY: spawn.y },
          mining: null,
          keys: {},
          touchMoveX: 0,
          touchMoveY: 0,
          touchJump: false,
          mineHeld: false,
          minePrev: false,
          useQueued: false,
          reticle: null,
          selectedSlot: 0,
          hotbarIds: computeHotbar(inv),
          inventory: inv,
          hp: valid ? (data.save!.hp ?? 20) : 20,
          food: valid ? (data.save!.food ?? 20) : 20,
          effects: { speed: 0, jump: 0, night: 0 },
          animals: [],
          hungerTimer: 0,
          healTimer: 0,
          spawnTimer: 2,
          hitCooldown: 0,
          dirty: false,
          saving: false,
          locked: false,
        };
        setInventory(inv);
        setSurvival({ hp: gameRef.current.hp, food: gameRef.current.food });
        setShowTouch(window.matchMedia('(pointer: coarse)').matches);
        if (!valid) setIntroOpen(true);
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

  // ---- three.js engine ----
  useEffect(() => {
    if (!ready) return;
    const game = gameRef.current!;
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const world = game.world;

    const scene = new THREE.Scene();
    const sky = new THREE.Color(0xbcd9f0);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky.getHex(), FOG_NEAR, FOG_FAR);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, FOG_FAR + 28);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
    sun.position.set(40, 80, 20);
    scene.add(sun);

    const cubeGeom = new THREE.BoxGeometry(1, 1, 1);
    const blockMaterials = buildBlockMaterials();
    const materials = blockMaterials.materials;
    const dummy = new THREE.Object3D();

    // ---- chunk streaming renderer ----
    type ChunkRender = { groups: Map<number, { mesh: THREE.InstancedMesh; coords: number[] }> };
    const rendered = new Map<string, ChunkRender>();
    let pendingBuilds: string[] = [];
    let lastPcx = NaN;
    let lastPcz = NaN;

    function faceOpen(neighborId: number, selfId: number): boolean {
      if (neighborId === selfId) return false;
      return TRANSPARENT.has(neighborId);
    }

    function buildChunk(cx: number, cz: number) {
      const key = chunkKey(cx, cz);
      if (rendered.has(key)) disposeChunkRender(key);
      const chunk = ensureChunk(world, cx, cz);
      const ox = cx * CHUNK;
      const oz = cz * CHUNK;
      const groups = new Map<number, number[]>(); // id -> flat [x,y,z, x,y,z, ...]
      // Fast in-chunk neighbour read (uses the cached array + diff); cross-chunk falls back to getTile.
      const at = (lx: number, y: number, lz: number, wx: number, wz: number): number => {
        if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK && y >= 0 && y < WORLD_Y) {
          const d = world.diff.get(worldKey(wx, y, wz));
          return d !== undefined ? d : chunk[lidx(lx, y, lz)];
        }
        return getTile(world, wx, y, wz);
      };
      for (let y = 0; y < WORLD_Y; y++) {
        for (let lz = 0; lz < CHUNK; lz++) {
          for (let lx = 0; lx < CHUNK; lx++) {
            let id = chunk[lidx(lx, y, lz)];
            const wx = ox + lx;
            const wz = oz + lz;
            const d = world.diff.get(worldKey(wx, y, wz));
            if (d !== undefined) id = d;
            if (id === AIR || !materials[id]) continue;
            if (
              faceOpen(at(lx + 1, y, lz, wx + 1, wz), id) ||
              faceOpen(at(lx - 1, y, lz, wx - 1, wz), id) ||
              faceOpen(at(lx, y + 1, lz, wx, wz), id) ||
              faceOpen(at(lx, y - 1, lz, wx, wz), id) ||
              faceOpen(at(lx, y, lz + 1, wx, wz + 1), id) ||
              faceOpen(at(lx, y, lz - 1, wx, wz - 1), id)
            ) {
              let arr = groups.get(id);
              if (!arr) groups.set(id, (arr = []));
              arr.push(wx, y, wz);
            }
          }
        }
      }
      const cr: ChunkRender = { groups: new Map() };
      groups.forEach((flat, id) => {
        const n = flat.length / 3;
        const mesh = new THREE.InstancedMesh(cubeGeom, materials[id], n);
        mesh.frustumCulled = false;
        for (let i = 0; i < n; i++) {
          dummy.position.set(flat[i * 3] + 0.5, flat[i * 3 + 1] + 0.5, flat[i * 3 + 2] + 0.5);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
        cr.groups.set(id, { mesh, coords: flat });
      });
      rendered.set(key, cr);
    }

    function disposeChunkRender(key: string) {
      const cr = rendered.get(key);
      if (!cr) return;
      cr.groups.forEach((g) => {
        scene.remove(g.mesh);
        g.mesh.dispose();
      });
      rendered.delete(key);
    }

    function rebuildChunkAt(wx: number, wz: number) {
      const cx = chunkCoord(wx);
      const cz = chunkCoord(wz);
      if (rendered.has(chunkKey(cx, cz))) buildChunk(cx, cz);
      const lx = ((wx % CHUNK) + CHUNK) % CHUNK;
      const lz = ((wz % CHUNK) + CHUNK) % CHUNK;
      if (lx === 0 && rendered.has(chunkKey(cx - 1, cz))) buildChunk(cx - 1, cz);
      if (lx === CHUNK - 1 && rendered.has(chunkKey(cx + 1, cz))) buildChunk(cx + 1, cz);
      if (lz === 0 && rendered.has(chunkKey(cx, cz - 1))) buildChunk(cx, cz - 1);
      if (lz === CHUNK - 1 && rendered.has(chunkKey(cx, cz + 1))) buildChunk(cx, cz + 1);
    }

    function rebuildEverything() {
      [...rendered.keys()].forEach(disposeChunkRender);
      world.chunks.clear();
      pendingBuilds = [];
      lastPcx = NaN;
      lastPcz = NaN;
      updateStreaming(9); // nearest chunks now, the rest streamed over the next frames
    }
    rebuildAllRef.current = rebuildEverything;
    rebuildChunkAtRef.current = rebuildChunkAt;

    function updateStreaming(syncBudget: number | boolean = 1) {
      const p = game.player;
      const pcx = chunkCoord(p.x);
      const pcz = chunkCoord(p.z);
      const force = syncBudget !== 1;
      if (pcx !== lastPcx || pcz !== lastPcz || force) {
        lastPcx = pcx;
        lastPcz = pcz;
        const want = new Set<string>();
        for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
          for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
            if (dx * dx + dz * dz <= (LOAD_RADIUS + 0.35) ** 2) want.add(chunkKey(pcx + dx, pcz + dz));
          }
        }
        for (const k of [...rendered.keys()]) {
          if (!want.has(k)) {
            const [cx, cz] = k.split(',').map(Number);
            if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > LOAD_RADIUS) {
              disposeChunkRender(k);
              dropChunk(world, cx, cz);
            }
          }
        }
        pendingBuilds = [...want]
          .filter((k) => !rendered.has(k))
          .sort((a, b) => {
            const [ax, az] = a.split(',').map(Number);
            const [bx, bz] = b.split(',').map(Number);
            return (ax - pcx) ** 2 + (az - pcz) ** 2 - ((bx - pcx) ** 2 + (bz - pcz) ** 2);
          });
      }
      const budget = syncBudget === true ? 999 : syncBudget === false ? 1 : syncBudget;
      for (let i = 0; i < budget && pendingBuilds.length; i++) {
        const k = pendingBuilds.shift()!;
        const [cx, cz] = k.split(',').map(Number);
        buildChunk(cx, cz);
      }
    }

    function resize() {
      const rect = wrap.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // build the spawn neighbourhood synchronously so the player never falls through;
    // the rest of the view radius streams in over the next frames (fog hides the fill-in).
    updateStreaming(9);

    // ---- physics ----
    function solid(x: number, y: number, z: number): boolean {
      if (y < 0) return true;
      if (y >= WORLD_Y) return false;
      return isSolidTile(getTile(world, Math.floor(x), Math.floor(y), Math.floor(z)));
    }
    function boxCollides(px: number, py: number, pz: number): boolean {
      const x0 = Math.floor(px - PLAYER_HW);
      const x1 = Math.floor(px + PLAYER_HW);
      const z0 = Math.floor(pz - PLAYER_HW);
      const z1 = Math.floor(pz + PLAYER_HW);
      const y0 = Math.floor(py);
      const y1 = Math.floor(py + PLAYER_HEIGHT - 0.02);
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solid(x, y, z)) return true;
      return false;
    }
    function overlapsPlayerVoxel(vx: number, vy: number, vz: number): boolean {
      const p = game.player;
      return !(
        p.x + PLAYER_HW <= vx ||
        p.x - PLAYER_HW >= vx + 1 ||
        p.z + PLAYER_HW <= vz ||
        p.z - PLAYER_HW >= vz + 1 ||
        p.y + PLAYER_HEIGHT <= vy ||
        p.y >= vy + 1
      );
    }

    const forwardVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();
    const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    function updatePhysics(dt: number) {
      const p = game.player;
      const now = performance.now();
      const speedMul = game.effects.speed > now ? 1.45 : 1;
      const jumpMul = game.effects.jump > now ? 1.4 : 1;

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
      const spd = MOVE_SPEED * speedMul;
      const velX = (forwardVec.x * mz + rightVec.x * mx) * spd;
      const velZ = (forwardVec.z * mz + rightVec.z * mx) * spd;

      p.vy -= GRAVITY * dt;
      if (p.vy < -22) p.vy = -22;
      if ((game.keys['Space'] || game.touchJump) && p.grounded) {
        p.vy = JUMP_V * jumpMul;
        p.grounded = false;
      }

      const nx = p.x + velX * dt;
      if (!boxCollides(nx, p.y, p.z)) p.x = nx;
      const nz = p.z + velZ * dt;
      if (!boxCollides(p.x, p.y, nz)) p.z = nz;

      const wasGrounded = p.grounded;
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

      // fall damage on landing
      if (!wasGrounded && p.grounded) {
        const fell = p.groundRefY - p.y;
        if (fell > 3.6) {
          const dmg = Math.floor(fell - 3);
          game.hp = Math.max(0, game.hp - dmg);
          toastMsg(`💥 -${dmg}`);
        }
      }
      if (p.grounded) p.groundRefY = p.y;

      if (p.y < -12) {
        const s = spawnPoint(world, Math.round(p.x) + 0.5, Math.round(p.z) + 0.5);
        p.x = s.x;
        p.y = s.y;
        p.z = s.z;
        p.vy = 0;
        p.groundRefY = s.y;
      }
    }

    // ---- voxel raycast (DDA) ----
    const camDir = new THREE.Vector3();
    function raycastVoxel(): ReticleHit | null {
      camera.getWorldDirection(camDir);
      const ox = camera.position.x;
      const oy = camera.position.y;
      const oz = camera.position.z;
      let x = Math.floor(ox);
      let y = Math.floor(oy);
      let z = Math.floor(oz);
      const dx = camDir.x;
      const dy = camDir.y;
      const dz = camDir.z;
      const stepX = dx > 0 ? 1 : -1;
      const stepY = dy > 0 ? 1 : -1;
      const stepZ = dz > 0 ? 1 : -1;
      const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
      const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
      const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
      let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
      let tmy = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
      let tmz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      let dist = 0;
      const startX = x;
      const startY = y;
      const startZ = z;
      for (let i = 0; i < 96; i++) {
        if (!(x === startX && y === startY && z === startZ)) {
          const id = getTile(world, x, y, z);
          if (id !== AIR && id !== undefined) return { x, y, z, nx, ny, nz, dist };
        }
        if (tmx <= tmy && tmx <= tmz) {
          if (tmx > REACH) break;
          x += stepX;
          dist = tmx;
          tmx += tdx;
          nx = -stepX;
          ny = 0;
          nz = 0;
        } else if (tmy <= tmz) {
          if (tmy > REACH) break;
          y += stepY;
          dist = tmy;
          tmy += tdy;
          nx = 0;
          ny = -stepY;
          nz = 0;
        } else {
          if (tmz > REACH) break;
          z += stepZ;
          dist = tmz;
          tmz += tdz;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      }
      return null;
    }

    // ---- inventory / drops ----
    function syncInv() {
      setInventory({ ...game.inventory });
    }
    function addItem(id: number, n: number) {
      if (!id || n <= 0) return;
      game.inventory[String(id)] = invCount(game.inventory, id) + n;
    }
    function heldId(): number | undefined {
      return game.hotbarIds[game.selectedSlot];
    }
    function heldTool(): number | undefined {
      const h = heldId();
      return h !== undefined && ITEM[h]?.tool ? h : undefined;
    }

    function spawnBurst(x: number, y: number, z: number, color: string) {
      const grp = new THREE.Group();
      const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
      const bits: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
        m.position.set(x + 0.5, y + 0.5, z + 0.5);
        grp.add(m);
        bits.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 2.6 + 0.6, (Math.random() - 0.5) * 2.4) });
      }
      scene.add(grp);
      const start = performance.now();
      function anim() {
        const tt = (performance.now() - start) / 480;
        if (tt >= 1) {
          scene.remove(grp);
          grp.traverse((o) => o instanceof THREE.Mesh && (o.material as THREE.Material).dispose());
          geo.dispose();
          return;
        }
        for (const b of bits) {
          b.v.y -= 5 * 0.016;
          b.m.position.addScaledVector(b.v, 0.016);
          (b.m.material as THREE.MeshBasicMaterial).opacity = 1 - tt;
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
        suspendImmersion();
        void requestRunePuzzle(m.x, m.y, m.z);
        return;
      }
      setTile(world, m.x, m.y, m.z, AIR);
      game.dirty = true;
      const [dropId, dropN] = blockDrop(m.id, Math.random);
      addItem(dropId, dropN);
      syncInv();
      spawnBurst(m.x, m.y, m.z, ITEM[m.id]?.swatch ?? '#999');
      rebuildChunkAt(m.x, m.z);
    }

    function updateMining(dt: number) {
      // interact with an animal we're aiming at (closer than any block)
      if (game.mineHeld) {
        game.hitCooldown -= dt;
        const target = pickAnimal();
        if (target && game.hitCooldown <= 0) {
          const fresh = !game.minePrev;
          if (target.kind === 'pig') {
            game.hitCooldown = 0.4;
            const sword = ITEM[heldId() ?? -1]?.tool === 'sword';
            target.hp -= sword ? 4 : 2;
            target.hurtUntil = performance.now() + 240;
            target.vy = Math.max(target.vy, 2);
            camera.getWorldDirection(camDir);
            target.x += camDir.x * 0.35;
            target.z += camDir.z * 0.35;
            target.headingTimer = 0.4;
            spawnBurst(target.x - 0.5, target.y, target.z - 0.5, '#e06a7a');
            if (target.hp <= 0) killAnimal(target);
          } else if (fresh && !target.tamed) {
            target.tamed = true;
            game.hitCooldown = 0.5;
            toastMsg(`❤️ ${t('craft.tamed')}`);
          }
          game.minePrev = game.mineHeld;
          game.mining = null;
          return;
        }
      }
      game.minePrev = game.mineHeld;

      const r = game.reticle;
      if (game.mineHeld && r) {
        if (!game.mining || game.mining.x !== r.x || game.mining.y !== r.y || game.mining.z !== r.z) {
          const id = getTile(world, r.x, r.y, r.z);
          if (id !== AIR && id !== BEDROCK) {
            const base = id === RUNE ? 520 : ITEM[id]?.mineMs ?? 400;
            const dur = Math.max(60, base * toolMineFactor(heldTool(), id));
            game.mining = { x: r.x, y: r.y, z: r.z, elapsed: 0, dur, id };
          } else game.mining = null;
        }
      } else {
        game.mining = null;
      }
      if (game.mining) {
        game.mining.elapsed += dt * 1000;
        if (game.mining.elapsed >= game.mining.dur) completeMining();
      }
    }

    function placeBlock(id: number) {
      const r = game.reticle;
      if (!r) return;
      const px = r.x + r.nx;
      const py = r.y + r.ny;
      const pz = r.z + r.nz;
      if (py < 1 || py >= WORLD_Y) return;
      if (getTile(world, px, py, pz) !== AIR) return;
      if (overlapsPlayerVoxel(px, py, pz)) return;
      if (invCount(game.inventory, id) <= 0) return;
      setTile(world, px, py, pz, id);
      game.inventory[String(id)] = invCount(game.inventory, id) - 1;
      game.dirty = true;
      syncInv();
      spawnBurst(px, py, pz, ITEM[id]?.swatch ?? '#999');
      rebuildChunkAt(px, pz);
    }

    function eat(id: number) {
      if (invCount(game.inventory, id) <= 0) return;
      const def = ITEM[id];
      if (!def?.food) return;
      game.inventory[String(id)] = invCount(game.inventory, id) - 1;
      game.food = Math.min(20, game.food + def.food);
      game.dirty = true;
      syncInv();
      syncSurvival();
      toastMsg(`🍗 +${def.food}`);
    }
    function drink(id: number) {
      if (invCount(game.inventory, id) <= 0) return;
      const kind = ITEM[id]?.potion;
      if (!kind) return;
      game.inventory[String(id)] = invCount(game.inventory, id) - 1;
      addItem(BOTTLE, 1);
      if (kind === 'heal') {
        game.hp = Math.min(20, game.hp + 6);
        toastMsg('❤️ +6');
      } else {
        game.effects[kind] = performance.now() + POTION_SECONDS[kind] * 1000;
        toastMsg(`${ITEM[id].emoji ?? ''} ${POTION_SECONDS[kind]}s`);
      }
      game.dirty = true;
      syncInv();
      syncSurvival();
    }
    function useHeld() {
      const h = heldId();
      if (h === undefined) return;
      const def = ITEM[h];
      if (!def) return;
      if (def.kind === 'food') eat(h);
      else if (def.kind === 'potion') drink(h);
      else if (def.place) placeBlock(h);
    }

    // ---- survival tick ----
    function syncSurvival() {
      setSurvival({ hp: Math.round(game.hp), food: Math.round(game.food) });
    }
    function respawn() {
      game.hp = 20;
      game.food = 20;
      game.effects = { speed: 0, jump: 0, night: 0 };
      const s = spawnPoint(world);
      game.player.x = s.x;
      game.player.y = s.y;
      game.player.z = s.z;
      game.player.vy = 0;
      game.player.groundRefY = s.y;
      game.dirty = true;
      syncSurvival();
      toastMsg(`💫 ${t('craft.blackedOut')}`);
    }
    function survivalTick(dt: number) {
      game.hungerTimer += dt;
      if (game.hungerTimer >= 7) {
        game.hungerTimer = 0;
        if (game.food > 0) game.food -= 1;
        else game.hp -= 1;
        game.dirty = true;
        syncSurvival();
      }
      game.healTimer += dt;
      if (game.healTimer >= 4) {
        game.healTimer = 0;
        if (game.food >= 16 && game.hp < 20 && game.hp > 0) {
          game.hp = Math.min(20, game.hp + 1);
          syncSurvival();
        }
      }
      if (game.hp <= 0) respawn();
    }

    // ---- effects → lighting + HUD ----
    let effectSyncTimer = 0;
    function effectsTick(dt: number) {
      const now = performance.now();
      const night = game.effects.night > now;
      ambient.intensity = night ? 1.35 : 0.72;
      (scene.fog as THREE.Fog).far = night ? FOG_FAR + 26 : FOG_FAR;
      effectSyncTimer += dt;
      if (effectSyncTimer >= 0.5) {
        effectSyncTimer = 0;
        const chips: { kind: PotionKind; secs: number }[] = [];
        (['speed', 'jump', 'night'] as PotionKind[]).forEach((k) => {
          const exp = game.effects[k as 'speed' | 'jump' | 'night'];
          if (exp > now) chips.push({ kind: k, secs: Math.ceil((exp - now) / 1000) });
        });
        setEffectChips((prev) => (prev.length === chips.length && prev.every((c, i) => c.kind === chips[i].kind && c.secs === chips[i].secs) ? prev : chips));
      }
    }

    // ---- animals ----
    function pickAnimal(): Animal | null {
      camera.getWorldDirection(camDir);
      // don't hit an animal that's behind a block we're already aiming at
      const maxReach = Math.min(game.reticle ? game.reticle.dist + 0.4 : REACH, 3.9);
      let best: Animal | null = null;
      let bestD = maxReach;
      for (const a of game.animals) {
        if (!rayHitsAnimal(a, camera.position, camDir, maxReach)) continue;
        const d = Math.hypot(a.x - camera.position.x, a.y + 0.45 - camera.position.y, a.z - camera.position.z);
        if (d < bestD) {
          best = a;
          bestD = d;
        }
      }
      return best;
    }
    function killAnimal(a: Animal) {
      if (a.kind === 'pig') addItem(RAW_PORK, 2);
      spawnBurst(a.x - 0.5, a.y, a.z - 0.5, '#e06a7a');
      scene.remove(a.group);
      disposeAnimal(a);
      game.animals = game.animals.filter((x) => x !== a);
      syncInv();
    }
    function trySpawnAnimal() {
      if (game.animals.length >= MAX_ANIMALS) return;
      const keys = [...rendered.keys()];
      if (!keys.length) return;
      const p = game.player;
      const pcx = chunkCoord(p.x);
      const pcz = chunkCoord(p.z);
      const k = keys[(Math.random() * keys.length) | 0];
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) < 1) return; // not right on top of the player
      const wx = cx * CHUNK + ((Math.random() * CHUNK) | 0);
      const wz = cz * CHUNK + ((Math.random() * CHUNK) | 0);
      for (let y = WORLD_Y - 2; y > 4; y--) {
        const g = getTile(world, wx, y, wz);
        if (g !== AIR && !TRANSPARENT.has(g)) {
          if (getTile(world, wx, y + 1, wz) !== AIR || getTile(world, wx, y + 2, wz) !== AIR) return;
          const roll = Math.random();
          const kind: AnimalKind = roll < 0.46 ? 'pig' : roll < 0.73 ? 'dog' : 'cat';
          const a = makeAnimal(kind, wx + 0.5, y + 1.02, wz + 0.5);
          scene.add(a.group);
          game.animals.push(a);
          return;
        }
      }
    }
    function animalsTick(dt: number) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        game.spawnTimer = 6 + Math.random() * 5;
        if (Math.random() < 0.75) trySpawnAnimal();
      }
      const p = game.player;
      for (const a of [...game.animals]) {
        updateAnimal(a, dt, world, p);
        if (!a.tamed && Math.hypot(a.x - p.x, a.z - p.z) > 92) {
          scene.remove(a.group);
          disposeAnimal(a);
          game.animals = game.animals.filter((x) => x !== a);
        }
      }
    }

    // ---- pointer lock / input ----
    function attemptLock() {
      if (puzzleOpenRef.current || introOpenRef.current || menuOpenRef.current || showTouch) return;
      const result = canvas.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => setPointerLockUnavailable(true));
      }
      window.setTimeout(() => {
        if (document.pointerLockElement !== canvas) setPointerLockUnavailable(true);
      }, 400);
    }
    attemptLockRef.current = attemptLock;
    const onClickCanvas = () => attemptLock();
    function onPointerLockChange() {
      game.locked = document.pointerLockElement === canvas;
      setLocked(game.locked);
      if (game.locked) setPointerLockUnavailable(false);
    }
    const onPointerLockError = () => setPointerLockUnavailable(true);
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
      if (e.button === 2) game.useQueued = true;
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) game.mineHeld = false;
    }
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('click', onClickCanvas);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    function onKeyDown(e: KeyboardEvent) {
      if (puzzleOpenRef.current || introOpenRef.current) return;
      if ((e.code === 'KeyF' || e.code === 'KeyC') && !menuOpenRef.current) {
        openMenuRef.current();
        return;
      }
      if (e.code === 'Escape' && menuOpenRef.current) {
        setMenuOpen(false);
        return;
      }
      if (menuOpenRef.current) return;
      game.keys[e.code] = true;
      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        const n = parseInt(e.code.slice(5), 10) - 1;
        if (n < game.hotbarIds.length) {
          game.selectedSlot = n;
          setSelectedSlot(n);
        }
      }
      if (e.code === 'KeyG') game.useQueued = true;
      if (e.code === 'Space') e.preventDefault();
    }
    const onKeyUp = (e: KeyboardEvent) => {
      game.keys[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ---- render loop ----
    let lastT = performance.now();
    let rafId = 0;
    function loop(tMs: number) {
      const dt = Math.min(0.033, (tMs - lastT) / 1000);
      lastT = tMs;
      const active = !puzzleOpenRef.current && !introOpenRef.current && !menuOpenRef.current;
      if (active) {
        updatePhysics(dt);
        survivalTick(dt);
        effectsTick(dt);
      }
      const p = game.player;
      camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(p.pitch, p.yaw, 0);
      camera.updateMatrixWorld();
      updateStreaming();
      if (active) {
        animalsTick(dt);
        game.reticle = raycastVoxel();
        updateMining(dt);
        if (game.useQueued) {
          game.useQueued = false;
          useHeld();
        }
      } else {
        for (const a of game.animals) a.group.position.set(a.x, a.y, a.z);
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    if (import.meta.env.DEV) {
      // Dev-only handle for driving the sim deterministically in tests (the preview pane
      // throttles requestAnimationFrame, so real-time play can't be exercised there).
      (window as unknown as { __craft?: unknown }).__craft = {
        game,
        step(n = 1, dt = 1 / 30) {
          for (let i = 0; i < n; i++) {
            updatePhysics(dt);
            survivalTick(dt);
            effectsTick(dt);
            camera.position.set(game.player.x, game.player.y + EYE_HEIGHT, game.player.z);
            camera.rotation.order = 'YXZ';
            camera.rotation.set(game.player.pitch, game.player.yaw, 0);
            camera.updateMatrixWorld();
            updateStreaming();
            animalsTick(dt);
            game.reticle = raycastVoxel();
            updateMining(dt);
            if (game.useQueued) {
              game.useQueued = false;
              useHeld();
            }
          }
          renderer.render(scene, camera);
        },
        tile: (x: number, y: number, z: number) => getTile(world, x, y, z),
        chunks: () => rendered.size,
        animals: () => game.animals.map((a) => ({ kind: a.kind, x: +a.x.toFixed(1), y: +a.y.toFixed(1), z: +a.z.toFixed(1), hp: a.hp, tamed: a.tamed })),
        forceSpawnAnimal: trySpawnAnimal,
      };
    }

    // ---- puzzle networking ----
    async function requestRunePuzzle(x: number, y: number, z: number) {
      try {
        const d = await api.post<{ puzzleId: string; question: string; choices: number[]; xpReward: number }>('/craft/puzzle');
        setPuzzle({ kind: 'rune', x, y, z, puzzleId: d.puzzleId, question: d.question, choices: d.choices, xpReward: d.xpReward, phase: 'asking' });
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
          version: SAVE_VERSION,
          seed: g.seed,
          worldDiff: Object.fromEntries(g.world.diff),
          inventory: g.inventory,
          playerX: g.player.x,
          playerY: g.player.y,
          playerZ: g.player.z,
          hp: Math.round(g.hp),
          food: Math.round(g.food),
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
    const onVisibility = () => document.visibilityState === 'hidden' && void saveNow(true);
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
      [...rendered.keys()].forEach(disposeChunkRender);
      game.animals.forEach((a) => {
        scene.remove(a.group);
        disposeAnimal(a);
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
      const d = await api.post<{ correct: boolean; correctAnswer: number; xpEarned: number }>(`/craft/puzzle/${puzzle.puzzleId}/answer`, {
        choice: choiceVal,
      });
      setPuzzle((p) => (p ? { ...p, phase: 'result', chosen: choiceVal, correct: d.correct, correctAnswer: d.correctAnswer } : p));
      const g = gameRef.current;
      if (d.correct && g) {
        if (puzzle.kind === 'rune' && puzzle.x !== undefined && puzzle.y !== undefined && puzzle.z !== undefined) {
          setTile(g.world, puzzle.x, puzzle.y, puzzle.z, AIR);
          g.inventory[String(RUNEBLOCK)] = invCount(g.inventory, RUNEBLOCK) + 1;
          setInventory({ ...g.inventory });
          rebuildChunkAtRef.current(puzzle.x, puzzle.z);
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

  function doCraftRecipe(recipeId: string) {
    const r = RECIPES.find((x) => x.id === recipeId);
    const g = gameRef.current;
    if (!r || !g) return;
    if (!applyCraft(g.inventory, r)) return;
    g.dirty = true;
    setInventory({ ...g.inventory });
    setCraftPop((c) => ({ n: c.n + 1, label: `+${r.qty} ${glyph(r.out)}` }));
  }
  function consumeFromMenu(id: number) {
    const g = gameRef.current;
    if (!g || invCount(g.inventory, id) <= 0) return;
    const def = ITEM[id];
    g.inventory[String(id)] = invCount(g.inventory, id) - 1;
    if (def?.kind === 'potion') {
      g.inventory[String(BOTTLE)] = invCount(g.inventory, BOTTLE) + 1;
      const kind = def.potion!;
      if (kind === 'heal') g.hp = Math.min(20, g.hp + 6);
      else g.effects[kind] = performance.now() + POTION_SECONDS[kind] * 1000;
    } else if (def?.food) {
      g.food = Math.min(20, g.food + def.food);
    }
    g.dirty = true;
    setInventory({ ...g.inventory });
    setSurvival({ hp: Math.round(g.hp), food: Math.round(g.food) });
  }

  async function openPracticePuzzle() {
    try {
      const d = await api.post<{ puzzleId: string; question: string; choices: number[]; xpReward: number }>('/craft/puzzle');
      puzzleOpenRef.current = true;
      suspendImmersion();
      setPuzzle({ kind: 'practice', puzzleId: d.puzzleId, question: d.question, choices: d.choices, xpReward: d.xpReward, phase: 'asking' });
    } catch {
      /* transient — retry the button */
    }
  }

  function startFreshWorld() {
    setConfirmOpen(false);
    const g = gameRef.current;
    if (!g) return;
    g.seed = Math.floor(Math.random() * 1e9);
    g.world = makeWorld(g.seed, new Map());
    g.inventory = {};
    g.hp = 20;
    g.food = 20;
    g.effects = { speed: 0, jump: 0, night: 0 };
    g.animals.forEach((a) => disposeAnimal(a));
    g.animals = [];
    const s = spawnPoint(g.world);
    g.player.x = s.x;
    g.player.y = s.y;
    g.player.z = s.z;
    g.player.vy = 0;
    g.player.groundRefY = s.y;
    g.dirty = true;
    setInventory({});
    setSurvival({ hp: 20, food: 20 });
    rebuildAllRef.current();
    void api.post('/craft/save', {
      version: SAVE_VERSION,
      seed: g.seed,
      worldDiff: {},
      inventory: {},
      playerX: s.x,
      playerY: s.y,
      playerZ: s.z,
      hp: 20,
      food: 20,
    });
  }

  const iconBtnStyle: CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.28)',
    background: 'rgba(16,20,32,0.6)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    color: '#fff',
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  };
  const cornerPillStyle: CSSProperties = {
    border: '1px solid rgba(255,255,255,0.28)',
    background: 'rgba(16,20,32,0.6)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 800,
    padding: '6px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const effectEmoji: Record<PotionKind, string> = { heal: '❤️', speed: '💨', jump: '🦘', night: '🌙' };
  const hearts = Math.max(0, Math.ceil(survival.hp / 2));
  const drums = Math.max(0, Math.ceil(survival.food / 2));

  const hotbar = (
    <div
      className="no-scrollbar"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 12,
        transform: 'translateX(-50%)',
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        maxWidth: 'calc(100% - 16px)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1, textShadow: '0 1px 2px #000' }}>
        <span>{'❤️'.repeat(hearts) || '💀'}</span>
        <span>{'🍗'.repeat(drums)}</span>
      </div>
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: 4,
          padding: 5,
          maxWidth: '100%',
          overflowX: 'auto',
          borderRadius: 12,
          background: 'rgba(16,20,32,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        {hotbarIds.map((id, i) => {
          const selected = selectedSlot === i;
          const def = ITEM[id];
          return (
            <button
              key={`${id}-${i}`}
              type="button"
              onClick={() => selectSlot(i)}
              title={`${i + 1} · ${t(def?.nameKey ?? '')}`}
              style={{
                position: 'relative',
                flex: '0 0 auto',
                width: 'clamp(38px, 8.5vw, 48px)',
                height: 'clamp(38px, 8.5vw, 48px)',
                borderRadius: 8,
                border: selected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.22)',
                background: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
                boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.35)' : 'none',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                padding: 0,
              }}
            >
              <span style={{ position: 'absolute', top: 1, left: 3, fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 2px #000' }}>
                {i < 9 ? i + 1 : ''}
              </span>
              {def && (def.place || def.kind === 'block') ? (
                <span style={{ width: 20, height: 20, borderRadius: 4, background: def.swatch ?? '#888', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)' }} />
              ) : (
                <span style={{ fontSize: def?.label ? 12 : 19, fontWeight: 800, color: '#fff' }}>{def?.emoji ?? def?.label ?? '▪'}</span>
              )}
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 3,
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#fff',
                  textShadow: '0 1px 2px #000',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {invCount(inventory, id)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

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
            <span className="muted" style={{ fontSize: 13, fontWeight: 700, flex: '1 1 220px' }}>
              {showTouch ? t('craft.digHintTouch') : t('craft.moveHint')}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => setConfirmOpen(true)}>
              🔄 {t('craft.newWorld')}
            </button>
          </div>

          <div
            ref={wrapRef}
            dir="ltr"
            style={{
              position: 'relative',
              height: isFullscreen ? '100%' : 'min(58vh, 480px)',
              margin: isFullscreen ? 0 : '14px 18px',
              borderRadius: isFullscreen ? 0 : 'var(--radius-md)',
              background: '#0b0b0f',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-3d-sm)',
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', cursor: showTouch ? 'default' : 'crosshair', touchAction: 'none' }} />

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
                zIndex: 5,
              }}
            />

            {hotbar}

            {craftPop.n > 0 && (
              <div
                key={craftPop.n}
                aria-hidden
                onAnimationEnd={() => setCraftPop({ n: 0, label: '' })}
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 96,
                  zIndex: 6,
                  pointerEvents: 'none',
                  fontSize: 20,
                  fontWeight: 900,
                  color: '#fff',
                  textShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  animation: 'craftPop 0.9s ease-out forwards',
                }}
              >
                {craftPop.label}
              </div>
            )}

            {toast && (
              <div
                key={toast.n}
                aria-hidden
                onAnimationEnd={() => setToast(null)}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 54,
                  transform: 'translateX(-50%)',
                  zIndex: 6,
                  pointerEvents: 'none',
                  background: 'rgba(16,20,32,0.72)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '5px 12px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                  animation: 'craftPop 1.6s ease-out forwards',
                }}
              >
                {toast.text}
              </div>
            )}

            {effectChips.length > 0 && (
              <div style={{ position: 'absolute', top: 52, left: 10, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {effectChips.map((c) => (
                  <span
                    key={c.kind}
                    style={{
                      background: 'rgba(16,20,32,0.6)',
                      border: '1px solid rgba(255,255,255,0.22)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 999,
                    }}
                  >
                    {effectEmoji[c.kind]} {c.secs}s
                  </span>
                ))}
              </div>
            )}

            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setMenuOpen(true)} style={cornerPillStyle}>
                🧰 {t('craft.craftMenuButton')}
                {!showTouch && ' · F'}
              </button>
              <button type="button" onClick={openPracticePuzzle} style={{ ...cornerPillStyle, background: 'rgba(203,161,53,0.82)', color: '#1c1204' }}>
                {t('craft.practicePuzzleButton')}
              </button>
            </div>

            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setIntroOpen(true)} title={t('craft.help')} style={iconBtnStyle}>
                ❓
              </button>
              {!fullscreenBlocked && (
                <button type="button" onClick={toggleFullscreen} title={isFullscreen ? t('craft.exitFullscreen') : t('craft.fullscreen')} style={iconBtnStyle}>
                  {isFullscreen ? '✕' : '⛶'}
                </button>
              )}
            </div>

            {!showTouch && !locked && !pointerLockUnavailable && !menuOpen && (
              <div
                onClick={() => attemptLockRef.current()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 4,
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
                <div style={{ position: 'absolute', left: 14, bottom: 96, zIndex: 3 }}>
                  <TouchJoystick
                    onChange={(x, y) => {
                      if (gameRef.current) {
                        gameRef.current.touchMoveX = x;
                        gameRef.current.touchMoveY = y;
                      }
                    }}
                  />
                </div>
                <div style={{ position: 'absolute', right: 14, bottom: 166, zIndex: 3 }}>
                  <TouchActionButton label="⤒" onDown={() => setTouchFlag(gameRef, 'touchJump', true)} onUp={() => setTouchFlag(gameRef, 'touchJump', false)} />
                </div>
                <div style={{ position: 'absolute', right: 84, bottom: 96, zIndex: 3 }}>
                  <TouchActionButton label="⛏" onDown={() => setMineHeld(gameRef, true)} onUp={() => setMineHeld(gameRef, false)} />
                </div>
                <div style={{ position: 'absolute', right: 14, bottom: 96, zIndex: 3 }}>
                  <TouchActionButton label="✋" onDown={() => queueUse(gameRef)} onUp={() => {}} />
                </div>
              </>
            )}

            {!showTouch && pointerLockUnavailable && !menuOpen && <LookDragLayer gameRef={gameRef} digOnHold />}

            {menuOpen && (
              <CraftMenu inventory={inventory} onCraft={doCraftRecipe} onConsume={consumeFromMenu} onClose={() => setMenuOpen(false)} />
            )}
          </div>
        </div>
      )}

      {introOpen && (
        <div className="modal-overlay" onClick={() => setIntroOpen(false)}>
          <div className="modal-panel text-center" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 20 }}>{t('craft.introTitle')}</h2>
            <p className="muted" style={{ marginBottom: 16 }}>
              {t('craft.introBody')}
            </p>
            <ul style={{ textAlign: 'start', paddingInlineStart: 20, fontWeight: 700, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.85, marginBottom: 18 }}>
              <li>{showTouch ? t('craft.introMoveTouch') : t('craft.introMove')}</li>
              <li>{showTouch ? t('craft.introDigTouch') : t('craft.introDig')}</li>
              <li>{showTouch ? t('craft.introBuildTouch') : t('craft.introBuild')}</li>
              <li>{t('craft.introCraft')}</li>
              <li>{t('craft.introSurvive')}</li>
              <li>{t('craft.introAnimals')}</li>
              <li>{t('craft.introRune')}</li>
              {!fullscreenBlocked && <li>{t('craft.introFullscreen')}</li>}
            </ul>
            <button type="button" className="btn btn-primary" onClick={() => setIntroOpen(false)}>
              {t('craft.start')}
            </button>
          </div>
        </div>
      )}

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
function queueUse(ref: GameRefT) {
  if (ref.current) ref.current.useQueued = true;
}

function LookDragLayer({ gameRef, digOnHold = false }: { gameRef: GameRefT; digOnHold?: boolean }) {
  const drag = useRef({ active: false, lastX: 0, lastY: 0, moved: 0 });
  const setMine = (v: boolean) => {
    if (digOnHold && gameRef.current) gameRef.current.mineHeld = v;
  };
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 1, touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        drag.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: 0 };
        setMine(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current.active || !gameRef.current) return;
        const dx = e.clientX - drag.current.lastX;
        const dy = e.clientY - drag.current.lastY;
        drag.current.lastX = e.clientX;
        drag.current.lastY = e.clientY;
        drag.current.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.current.moved > 8) setMine(false);
        const p = gameRef.current.player;
        p.yaw -= dx * 0.0055;
        p.pitch -= dy * 0.0055;
        p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
      }}
      onPointerUp={() => {
        drag.current.active = false;
        setMine(false);
      }}
      onPointerCancel={() => {
        drag.current.active = false;
        setMine(false);
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
    const l = Math.hypot(dx, dy);
    const c = Math.min(l, RADIUS);
    const nx = l ? (dx / l) * c : 0;
    const ny = l ? (dy / l) * c : 0;
    setKnob({ x: nx, y: ny });
    onChange(nx / RADIUS, ny / RADIUS);
  }

  return (
    <div
      ref={baseRef}
      style={{ width: 96, height: 96, borderRadius: '50%', background: 'rgba(245,247,251,.55)', boxShadow: 'var(--shadow-3d-sm)', position: 'relative', touchAction: 'none', zIndex: 2 }}
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
