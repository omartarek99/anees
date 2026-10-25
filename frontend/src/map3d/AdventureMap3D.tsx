import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Frustum, Matrix4 } from 'three';
import type * as THREE from 'three';
import { isLowPower } from '../components/avatar3d/avatarConfig';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { Atmosphere } from './Atmosphere';
import { CameraRig, DEFAULT_VIEW, type InitialView, type RigApi } from './CameraRig';
import { pathBaseY } from './ground';
import { buildWorld, currentNodeId } from './layout';
import { MapHud } from './MapHud';
import { MapNodes } from './MapNodes';
import { NodeTip, ZoneBanners } from './Overlays';
import { PathRibbon } from './PathRibbon';
import type { ApiLevel, MapNode } from './schema';
import { milestoneAt, worldOf } from './story';
import { ZoneLayer } from './ZoneLayer';
import './zones'; // registers every zone's landscape before anything asks for a ground height
import '../styles/map3d.css';

// The interactive 3D adventure map. Data in (the API's levels, merged with the static layout into a MapWorld), "open this
// level" out. All the visuals read the world, so progress changing only changes how nodes and the road look.
//
// It is built to be light: no shadow maps, a capped pixel ratio, a cheap diffuse-only material, and a render loop that only
// draws when something changes (camera, hover) plus a gentle ambient tick for the few things that move by themselves.

export interface AdventureMap3DProps {
  /** The levels from /api/map: their progress is what the world's states come from. */
  levels: readonly ApiLevel[];
  /** A playable level was clicked. */
  onOpen: (levelNumber: number) => void;
  /** The WebGL context was lost: the page can fall back to the flat map. */
  onContextLost?: () => void;
  /** Skip ambient animation. Defaults to the visitor's reduced-motion setting. */
  still?: boolean;
  /** Where the camera starts (defaults: the player's current level, from the front). Used by the dev preview. */
  initialView?: Partial<InitialView>;
}

const PAN_STEP = 8;
/** Blocks travelled per pixel of wheel scroll: about 8 blocks a notch, like paging through the old tall map. */
const WHEEL_BLOCKS_PER_PX = 0.08;
/** Ambient motion (clouds, birds, the beacon) is redrawn this often: smooth enough, a fraction of the cost of 60 fps. */
const AMBIENT_FPS = 20;

/** Redraws at AMBIENT_FPS while the map is on screen and the tab is visible; stops when it is not. */
function AmbientClock({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    if (!active) return;
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting));
    io.observe(canvas);
    const id = window.setInterval(() => {
      if (onScreen && !document.hidden) invalidate();
    }, 1000 / AMBIENT_FPS);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, [active, canvas, invalidate]);
  return null;
}

