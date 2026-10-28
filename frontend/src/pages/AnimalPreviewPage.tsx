import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createAnimalMesh, disposeAllAssets, getAssets, validateSpecies } from '../lib/craftAnimals/model';
import type { Pose } from '../lib/craftAnimals/rig';
import type { SpeciesSpec } from '../lib/craftAnimals/types';

// DEV ONLY (routed at /dev/animals, not built into production): every Builder's Quarry animal species drawn with the real
// engine, lit like the game, so skins and models can be checked and screenshotted. Query parameters:
//   file=pasture,sky   only the species modules lib/craftAnimals/species/<name>.ts (default: all - a broken module only breaks
//                      the previews that load it, so authors can work side by side)
//   kind=cow,pig       only these species                        variants=all   one cell per skin variant (default: variant 0)
//   cols=6             animals per row                           angle=3q|front|back|left|right|top      camera / body angle
//   walk=1 fly=1 graze=1   play that animation                   ref=0   hide the 1-block reference cube
//   labels=0           hide the name labels                      water=1   a translucent pond behind the animals (for swimmers)
// window.__animals = { ready, issues, count, info() } is there for scripted checks.

type Item = { name: string; radius: number; mesh: THREE.Mesh; pose: Pose; dispose: () => void; label: HTMLDivElement; x: number; z: number };

const modules = import.meta.glob<{ SPECIES: SpeciesSpec[] }>('../lib/craftAnimals/species/*.ts');

