// The 3D boy, built from primitives (capsules, cylinders, spheres, tori) so the feature works
// with no model files. Everything that depends on the student's choices is conditional JSX, and
// the colours are plain props -- react-three-fiber updates those in place, so changing a colour
// never rebuilds geometry. Feet at y = 0, facing +z, ~1.8 units tall; every part is a child of
// one <group> so a caller can scale or rotate the whole character.
//
// ── Swapping in a real model (e.g. exported from Blender) ──────────────────────────────────
// 1. Drop the file at frontend/public/avatar.glb and name its meshes Skin, Thobe, Shirt, Pants,
//    Ghutra, Cap, Glasses, Sunglasses (anything the config toggles or tints).
// 2. Replace AvatarMeshBase below with something like:
//
//    import { useGLTF } from '@react-three/drei';
//    function AvatarMeshBase({ config }: { config: AvatarConfig }) {
//      const { scene } = useGLTF('/avatar.glb');               // cached + shared by every canvas
//      useLayoutEffect(() => {
//        const show = (name: string, on: boolean) => { const o = scene.getObjectByName(name); if (o) o.visible = on; };
//        const tint = (name: string, hex: string) => {
//          const m = (scene.getObjectByName(name) as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
//          m?.color.set(hex);
//        };
//        tint('Skin', SKIN_TONES[config.skin]);
//        show('Thobe', config.outfit === 'thobe');  tint('Thobe', THOBE_COLORS[config.thobe]);
//        show('Shirt', config.outfit === 'casual'); tint('Shirt', PALETTE[config.topColor]);
//        show('Ghutra', config.headwear === 'ghutra');
//        show('Cap', config.headwear === 'cap');    tint('Cap', PALETTE[config.capColor]);
//        show('Glasses', config.accessory === 'reading');
//        show('Sunglasses', config.accessory === 'sunglasses');
//      }, [scene, config]);
//      return <primitive object={scene} />;
//    }
//    useGLTF.preload('/avatar.glb');
//
// MiniAvatarCanvas and AvatarCustomizerModal need no changes -- they only render <AvatarMesh />.
import { memo } from 'react';
import type { MeshProps } from '@react-three/fiber';
import { BOTTOM_COLORS, PALETTE, SKIN_TONES, THOBE_COLORS, type AvatarConfig } from './avatarConfig';

const HAIR = '#1f1a17';
const SHOE = '#2b2d33';
const SANDAL = '#6b4a2b';
const GOLD = '#c9a24b';
const EGAL = '#14151a';
const HEAD_Y = 1.47; // head centre; head and everything worn on it is modelled around its own origin

type PartProps = MeshProps & { color: string; rough?: number; metal?: number };

// One mesh + standard material. castShadow is free when the canvas has shadows off (the mini one).
function Part({ color, rough = 0.75, metal = 0, children, ...mesh }: PartProps) {
  return (
    <mesh castShadow {...mesh}>
      {children}
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
    </mesh>
  );
}

const SIDES = [-1, 1] as const;

function Face({ skin }: { skin: string }) {
  return (
    <>
      <Part color={skin} rough={0.6} scale={[1, 1.04, 1]}>
        <sphereGeometry args={[0.33, 32, 24]} />
      </Part>
      {SIDES.map((s) => (
        <group key={s}>
          <Part color={skin} rough={0.6} position={[s * 0.325, -0.01, 0]} scale={[0.5, 1, 1]}>
            <sphereGeometry args={[0.06, 12, 10]} />
          </Part>
          <Part color="#15151a" rough={0.3} position={[s * 0.12, 0.02, 0.298]} scale={[1, 1.3, 0.6]}>
            <sphereGeometry args={[0.036, 12, 10]} />
          </Part>
          <Part color="#ffffff" rough={0.2} position={[s * 0.12 + 0.01, 0.036, 0.316]}>
            <sphereGeometry args={[0.011, 8, 6]} />
          </Part>
          <Part color={HAIR} position={[s * 0.12, 0.085, 0.3]} rotation={[0, 0, Math.PI / 2 + s * 0.1]}>
            <capsuleGeometry args={[0.012, 0.07, 2, 6]} />
          </Part>
        </group>
      ))}
      <Part color={skin} rough={0.6} position={[0, -0.04, 0.325]} scale={[1, 1, 1.1]}>
        <sphereGeometry args={[0.03, 12, 10]} />
      </Part>
      <Part color="#7a2e2e" rough={0.5} position={[0, -0.1, 0.312]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.055, 0.008, 6, 16, Math.PI]} />
      </Part>
    </>
  );
}

