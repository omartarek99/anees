import { Suspense, lazy, useMemo } from 'react';
import type { ViewMode } from '../map3d/CameraRig';
import { nodeXZ, ZONES } from '../map3d/layout';
import type { ApiLevel } from '../map3d/schema';

// DEV ONLY (routed at /dev/map3d, not built into production): the 3D map with made-up progress and no login, so the scene
// can be inspected and screenshotted from any angle. Query parameters:
//   done=N      levels 1..N completed, N+1 playable, the rest locked (default 6)
//   zone=key|0-4  look at the middle of a zone      node=N  look at a level      x=&z=  look at a ground position
//   dist= polar= az=   camera distance (blocks), tilt from straight down (degrees), turn (degrees)
//   view=adventure|eagle|walk   the camera view to open in (default adventure; the player's saved choice is ignored here)
//   still=1     no ambient animation (steady screenshots)      full=1  fill the whole window
const AdventureMap3D = lazy(() => import('../map3d/AdventureMap3D'));

export function MapPreviewPage() {
  const q = useMemo(() => new URLSearchParams(window.location.search), []);
  const done = Number(q.get('done') ?? 6);

  const levels = useMemo<ApiLevel[]>(
    () =>
      Array.from({ length: 50 }, (_, i) => {
        const id = i + 1;
        const status = id <= done ? 'completed' : id === done + 1 ? 'available' : 'locked';
        return {
          levelNumber: id,
          title: id % 5 === 0 ? `Boss ${id / 5}` : `Practice level ${id}`,
          titleAr: id % 5 === 0 ? `زعيم ${id / 5}` : `مستوى التدريب ${id}`,
          kind: id % 5 === 0 ? 'boss' : 'normal',
          status: 'ready',
          subject: { key: id % 2 ? 'math' : 'science' },
          progress: { status, stars: status === 'completed' ? 1 + (id % 3) : 0 },
        } as ApiLevel;
      }),
    [done]
  );

  const initialView = useMemo(() => {
    const view: { x?: number; z?: number; distance?: number; polar?: number; azimuth?: number } = {};
    const zone = q.get('zone');
    const node = q.get('node');
    if (zone !== null) {
      const z = ZONES.find((zz) => zz.key === zone) ?? ZONES[Number(zone)] ?? ZONES[0];
      view.x = 0;
      view.z = (z.z0 + z.z1) / 2;
    }
    if (node !== null) Object.assign(view, nodeXZ(Number(node)));
    if (q.get('x') !== null) view.x = Number(q.get('x'));
    if (q.get('z') !== null) view.z = Number(q.get('z'));
    if (q.get('dist') !== null) view.distance = Number(q.get('dist'));
    if (q.get('polar') !== null) view.polar = (Number(q.get('polar')) * Math.PI) / 180;
    if (q.get('az') !== null) view.azimuth = (Number(q.get('az')) * Math.PI) / 180;
    return view;
  }, [q]);

  const view = q.get('view');
  const mode: ViewMode = view === 'eagle' || view === 'walk' ? view : 'adventure';

  return (
    <div style={{ padding: q.get('full') ? 0 : 16 }}>
      {q.get('full') && <style>{'.map3d{block-size:100vh !important;border-radius:0 !important;border:0 !important}'}</style>}
      <Suspense fallback={null}>
        <AdventureMap3D levels={levels} onOpen={(n) => console.log('open level', n)} still={q.get('still') === '1' ? true : undefined} initialView={initialView} initialMode={mode} />
      </Suspense>
    </div>
  );
}
