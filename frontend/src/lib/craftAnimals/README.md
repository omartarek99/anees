# Builder's Quarry animals

An animal species is **data**: box parts + a painter per part + a few behaviour knobs. The engine turns it into ONE shared
merged geometry and a small pixel-art atlas per skin variant; every individual animal is a single Mesh (one draw call).
Limbs, wings, tails and heads animate in the vertex shader, so animals never need extra meshes.

```
types.ts      SpeciesSpec / PartSpec / JointSpec / Paint  (read this first)
paint.ts      the painter + colour helpers: shade(hex, f), mix(a, b, t), tones(hex, spread, n)
model.ts      builds geometry + atlas; validateSpecies(); getAssets(); createAnimalMesh()
rig.ts        the shader that animates joints (you never touch it)
species/kit.ts          legs4(), legs2(), wings(), headDip(), tailWag(), fur(), eyes()
species/exemplars.ts    pig, cow, dog, cat: THE STYLE REFERENCE (read it before you write anything)
species/<yourfile>.ts   one module per author; exports `SPECIES: SpeciesSpec[]`
```

## Coordinates

Pixels, 16 px = 1 block. Origin = the animal's feet, centred. **+Y up, +Z = the way it faces, +X = the animal's LEFT.**
`at` is the **centre** of a box; `size` = `[w, h, d]` = x, y, z extents. **Box sizes must be integers** (they are texture
pixels); positions and rotations may be fractional. Sizes: a player is 1.8 blocks (29 px) tall; a Minecraft cow is 14 px
tall at the back and 1.4 blocks long. Match the real Minecraft mob's proportions as far as you remember them.

## The atlas

Each part has an unwrap in the species atlas (`tex: [W, H]`, keep it 64x32, 64x64 or 128x64): `uv` is its top-left corner and
it occupies `(2d + 2w) x (d + h)` pixels in the classic cross layout:

```
        +--------+--------+
        |  top   | bottom |        face sizes:  front/back  w x h      nx/px  d x h      top/bottom  w x d
        +----+---+----+---+----+
        | nx | front | px | back |
        +----+--------+----+------+
```

Orientation of each face's image (what the painter coordinates mean; (0,0) is the face's top-left):