/** DEV only: tells a test page the scene has drawn, and lets it read the camera, the cost and steer the rig. */
function DevSignal({ rig }: { rig: MutableRefObject<RigApi | null> }) {
  const { camera, controls, gl, scene, invalidate } = useThree();
  useEffect(() => {
    const c = controls as unknown as { target: THREE.Vector3; getPolarAngle(): number; getAzimuthalAngle(): number };
    (window as unknown as { __map3d?: unknown }).__map3d = {
      rig,
      stats: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, frame: gl.info.render.frame }),
      // what the camera sees right now, by part (draw calls and triangles): the profiler for this scene
      breakdown: () => {
        const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const out: Record<string, { calls: number; tris: number }> = {};
        scene.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.geometry || !frustum.intersectsObject(m)) return;
          let top = 'other';
          for (let p: THREE.Object3D | null = o; p; p = p.parent) {
            if (p.name && /^(ground|scenery|road|nodes)/.test(p.name)) {
              top = p.name;
              break;
            }
          }
          const g = m.geometry;
          const instances = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
          (out[top] ??= { calls: 0, tris: 0 }).calls++;
          out[top].tris += Math.round(((g.index ? g.index.count : g.attributes.position.count) / 3) * instances);
        });
        return out;
      },
      // milliseconds to draw one frame (synchronously, ten times over): compare before / after, not across machines
      cost: () => {
        const t0 = performance.now();
        for (let i = 0; i < 10; i++) gl.render(scene, camera);
        const ctx = gl.getContext();
        ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4)); // forces the GPU to finish
        return (performance.now() - t0) / 10;
      },
      camera: () => ({ x: c.target.x, z: c.target.z, dist: camera.position.distanceTo(c.target), polar: c.getPolarAngle(), azimuth: c.getAzimuthalAngle() }),
    };
    // the loop only draws on demand: give it a few frames, then announce
    let n = 0;
    const id = window.setInterval(() => {
      invalidate();
      if (++n === 10) {
        document.documentElement.dataset.map3dReady = '1';
        window.clearInterval(id);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [camera, controls, gl, scene, invalidate, rig]);
  return null;
}

export default function AdventureMap3D({ levels, onOpen, onContextLost, still: stillProp, initialView }: AdventureMap3DProps) {
  const { t, lang } = useLanguage();
  const world = useMemo(() => buildWorld(levels, (_zone, x, z) => pathBaseY(x, z)), [levels]);
  const root = useRef<HTMLDivElement>(null);
  const rig = useRef<RigApi | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [zone, setZone] = useState(0);
  const lowPower = useMemo(() => isLowPower(), []);
  const reduceMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const still = stillProp ?? reduceMotion;

  const myLevel = useMemo(() => currentNodeId(world), [world]);
  const initial = useMemo<InitialView>(() => {
    const n = world.nodes[myLevel - 1];
    return { x: n.position[0] * 0.4, z: n.position[2], ...DEFAULT_VIEW, ...initialView };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoneNames = useMemo(() => world.zones.map((z) => t(z.nameKey)), [world.zones, t]);
  const titleOf = (n: MapNode) => pickText(lang, n.metadata.title, n.metadata.titleAr);
  const isLocked = (n: MapNode) => n.state === 'locked' || n.metadata.comingSoon;

  // Scrolling: the wheel travels along the map (down = towards level 50), like scrolling the old tall page; Ctrl + wheel and a
  // trackpad pinch zoom (they reach the camera controls untouched); at either end of the map the wheel is handed back to the
  // page, so it can never trap the scroll. Capture phase and non-passive: this has to run before the controls see the event.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.stopPropagation(); // the camera controls would zoom
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (e.deltaX) rig.current?.pan(e.deltaX * px * WHEEL_BLOCKS_PER_PX, 0);
      if (rig.current?.travel(e.deltaY * px * WHEEL_BLOCKS_PER_PX) || (e.deltaX && !e.deltaY)) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  // a locked node cannot open; say why for a moment (touch screens have no hover to show it)
  useEffect(() => {
    if (flash === null) return;
    const id = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(id);
  }, [flash]);

  function select(id: number) {
    const n = world.nodes[id - 1];
    if (isLocked(n)) setFlash(id);
    else onOpen(id);
  }

  function focusNode(id: number, distance = 36) {
    const n = world.nodes[id - 1];
    rig.current?.focus(n.position[0] * 0.4, n.position[2], distance);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // the HUD buttons and the level list keep their own keys
    const k = e.key;
    const dz = k === 'ArrowUp' ? -PAN_STEP : k === 'ArrowDown' ? PAN_STEP : 0;
    const dx = k === 'ArrowLeft' ? -PAN_STEP : k === 'ArrowRight' ? PAN_STEP : 0;
    if (dx || dz) rig.current?.pan(dx, dz);
    else if (k === '+' || k === '=') rig.current?.zoom(0.8);
    else if (k === '-') rig.current?.zoom(1.25);
    else return;
    e.preventDefault();
  }

  const tipId = hovered ?? flash;
  const tipNode = tipId !== null ? world.nodes[tipId - 1] : null;

  return (
    <div ref={root} className={`map3d${hovered !== null ? ' is-hover' : ''}`} tabIndex={0} role="group" aria-label={t('map.aria')} onKeyDown={onKeyDown}>
      <Canvas
        frameloop="demand"
        flat
        dpr={[1, lowPower ? 1 : 1.5]}
        camera={{ fov: 38, near: 1, far: 300, position: [0, 30, 30] }}
        gl={{ antialias: !lowPower, powerPreference: 'default' }}
        onCreated={({ gl }) =>
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onContextLost?.();
          })
        }
      >
        <AmbientClock active={!still} />
        <Atmosphere />
        <CameraRig api={rig} bounds={world.bounds} initial={initial} onZone={setZone} />
        <ZoneLayer zones={world.zones} still={still} />
        <PathRibbon world={world} still={still} />
        <MapNodes nodes={world.nodes} hoveredId={hovered} still={still} onHover={setHovered} onSelect={select} />
        <ZoneBanners zones={world.zones} names={zoneNames} />
        {tipNode && (
          <NodeTip node={tipNode}>
            <div className={`map3d-tip is-${isLocked(tipNode) ? 'locked' : tipNode.state}`}>
              <b>
                {t('reels.level', { n: tipNode.id })}
                {tipNode.meshType === 'arena' ? ` · ${t('map.bossTag')}` : ''}
              </b>
              <span>{titleOf(tipNode)}</span>
              <small>{t('story.world', { n: worldOf(tipNode.id) + 1, name: t(`story.world${worldOf(tipNode.id)}`) })}</small>
              {milestoneAt(tipNode.id) && (
                <small className="map3d-tip-prize">
                  {t(`story.guard${tipNode.id}`)}: {t('story.guardianReward', { item: t(`story.${milestoneAt(tipNode.id)!.id}`) })}
                </small>
              )}
              <em>{isLocked(tipNode) ? t('map.locked') : tipNode.state === 'completed' ? t('map.completed') : t('map.playNow')}</em>
            </div>
          </NodeTip>
        )}
        {import.meta.env.DEV && <DevSignal rig={rig} />}
      </Canvas>

      <MapHud
        zoneNames={zoneNames}
        activeZone={zone}
        onZone={(i) => focusNode(world.zones[i].nodeIds[0], 40)}
        onMyLevel={() => focusNode(myLevel)}
        labels={{ zones: t('map.zones'), myLevel: t('map.myLevel'), hint: t('map.hint') }}
      />

      {/* The same levels as real buttons, for keyboards and screen readers: the 3D scene itself is pointer-driven. */}
      <ol className="map3d-sr" aria-label={t('map.levelList')}>
        {world.nodes.map((n) => (
          <li key={n.id}>
            <button type="button" disabled={isLocked(n)} onClick={() => select(n.id)} onFocus={() => focusNode(n.id)}>
              {t('reels.level', { n: n.id })}: {titleOf(n)}
              {isLocked(n) ? ` (${t('map.locked')})` : n.state === 'completed' ? ` (${t('map.completed')})` : ''}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
