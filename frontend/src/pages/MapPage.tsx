import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { AvatarBoundary } from '../components/avatar3d/AvatarBoundary';
import { canUseWebGL } from '../components/avatar3d/avatarConfig';
import { BossArena } from '../components/BossArena';
import { StoryPanel } from '../components/StoryPanel';
import { Map2D } from '../map3d/Map2D';
import type { ApiLevel } from '../map3d/schema';
import type { BattleStatus } from '../lib/battle';

// The 3D scene (three.js and the map's code) loads only when the map is opened.
const AdventureMap3D = lazy(() => import('../map3d/AdventureMap3D'));

export function MapPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [levels, setLevels] = useState<ApiLevel[] | null>(null);
  const [battle, setBattle] = useState<BattleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bossModalLevel, setBossModalLevel] = useState<number | null>(null);
  // A browser that cannot give WebGL (or loses it) gets the flat map instead.
  const [flat, setFlat] = useState(() => !canUseWebGL());

  function load() {
    api
      .get<{ levels: ApiLevel[]; battle?: BattleStatus }>('/map')
      .then((data) => {
        setLevels(data.levels);
        setBattle(data.battle ?? null);
      })
      .catch(() => setError(t('map.loadError')));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openLevel(levelNumber: number) {
    const lvl = levels?.find((l) => l.levelNumber === levelNumber);
    if (!lvl || lvl.status !== 'ready' || lvl.progress.status === 'locked') return;
    if (lvl.kind === 'boss') {
      setBossModalLevel(lvl.levelNumber);
    } else {
      navigate(`/map/level/${lvl.levelNumber}`);
    }
  }

  const flatMap = levels && <Map2D levels={levels} onOpen={openLevel} />;

  return (
    <div className="stack">
      <h1 className="craft-title map-title title-ease">{t('map.title')}</h1>

      {error && <div className="form-error-banner">{error}</div>}
      {!levels && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}

      {levels && <StoryPanel levels={levels} battle={battle} onBattleOver={load} />}

      {levels &&
        (flat ? (
          flatMap
        ) : (
          <AvatarBoundary fallback={flatMap}>
            <Suspense
              fallback={
                <div className="empty-state">
                  <div className="spinner" />
                </div>
              }
            >
              <AdventureMap3D levels={levels} onOpen={openLevel} onContextLost={() => setFlat(true)} />
            </Suspense>
          </AvatarBoundary>
        ))}

      {bossModalLevel !== null && (
        <BossArena
          levelNumber={bossModalLevel}
          onClose={() => {
            setBossModalLevel(null);
            load();
          }}
        />
      )}
    </div>
  );
}