// Short dark hair, shown only with no headwear. The cap is tilted back so the hairline sits
// above the brows at the front and drops to the nape at the back.
function Hair() {
  return (
    <Part color={HAIR} rough={0.9} position={[0, 0.005, 0]} rotation={[-0.3, 0, 0]}>
      <sphereGeometry args={[0.352, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
    </Part>
  );
}

// Ghutra: a white cloth dome over the head, drapes down both sides and the back (one U-shaped
// wrap), held by the black egal cord.
function Ghutra() {
  return (
    <>
      <Part color="#f7f5ef" rough={0.9} position={[0, 0.02, 0]} rotation={[-0.4, 0, 0]}>
        <sphereGeometry args={[0.372, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </Part>
      {SIDES.map((s) => (
        <Part key={s} color="#f7f5ef" rough={0.9} position={[s * 0.345, -0.1, -0.12]} rotation={[0, 0, s * 0.06]}>
          <boxGeometry args={[0.04, 0.34, 0.46]} />
        </Part>
      ))}
      <Part color="#f7f5ef" rough={0.9} position={[0, -0.17, -0.33]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.72, 0.4, 0.045]} />
      </Part>
      <Part color={EGAL} rough={0.5} position={[0, 0.075, 0]} rotation={[Math.PI / 2 - 0.3, 0, 0]}>
        <torusGeometry args={[0.352, 0.026, 8, 40]} />
      </Part>
    </>
  );
}

function Cap({ color }: { color: string }) {
  return (
    <group position={[0, 0.06, 0]} rotation={[-0.3, 0, 0]}>
      <Part color={color} rough={0.8}>
        <sphereGeometry args={[0.352, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </Part>
      {/* Brim: the front half of a flat disc, pivoting on the dome's rim. */}
      <group position={[0, 0, 0.3]} rotation={[0.65, 0, 0]}>
        <Part color={color} rough={0.8} scale={[1.2, 1, 1]}>
          <cylinderGeometry args={[0.24, 0.24, 0.03, 24, 1, false, -Math.PI / 2, Math.PI]} />
        </Part>
      </group>
    </group>
  );
}

function Glasses({ kind }: { kind: 'reading' | 'sunglasses' }) {
  const frame = kind === 'reading' ? GOLD : EGAL;
  return (
    <group position={[0, 0.02, 0.318]}>
      {SIDES.map((s) => (
        <group key={s}>
          {kind === 'reading' ? (
            <Part color={frame} rough={0.3} metal={0.6} position={[s * 0.125, 0, 0]}>
              <torusGeometry args={[0.082, 0.009, 8, 28]} />
            </Part>
          ) : (
            <Part color="#0b0d12" rough={0.15} metal={0.4} position={[s * 0.125, 0, 0]}>
              <boxGeometry args={[0.15, 0.1, 0.025]} />
            </Part>
          )}
          <Part color={frame} rough={0.4} metal={kind === 'reading' ? 0.6 : 0} position={[s * 0.293, 0.01, -0.168]} rotation={[0, -s * 0.37, 0]}>
            <boxGeometry args={[0.009, 0.009, 0.34]} />
          </Part>
        </group>
      ))}
      <Part color={frame} rough={0.4} metal={kind === 'reading' ? 0.6 : 0} position={[0, 0.015, 0.006]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.007, 0.05, 2, 6]} />
      </Part>
      {kind === 'sunglasses' && (
        <Part color={frame} rough={0.4} position={[0, 0.055, 0.004]}>
          <boxGeometry args={[0.34, 0.018, 0.03]} />
        </Part>
      )}
    </group>
  );
}

function Thobe({ color }: { color: string }) {
  return (
    <>
      <Part color={color} rough={0.85} position={[0, 0.54, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.98, 28]} />
      </Part>
      {/* Rounded shoulders over the cylinder's flat top. */}
      <Part color={color} rough={0.85} position={[0, 0.98, 0]} scale={[1.2, 0.62, 0.95]}>
        <sphereGeometry args={[0.21, 24, 14]} />
      </Part>
      {/* Front placket + buttons, tilted to follow the cylinder's taper. */}
      <Part color={color} rough={0.85} position={[0, 0.84, 0.224]} rotation={[-0.095, 0, 0]}>
        <boxGeometry args={[0.03, 0.34, 0.012]} />
      </Part>
      {[0.95, 0.87, 0.79].map((y) => (
        <Part key={y} color="#e8e2d2" rough={0.4} position={[0, y, 0.236 - (y - 0.8) * 0.095]}>
          <sphereGeometry args={[0.014, 8, 6]} />
        </Part>
      ))}
      {SIDES.map((s) => (
        <Part key={s} color={SANDAL} rough={0.8} position={[s * 0.1, 0.035, 0.2]} scale={[1, 0.45, 1.5]}>
          <sphereGeometry args={[0.09, 14, 10]} />
        </Part>
      ))}
    </>
  );
}

// Shirt and pants are separate meshes so each takes its own colour.
function Casual({ top, topColor, bottom }: { top: AvatarConfig['top']; topColor: string; bottom: string }) {
  return (
    <>
      <Part color={topColor} rough={0.85} position={[0, 0.78, 0]}>
        <capsuleGeometry args={[0.215, 0.26, 6, 20]} />
      </Part>
      {top === 'hoodie' && (
        <>
          <Part color={topColor} rough={0.9} position={[0, 1.09, -0.03]} rotation={[Math.PI / 2 + 0.35, 0, 0]}>
            <torusGeometry args={[0.15, 0.07, 10, 22]} />
          </Part>
          {SIDES.map((s) => (
            <Part key={s} color="#e8e8e4" rough={0.7} position={[s * 0.05, 0.97, 0.205]}>
              <capsuleGeometry args={[0.008, 0.14, 2, 6]} />
            </Part>
          ))}
        </>
      )}
      <Part color={bottom} rough={0.9} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.205, 0.2, 0.2, 22]} />
      </Part>
      {SIDES.map((s) => (
        <group key={s}>
          <Part color={bottom} rough={0.9} position={[s * 0.1, 0.25, 0]}>
            <capsuleGeometry args={[0.095, 0.32, 4, 12]} />
          </Part>
          <Part color={SHOE} rough={0.6} position={[s * 0.1, 0.05, 0.06]} scale={[1, 0.6, 1.55]}>
            <sphereGeometry args={[0.1, 14, 10]} />
          </Part>
        </group>
      ))}
    </>
  );
}

// Both arms, hanging from the shoulders: full sleeves (thobe, hoodie) or short sleeves (T-shirt)
// with bare forearms.
function Arms({ sleeve, skin, short }: { sleeve: string; skin: string; short: boolean }) {
  return (
    <>
      {SIDES.map((s) => (
        <group key={s} position={[s * 0.27, 1.0, 0]} rotation={[0, 0, s * 0.1]}>
          {short ? (
            <>
              <Part color={sleeve} rough={0.85} position={[0, -0.07, 0]}>
                <capsuleGeometry args={[0.082, 0.1, 4, 10]} />
              </Part>
              <Part color={skin} rough={0.6} position={[0, -0.24, 0]}>
                <capsuleGeometry args={[0.062, 0.2, 4, 10]} />
              </Part>
            </>
          ) : (
            <Part color={sleeve} rough={0.85} position={[0, -0.2, 0]}>
              <capsuleGeometry args={[0.075, 0.3, 4, 10]} />
            </Part>
          )}
          <Part color={skin} rough={0.6} position={[0, -0.41, 0]}>
            <sphereGeometry args={[0.065, 14, 10]} />
          </Part>
        </group>
      ))}
    </>
  );
}

function AvatarMeshBase({ config }: { config: AvatarConfig }) {
  const skin = SKIN_TONES[config.skin];
  const isThobe = config.outfit === 'thobe';
  const sleeve = isThobe ? THOBE_COLORS[config.thobe] : PALETTE[config.topColor];

  return (
    <group>
      {isThobe ? (
        <Thobe color={sleeve} />
      ) : (
        <Casual top={config.top} topColor={sleeve} bottom={BOTTOM_COLORS[config.bottom]} />
      )}
      <Arms sleeve={sleeve} skin={skin} short={!isThobe && config.top === 'tshirt'} />
      <Part color={skin} rough={0.6} position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.085, 0.095, 0.14, 16]} />
      </Part>

      <group position={[0, HEAD_Y, 0]}>
        <Face skin={skin} />
        {config.headwear === 'none' && <Hair />}
        {config.headwear === 'ghutra' && <Ghutra />}
        {config.headwear === 'cap' && <Cap color={PALETTE[config.capColor]} />}
        {config.accessory !== 'none' && <Glasses kind={config.accessory} />}
      </group>
    </group>
  );
}

// memo: the parent re-renders on every unrelated state change (saving flag, open tab...);
// the config object only changes identity when a choice does.
export const AvatarMesh = memo(AvatarMeshBase);