export function AnimalPreviewPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const q = new URLSearchParams(window.location.search);
      const files = q.get('file')?.split(',').map((s) => s.trim()).filter(Boolean);
      const paths = Object.keys(modules).filter((p) => !p.endsWith('/kit.ts') && (!files?.length || files.some((f) => p.endsWith(`/${f}.ts`))));
      const loaded = await Promise.all(paths.map((p) => modules[p]()));
      if (cancelled) return;
      const all = loaded.flatMap((m) => m.SPECIES);
      const wanted = q.get('kind')?.split(',').map((s) => s.trim()).filter(Boolean);
      const list = wanted?.length ? all.filter((s) => wanted.includes(s.kind)) : all;
      const allVariants = q.get('variants') === 'all';
      const angle = q.get('angle') ?? '3q';
      const showLabels = q.get('labels') !== '0';

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xbcd9f0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.72));
      const sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
      sun.position.set(40, 80, 20);
      scene.add(sun);

      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      host.appendChild(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

      const issues: Record<string, string[]> = {};
      const items: Item[] = [];
      const cells: { spec: SpeciesSpec; variant: number }[] = [];
      for (const spec of list) {
        const bad = validateSpecies(spec);
        if (bad.length) issues[spec.kind] = bad;
        const n = allVariants ? Math.max(1, spec.variants ?? 1) : 1;
        for (let v = 0; v < n; v++) cells.push({ spec, variant: v });
      }
      const cols = Math.max(1, Number(q.get('cols')) || Math.min(6, cells.length));
      const rows = Math.ceil(cells.length / cols);
      const radii = cells.map((c) => getAssets(c.spec).radius);
      const cell = Math.max(2.2, 2 * Math.max(...radii, 0.4) + 0.9);
      const yaw = ({ '3q': 0.65, front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2, top: 0 } as Record<string, number>)[angle] ?? 0.65;

      cells.forEach((c, i) => {
        const assets = getAssets(c.spec);
        const { mesh, pose, dispose } = createAnimalMesh(assets, c.variant);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * cell;
        const z = (row - (rows - 1) / 2) * cell;
        // swimmers hover mid-pond, fliers a little above the ground so they read well
        const lift = c.spec.move === 'swim' ? 0.9 : c.spec.move === 'fly' ? 1.2 : c.spec.move === 'float' ? 1.5 : 0;
        mesh.position.set(x, lift, z);
        mesh.rotation.y = yaw;
        scene.add(mesh);
        const label = document.createElement('div');
        label.textContent = `${c.spec.name.en}${allVariants && (c.spec.variants ?? 1) > 1 ? ` #${c.variant}` : ''}`;
        Object.assign(label.style, { position: 'absolute', left: '0', top: '0', transform: 'translate(-50%, 0)', font: '700 12px system-ui', color: '#10223a', background: 'rgba(255,255,255,0.78)', padding: '1px 6px', borderRadius: '6px', pointerEvents: 'none', whiteSpace: 'nowrap', display: showLabels ? 'block' : 'none' });
        host.appendChild(label);
        items.push({ name: c.spec.name.en, radius: assets.radius, mesh, pose, dispose, label, x, z });
      });

      // ground, an optional pond, and a 1-block reference cube
      const W = cols * cell;
      const D = rows * cell;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 12, D + 12), new THREE.MeshLambertMaterial({ color: 0x6aab43 }));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      let pond: THREE.Mesh | undefined;
      if (q.get('water') === '1') {
        pond = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 2.4, D + 2), new THREE.MeshLambertMaterial({ color: 0x3a74c8, transparent: true, opacity: 0.42, depthWrite: false }));
        pond.position.set(0, 1.2, 0);
        scene.add(pond);
      }
      let cube: THREE.Mesh | undefined;
      if (q.get('ref') !== '0') {
        cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8d8d8d }));
        cube.position.set(-W / 2 - 1.2, 0.5, D / 2 + 0.5);
        scene.add(cube);
      }

      const animated = q.get('walk') === '1' || q.get('fly') === '1' || q.get('graze') === '1';
      const clock = new THREE.Clock();
      const v = new THREE.Vector3();

      const frame = () => {
        const dt = Math.min(0.05, clock.getDelta());
        for (const it of items) {
          const p = it.pose;
          p.ph.z += dt * 2;
          p.ph.w += dt * 5;
          if (q.get('walk') === '1') {
            p.k.x = 1;
            p.ph.x += dt * 8;
          }
          if (q.get('fly') === '1') {
            p.k.y = 1;
            p.ph.y += dt * 22;
          }
          if (q.get('graze') === '1') p.k.z = 1;
        }
        renderer.render(scene, camera);
        const rect = renderer.domElement.getBoundingClientRect();
        for (const it of items) {
          v.set(it.x, 0, it.z + it.radius).project(camera);
          it.label.style.left = `${rect.left + ((v.x + 1) / 2) * rect.width}px`;
          it.label.style.top = `${rect.top + ((1 - v.y) / 2) * rect.height + 4}px`;
        }
      };

      const layout = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const elevation = angle === 'top' ? 1.45 : 0.42;
        const fitW = W / 2 + 1.4;
        const fitD = D / 2 + 1.4;
        const tanV = Math.tan((camera.fov * Math.PI) / 360);
        const tanH = tanV * camera.aspect;
        // the grid is seen from `elevation` above the ground: its on-screen height is about D*sin(el) + the animals' height
        const dist = Math.max(fitW / tanH, (fitD * Math.sin(elevation) + 1.6) / tanV) * 1.05;
        camera.position.set(0, 0.7 + dist * Math.sin(elevation), dist * Math.cos(elevation));
        camera.lookAt(0, 0.55, 0);
        camera.updateProjectionMatrix();
        frame();
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(host);

      let raf = 0;
      if (animated) {
        const loop = () => {
          frame();
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }

      (window as unknown as { __animals?: unknown }).__animals = {
        ready: true,
        issues,
        count: items.length,
        info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
        render: frame,
      };
      document.documentElement.dataset.animalsReady = '1';

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        items.forEach((it) => {
          it.label.remove();
          it.dispose();
        });
        disposeAllAssets();
        ground.geometry.dispose();
        pond?.geometry.dispose();
        cube?.geometry.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        document.documentElement.removeAttribute('data-animals-ready');
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#bcd9f0' }} />;
}
