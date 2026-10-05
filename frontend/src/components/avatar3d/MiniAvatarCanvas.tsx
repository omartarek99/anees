import { Canvas } from '@react-three/fiber';
import { AvatarMesh } from './AvatarMesh';
import { isLowPower, type AvatarConfig } from './avatarConfig';

// The small round profile picture: a locked bust-and-face camera, no controls, no shadows, and
// frameloop="demand" -- it renders once, then again only when the config changes, so a student
// sitting on the profile page costs the GPU nothing. The default export is what ProfileAvatar3D
// lazy-loads, keeping three.js out of the main bundle.
export default function MiniAvatarCanvas({ config, onFail }: { config: AvatarConfig; onFail: () => void }) {
  return (
    <Canvas
      frameloop="demand"
      flat
      dpr={[1, isLowPower() ? 1.5 : 2]}
      // rotation:[0,0,0] keeps the camera level (R3F otherwise aims a camera at the origin, i.e. the feet).
      camera={{ position: [0, 1.4, 2.15], rotation: [0, 0, 0], fov: 26, near: 0.5, far: 8 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ pointerEvents: 'none' }}
      onCreated={({ gl }) => {
        // A browser can drop a context under memory pressure (or when too many pages hold one);
        // fall back to the static avatar instead of leaving a blank circle.
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          // R3F deliberately force-loses the context when the canvas unmounts -- not a failure.
          if (!gl.domElement.isConnected) return;
          e.preventDefault();
          onFail();
        });
      }}
    >
      <ambientLight intensity={1.3} />
      <directionalLight position={[2, 3, 3]} intensity={2.4} />
      <AvatarMesh config={config} />
    </Canvas>
  );
}
