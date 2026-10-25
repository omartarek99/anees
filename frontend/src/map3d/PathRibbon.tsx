import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ZONES } from './layout';
import { pathBaseY } from './ground';
import { PATH_POINTS } from './pathLine';
import type { MapWorld } from './schema';

// The road between the levels, in each zone's own material (carpet, dock, stone, planks): ONE merged ribbon mesh along the
// route (a raised rim on each edge, a centre of alternating tile colours, thin side walls), plus instanced posts where the
// road stands over water. Colours follow the player's progress: a walkable leg glows, a locked one is dim, and the leg that
// leads to the current level pulses. The ribbon's geometry never changes; only its colours are rewritten.

const STRIDE = 2; // PATH_POINTS are every half block; a ribbon section every block
const RIM = 0.4; // width of the raised edge
const RIM_RAISE = 0.2; // how much higher the edge stands than the centre
const POST_EVERY = 4; // one pair of posts every this many sections
const POST_LEN = 6;
const QUADS = 5; // per section: edge, centre, edge, left wall, right wall

const DIM = new THREE.Color('#7c7585');
const ribbonMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
const postMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
const unitBox = new THREE.BoxGeometry(1, 1, 1);

interface Sample {
  x: number;
  y: number;
  z: number;
  /** Unit vector across the road (to its left). */
  nx: number;
  nz: number;
  /** The connection (from level) this section belongs to. */
  from: number;
  zone: number;
  tile: number;
}

// Built on first use: it reads the ground heights, which the zone modules register when they load.
let samples: Sample[] | null = null;
function getSamples(): Sample[] {
  return (samples ??= PATH_POINTS.filter((_, i) => i % STRIDE === 0).map((p, i): Sample => {
    const zone = ZONES.find((z) => z.key === p.zone)!;
    return { x: p.x, y: pathBaseY(p.x, p.z), z: p.z, nx: p.tz, nz: -p.tx, from: p.from, zone: zone.index, tile: i };
  }));
}

/** The ribbon's positions: five quads per section, two triangles each. Colours are filled in by `paintSection`. */
function ribbonPositions(s: Sample[]) {
  const pos = new Float32Array((s.length - 1) * QUADS * 6 * 3);
  let o = 0;
  const vert = (a: Sample, off: number, y: number) => {
    pos[o++] = a.x + a.nx * off;
    pos[o++] = y;
    pos[o++] = a.z + a.nz * off;
  };
  // a strip between lateral offsets o1 and o2 along one section (a to b); h1 / h2 give the height at o1 / o2
  const quad = (a: Sample, b: Sample, o1: number, o2: number, h1: (q: Sample) => number, h2: (q: Sample) => number) => {
    vert(a, o1, h1(a));
    vert(a, o2, h2(a));
    vert(b, o2, h2(b));
    vert(a, o1, h1(a));
    vert(b, o2, h2(b));
    vert(b, o1, h1(b));
  };
  const top = (q: Sample) => q.y + ZONES[q.zone].path.thickness;
  const rim = (q: Sample) => top(q) + RIM_RAISE;
  const base = (q: Sample) => q.y - 0.2;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    const w = ZONES[a.zone].path.width / 2;
    quad(a, b, -(w + RIM), -w, rim, rim); // left edge
    quad(a, b, -w, w, top, top); // centre
    quad(a, b, w, w + RIM, rim, rim); // right edge
    quad(a, b, -(w + RIM), -(w + RIM), base, rim); // left wall
    quad(a, b, w + RIM, w + RIM, base, rim); // right wall
  }
  return pos;
}

export function PathRibbon({ world, still }: { world: MapWorld; still: boolean }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const s = getSamples();

  const { geometry, colors } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(ribbonPositions(s), 3));
    const c = new THREE.BufferAttribute(new Float32Array((s.length - 1) * QUADS * 6 * 3), 3);
    g.setAttribute('color', c);
    g.computeBoundingSphere();
    return { geometry: g, colors: c };
  }, [s]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // the leg the player can play now: the last walkable connection, if it ends at an unlocked level
  const frontier = useMemo(() => {
    const lit = world.connections.filter((c) => c.lit);
    const last = lit[lit.length - 1];
    return last && world.nodes[last.to - 1].state === 'unlocked' ? last.from : -1;
  }, [world]);
  const litKey = world.connections.map((c) => (c.lit ? 1 : 0)).join('');

  const tmp = useMemo(() => ({ c: new THREE.Color(), glow: new THREE.Color(), edge: new THREE.Color() }), []);
  const paintSection = (i: number, t: number) => {
    const a = s[i];
    const zone = ZONES[a.zone].path;
    const lit = world.connections[a.from - 1]?.lit ?? false;
    const { c, glow, edge } = tmp;
    c.set(zone.tiles[a.tile % zone.tiles.length]);
    edge.set(zone.edge);
    glow.set(zone.glow);
    if (lit) {
      c.lerp(glow, 0.12);
      if (a.from === frontier && t >= 0) c.lerp(glow, 0.5 * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.55))); // light running towards the level
    } else {
      c.lerp(DIM, 0.45).multiplyScalar(0.82);
      edge.lerp(DIM, 0.4).multiplyScalar(0.8);
    }
    const fill = (quad: number, col: THREE.Color, k = 1) => {
      for (let v = 0; v < 6; v++) colors.setXYZ((i * QUADS + quad) * 6 + v, col.r * k, col.g * k, col.b * k);
    };
    fill(0, edge);
    fill(1, c);
    fill(2, edge);
    fill(3, edge, 0.8);
    fill(4, edge, 0.8);
  };

  // progress colours
  useEffect(() => {
    for (let i = 0; i < s.length - 1; i++) paintSection(i, -1);
    colors.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [litKey, frontier, colors]);

  // the running light on the current leg (a few dozen sections; the scene's ambient tick drives it)
  useFrame(({ clock }) => {
    if (still || frontier < 0) return;
    for (let i = 0; i < s.length - 1; i++) if (s[i].from === frontier) paintSection(i, clock.elapsedTime);
    colors.needsUpdate = true;
  });

  // posts under the road where it crosses water
  const postSpots = useMemo(() => s.filter((a, i) => ZONES[a.zone].path.pillars && i % POST_EVERY === 0), [s]);
  useEffect(() => {
    const mesh = posts.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3(0.5, POST_LEN, 0.5);
    postSpots.forEach((a, k) => {
      const off = ZONES[a.zone].path.width / 2 - 0.4;
      const col = tmp.edge.set(ZONES[a.zone].path.edge).multiplyScalar(0.8);
      [-1, 1].forEach((side, j) => {
        mesh.setMatrixAt(k * 2 + j, m.compose(p.set(a.x + a.nx * off * side, a.y - POST_LEN / 2, a.z + a.nz * off * side), q, sc));
        mesh.setColorAt(k * 2 + j, col);
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [postSpots, tmp]);

  return (
    <group name="road">
      <mesh geometry={geometry} material={ribbonMaterial} />
      {postSpots.length > 0 && <instancedMesh ref={posts} args={[unitBox, postMaterial, postSpots.length * 2]} />}
    </group>
  );
}