| face | image-up | image-right | notes |
| --- | --- | --- | --- |
| `front` (+z) | +y | +x (the animal's left) | the face / chest side |
| `back` (-z) | +y | -x | rump |
| `nx` (the animal's right flank) | +y | +z (towards the head) | head is at the RIGHT of this image |
| `px` (the animal's left flank) | +y | -z (towards the tail) | head is at the LEFT of this image |
| `top` | back (-z) | +x | |
| `bottom` | front (+z) | +x | |

Rules (the preview page and `validateSpecies` check them):
* Every unwrap must lie inside the atlas, and different unwraps must not overlap (their empty corners may interlock).
* Parts with the same `uv` **and** the same `size` share their paint (painted once by the first): left/right legs, ears, wings.
* Paint every face you can see. A pixel you leave unpainted is *transparent and cut out* (alpha test) - useful for fins or
  wing membranes, a bug elsewhere.
* Texture detail belongs in the **paint**, not in extra boxes: spots, stripes, eyes, mouths, hooves, bellies, nostrils.
  Use ~12-40 boxes per animal. More only when the silhouette needs it (a giraffe neck, a shell, tentacles).

## Painting

`skin: (g: Paint) => void`. Calls: `g.speckle(faces, palette)` (random per-pixel shades: the base look), `g.grain(faces, colors,
amount)`, `g.fill`, `g.rect(face, x, y, w, h, color)`, `g.px`, `g.band(faces, y0, y1, color)`, `g.blob(face, cx, cy, r, color)`,
`g.rand()`, `g.variant` (which coat variant is being painted), `g.size(face)`. `faces` = a face, a list, `'sides'` or `'all'`.
Colour helpers: `tones('#c8a070', 0.07)` → five close shades for speckle; `shade('#c8a070', -0.2)` darker, `+0.2` lighter;
`mix(a, b, t)`. Always start with a `speckle`/`tones` base so surfaces are never flat; then add the identifying marks.
**Coat variants**: `variants: n` and branch on `g.variant` inside the painters (see the cow, dog and cat). Max 6.

## Animation (joints)

Add `joint: { chan, axis, amp, phase?, rest?, pivot? }` to a part. The part rotates about `axis` through `pivot` (px; default
the top-centre of the part for `walk`, its centre otherwise). Channels:
* `walk` - limb swing, strength follows the animal's speed. Diagonal leg pairs get phase 0 / Math.PI (`legs4`, `legs2`).
* `flap` - wing / fin beat, active while flying or swimming fast; `rest` = the angle when not flapping (folded wings). `wings()`.
* `idle` - gentle always-on sway (ears, tentacles, frills, antennae). Give neighbours different `phase` so they don't sync.
* `tail` - tail wag, always on. Fish bodies: split the body into 3-4 segments with `tail` joints about the y axis and growing
  `amp` towards the tail, each pivoting at its front edge, for a swimming wave.
* `graze` - the head dips to the ground now and then (`headDip(pivot)`): give the head **and every part glued to it** (snout,
  ears, horns, mane) the same joint so they move together. Only used when the spec has `graze: true`.
Sign conventions: a positive angle about **x** tips the front (+z) of the part *down*; about **y** swings the front towards +x (the
animal's left); about **z** lifts the +x side *up* (so a left wing at +x beats with +amp and the right wing needs -amp, which
`wings()` handles). Don't trust memory: **look at the preview with `walk=1` / `graze=1` / `fly=1`** and flip the sign of `amp`
if a limb swings the wrong way.

## Behaviour knobs (the game reads these)

`move`: `'walk'` (ground, steps up 1 block, avoids ledges) · `'hop'` (ground leaps: rabbit, frog) · `'swim'` (inside water only) ·
`'fly'` (free flight above the ground) · `'float'` (slow drifting high up: happy ghast).
`speed` blocks/s (pig 1.4, cow 1.2, horse 2.2, fish 1.6, bat 3) · `hp` · `habitat: { biomes?, weight, herd? }` with biomes from
`'plains' | 'forest' | 'desert' | 'snowy'` (omit = anywhere); weight 1.0 = a common farm animal, 0.5 uncommon, 0.15-0.25 rare;
`herd: [min, max]` group size · `altitude: [min, max]` blocks above ground for fliers · `depth: [min, max]` blocks under the
surface for swimmers · `minWater` blocks of water depth needed to spawn (dolphin 3, small fish 1) · `graze` · `glow` (0..1 emissive,
glow squid) · `shiver` (strider) · `tameable` (default true; the player can befriend it by clicking; land animals then follow).
`name.en` / `name.ar` (correct Arabic), `emoji`, `kind` (lower_snake_case id).

## Previewing (do this constantly)

The dev server is at http://localhost:5190 (already running; do not start another). Screenshot tool (fresh headless Edge, software GL):

```
node "<scratchpad>/animalshot.mjs" "<query>" "<out.png>" [width] [height]
```
Query parameters (see `pages/AnimalPreviewPage.tsx`): `file=<module>` (ONLY load your own module: `file=pasture`), `kind=a,b`,
`variants=all`, `angle=3q|front|back|left|right|top`, `cols=N`, `walk=1`, `fly=1`, `graze=1`, `water=1` (translucent pond behind
swimmers), `ref=0`. Then **Read the PNG** to look at it. The script prints validation `issues` (must be `{}`), draw-call stats and
console errors, and exits non-zero if anything is wrong. Check every species from the front, the side and 3/4 at least, all
its variants, and animated. Typecheck with `npx tsc --noEmit -p tsconfig.json` from `frontend/` and look only at YOUR file.

## Quality bar

* Instantly recognisable as the Minecraft mob (silhouette first, then colours, then face), kid-friendly and charming.
* Real pixel-art texture: shaded, speckled, with deliberate marks; no flat single-colour boxes, no unpainted faces.
* Proportions and size right relative to the cow/pig/dog/cat exemplars and the 1-block reference cube.
* Cheap: ≤ ~40 parts, atlas ≤ 128x64, ≤ 6 variants, no per-frame work (the engine does all of it).
