# Adventure Map 3D

The interactive 3D version of the Adventure Map (`/map`). The old page was five illustrations with buttons laid over
them; this is a real scene: voxel terrain, a road, and a 3D object for every level, which the player pans, zooms and
tilts, and clicks directly.

## Why React Three Fiber

| | React Three Fiber + drei + three | Babylon.js | plain three.js |
|---|---|---|---|
| Already in the project | yes (the 3D avatar uses it) | no (new ~1 MB dependency) | yes |
| State and UI | the scene is React: progress state -> props -> visuals, hover and selection are React state | own scene graph, glue code needed | imperative glue code |
| Raycasting | built in: `onPointerOver / onClick` on a mesh | built in | hand-written |
| Cost | one lazy chunk, loaded only on `/map` | larger | smallest |

No new dependency is needed. The scene is in its own lazy chunk (`MapPage` imports `AdventureMap3D` with `lazy()`), so
the rest of the site does not pay for three.js.

## Folder map

```
map3d/
  schema.ts         types: MapNode, MapConnection, MapZone, MapWorld, NodeState (no three.js, no React)
  layout.ts         the STATIC layout (zones, node positions) + buildWorld(): layout + progress -> MapWorld
  math.ts           seeded random, value noise, smoothstep
  voxel.tsx         the modelling kit: box(), disc(), sphere(), defineModel(), <Voxel/>, <VoxelInstances/>, <Baked/>
  ground.ts         ground height anywhere: each zone's landscape + the road cut into it
  Terrain.tsx       <HeightfieldTerrain/>: blocky terrain as one merged mesh per zone
  pathLine.ts       the route as a smooth curve through the 50 nodes (+ nearest-point lookup)
  placement.ts      scatter(): seeded scenery placement that keeps clear of the road
  PathRibbon.tsx    the road: one merged ribbon (+ posts over water); colours follow progress
  MapNodes.tsx      the interaction layer: invisible hit volumes -> hover / click
  nodes/            NodeVisual: what a level node looks like in each state
  zones/            one module per zone: landscape, scenery, atmosphere (+ the ZoneModule contract in types.ts)
  CameraRig.tsx     the camera: orbit views (adventure / eagle eye) with limits, pan clamp, fly-to, wheel travel, and first person
  Atmosphere.tsx    sky, fog and light blended between zones (no shadow maps)
  ZoneLayer.tsx     draws the zones near the camera, hides the rest
  Overlays.tsx      zone signs and the node tooltip (DOM, via drei <Html>)
  MapHud.tsx        zone buttons, "My level", the view switcher, the hint (real DOM buttons)
  AdventureMap3D.tsx  the component the page uses: levels in, "open level N" out
  Map2D.tsx         the old flat map, kept only as the no-WebGL fallback
```

## Data schema

```ts
type NodeState = 'locked' | 'unlocked' | 'completed';          // unlocked = the API's "available"
type NodeMeshType = 'pad' | 'arena';                           // arena = a boss (every 5th level)
type Vec3 = readonly [x: number, y: number, z: number];        // blocks; x right, y up, z towards level 50

interface MapNode {
  id: number;                 // the level number 1..50, the same key as /api/map and /reels?level=N
  zone: ZoneKey;              // 'desert' | 'souq' | 'corniche' | 'observatory' | 'falcon'
  meshType: NodeMeshType;
  position: Vec3;             // y = the ground height under the pad
  state: NodeState;
  stars: number;              // 0..3
  metadata: { title: string; titleAr: string | null; comingSoon: boolean; subject: string | null };
}
interface MapConnection { from: number; to: number; lit: boolean }   // lit: the far end is playable
interface MapZone { key; index; nameKey; z0; z1; x0; x1; path: PathStyle; nodeIds: number[] }
interface MapWorld { zones; nodes; connections; bounds }
```

Static and dynamic data are kept apart on purpose: `layout.ts` never changes, `buildWorld(levels)` merges in the player's
progress, and every visual reads only `node.state` / `connection.lit`. Progress changing therefore only changes lighting,
glow, padlocks and which stretch of road is lit; nothing is rebuilt.

## How the 2D layout became 3D

* Each zone keeps its artwork's `aspect` (height / width) and the ten node positions as fractions (`ZONE_ART` in `layout.ts`:
  the very numbers the old page used).
* World width is 36 blocks. A node is at `x = (fx - 0.5) * 36`, `z = zone.z0 + fy * zoneDepth`, where `zoneDepth = round(36 * aspect)`
  and the zones are laid end to end (`z0` of zone *i* is the `z1` of zone *i-1*). Level 1 is at the top of the old page, which is the
  far end of the 3D view from the default camera; level 50 is nearest.
* The road is a centripetal Catmull-Rom curve through the 50 nodes, so the winding of the old roads is preserved.
* The 3D map and the 2D fallback read the same `ZONE_ART`, so the topology cannot drift.

## Interaction pipeline

