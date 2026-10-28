import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { AvatarBoundary } from './avatar3d/AvatarBoundary';
import { canUseWebGL, isLowPower } from './avatar3d/avatarConfig';
import type { SceneKind, SceneReward } from './story3d/StoryScene3D';

// The picture in a story window: the 3D scene when the device can draw WebGL, otherwise (no WebGL, a low-power phone, or a 3D
// chunk that fails to load) the flat animated drawing from StoryArt.tsx, passed in as `fallback`.

const Scene3D = lazy(() => import('./story3d/StoryScene3D'));

export function StoryArtView({ kind, reward, fallback }: { kind: SceneKind; reward?: SceneReward; fallback: ReactNode }) {
  const use3d = useMemo(() => canUseWebGL() && !isLowPower(), []);
  const still = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  if (!use3d) return <>{fallback}</>;
  return (
    <AvatarBoundary fallback={fallback}>
      <Suspense
        fallback={
          <div className="story-3d story-3d-wait">
            <div className="spinner" />
          </div>
        }
      >
        <Scene3D kind={kind} reward={reward} still={still} />
      </Suspense>
    </AvatarBoundary>
  );
}