* Every node has an invisible hit volume (a low, wide cylinder around the model plus a thin spire up through whatever floats
  above it; not one tall cylinder, which from the camera's angle would cover the node behind it) that R3F raycasts. `onPointerOver/Out` drive the
  hover highlight and the tooltip; `onClick` opens the level. A click whose pointer moved more than 6 px was a pan and is ignored.
* A locked node does not open; it explains itself instead: its tooltip says why (on tap too, for touch screens, for about 2 s).
* Keyboard and screen readers: the canvas group takes arrow keys (pan) and `+ / -` (zoom), the HUD buttons jump to a zone or
  to the player's level, and a visually hidden ordered list holds all 50 levels as real buttons.
* Clicking a normal level goes to `/reels?level=N`; a boss opens the boss arena modal (`MapPage.openLevel`, unchanged behaviour).

## Camera and scrolling

An orbit camera (drei `MapControls`): left-drag / one finger pans on the ground plane, right-drag / two fingers tilt and turn
(+-40 degrees), Ctrl + wheel or a trackpad pinch zooms. The target is clamped to the map every frame, and the map opens on the
player's current level. `rig.focus(x, z, distance)` glides anywhere.

**Three views** (the switcher beside "My level"; the choice is kept in `localStorage` as `anees_map_view`). Their limits live in
`VIEWS` in `CameraRig.tsx`:

| View | Look | Distance (blocks) |
| --- | --- | --- |
| Adventure (default) | three-quarter angle, 23-69 degrees from the vertical | 54, zoom 18-92 |
| Eagle eye | nearly straight down, the whole route as a plan | 108, zoom 70-150 |
| First person | eyes 1.9 blocks above the road, 62 degree lens | the wheel or the up / down keys walk the road, a drag looks around |

Switching between the orbit views glides the distance and tilt; to and from first person the camera moves over 0.8 s (instantly
with reduced motion). First person walks along `PATH_POINTS` (an index that eases to a goal), starts at the road point nearest
where the map was looking, and returns to the orbit view looking at the spot where the walker stands. While walking, the controls'
target follows the walker, so the sky, level of detail and zone buttons keep working. The view change runs in a layout effect:
the next frame already runs in the new mode and would move the target before an ordinary effect could read it.

The plain **wheel travels along the map** (down = towards level 50, about 8 blocks a notch), like scrolling the old tall page. It is
never a scroll trap: at either end of the map the wheel is handed back to the page, so the page scrolls on. The listener is
capture-phase and non-passive, so it runs before the camera controls (which would zoom) and only prevents the default while the
map actually moves. A wheel event that arrives while a mouse button is held (the inertia tail of a trackpad scroll) is swallowed,
so it cannot pull the camera against a drag. The map is sized to fit the first screen, and on phones part of the page stays
outside it so a touch can still scroll the page.

## Authoring

* **A zone** exports a `ZoneModule` (`zones/types.ts`): `baseHeight(x, z)` (landscape, 0 at the zone's ends), optional
  `pathLevel` / `carve`, `Ground` (use `<HeightfieldTerrain/>`), `Scenery`, `atmosphere`. Place things with `scatter()`,
  bake everything static into one mesh with `<Baked/>`, and animate only the few things that move.
* **A node** is `nodes/NodeVisual.tsx`: it receives `{ node, hovered, still, far }` and draws the pad/arena for each state.
* Models are lists of boxes (`defineModel(() => [box(...), ...disc(...)])`), merged once into one vertex-coloured mesh. No
  image or model files exist; everything is code.
* `still` (the visitor's reduced-motion setting) must stop ambient animation.

## Performance

The scene is deliberately light:

* **No shadow maps** (they double the work of every frame) and a **Lambert** material (matte blocks need no PBR): depth comes from
  flat-shaded faces and one fixed sun.
* **Draws on demand**: `frameloop="demand"`; frames are requested by the camera controls, by hover changes, and by a 20 fps
  ambient tick for the few things that move by themselves. The tick stops when the map is off screen or the tab is hidden, and
  does not run at all for visitors with reduced motion.
* **One mesh per concern**: terrain is one merged mesh per zone (two quads per cliff face, no normals, colours softened by a 3x3 blur so the blocks blend), the road is one merged
  ribbon, a zone's static props are baked into one solid + one glow mesh (`bake()` / `<Baked/>`), and zones far from the camera are hidden.
* **Level of detail** for the 50 nodes: only those near where the camera looks get the number, stars, beacon and animation; the
  rest draw as a bare pad with no per-frame work.
* Pixel ratio is capped (1.5, or 1 on low-power devices), antialiasing is off on low-power devices.
* Lazy-loaded: three.js and the map load only on `/map`. If WebGL is missing, errors, or the context is lost, the page shows the flat map.

`window.__map3d.stats() / breakdown() / cost()` (dev server only) report draw calls, triangles per part and the time to draw a frame.

## Dev preview

`http://localhost:5190/dev/map3d` (dev server only, not in the production build, no login). Parameters: `done=N` (levels
1..N completed, N+1 playable), `zone=desert|0-4`, `node=N`, `x= z=`, `dist=`, `polar=` (degrees from straight down), `az=`
(degrees), `view=adventure|eagle|walk`, `still=1`, `full=1`.

## Migration checklist (2D -> 3D), as done here

1. Move the per-zone artwork fractions and aspects into one data module (`layout.ts: ZONE_ART`); make the old page read it.
2. Define the node / connection / zone schema (`schema.ts`) and a pure `buildWorld(levels)` that merges layout and progress.
3. Choose the world scale (1 unit = 1 block, 36 blocks wide) and convert: `x = (fx - 0.5) * W`, `z = z0 + fy * depth`.
4. Build the terrain per zone from a height function; cut the route into it so every level stays reachable.
5. Replace each button with a 3D object per state; keep `state` the only input to its look.
6. Replace button clicks with raycast events on hit volumes; keep the "open level / open boss" handler as it was.
7. Add the camera rig (limits, clamp, fly-to, wheel travel that hands back to the page), lights and per-zone atmosphere.
8. Keep the flat map as the fallback for devices without WebGL; keep keyboard and screen-reader access.
9. Lazy-load the 3D chunk; render on demand; bake static props; add level of detail; verify on a low-power profile and with reduced motion.
