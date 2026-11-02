import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { AvatarBoundary } from '../components/avatar3d/AvatarBoundary';
import { canUseWebGL } from '../components/avatar3d/avatarConfig';
import { BossArena } from '../components/BossArena';
import { LevelQuizModal } from '../components/LevelQuizModal';
import { StoryPanel } from '../components/StoryPanel';
import { Map2D } from '../map3d/Map2D';
import type { ApiLevel } from '../map3d/schema';
import type { BattleStatus } from '../lib/battle';

// The 3D scene (three.js and the map's code) loads only when the map is opened.
const AdventureMap3D = lazy(() => import('../map3d/AdventureMap3D'));

export function MapPage() {
  const { t } = useLanguage();
  const [levels, setLevels] = useState<ApiLevel[] | null>(null);
  const [battle, setBattle] = useState<BattleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bossModalLevel, setBossModalLevel] = useState<number | null>(null);
  // A level's questions open in a pop-up window over the map (as a boss level does), not on a page of their own.
  const [quizModalLevel, setQuizModalLevel] = useState<number | null>(null);
  // Full screen, as on the Craft page: the map and its pop-up windows live in one element (fsRef) that is shown full screen, so the windows stay
  // visible. A small corner button (⛶, then ✕ to go back) switches it. When the browser will not do real full screen (or never answers, as some embedded
  // browsers and iPhone Safari do) the same element simply fills the viewport with CSS instead.
  const fsRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const fsElement = () => document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null;
  function exitFullscreenMode() {
    if (fsElement()) {
      const d = document as unknown as { exitFullscreen?: () => Promise<void>; webkitExitFullscreen?: () => void };
      Promise.resolve((d.exitFullscreen ?? d.webkitExitFullscreen)?.call(document)).catch(() => {});
    }
    setIsFullscreen(false);
  }
  function toggleFullscreen() {
    if (isFullscreen) {
      exitFullscreenMode();
      return;
    }
    const el = fsRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const req = el?.requestFullscreen ?? el?.webkitRequestFullscreen;
    if (!el || !req) {
      setIsFullscreen(true); // no Fullscreen API at all: the CSS fill-the-viewport mode
      return;
    }
    try {
      const p = req.call(el);
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => setIsFullscreen(true));
    } catch {
      setIsFullscreen(true);
    }
    // Some browsers never answer (no success, no failure, no event): if it is still not full screen a moment later, fill the viewport instead.
    window.setTimeout(() => {
      if (!fsElement()) setIsFullscreen(true);
    }, 350);
  }
  // Escape goes back (the browser does it itself for real full screen). A pop-up window open over the map takes the Escape first.
  useEscapeToClose(exitFullscreenMode, isFullscreen && quizModalLevel === null && bossModalLevel === null);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!fsElement());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  function openLevel(levelNumber: number) {
    const lvl = levels?.find((l) => l.levelNumber === levelNumber);
    if (!lvl || lvl.status !== 'ready' || lvl.progress.status === 'locked') return;
    if (lvl.kind === 'boss') {
      setBossModalLevel(lvl.levelNumber);
    } else {
      setQuizModalLevel(lvl.levelNumber);
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

      {levels && (
        <div ref={fsRef} className={`map-fs-root${isFullscreen ? ' is-fullscreen' : ''}`}>
          <button
            type="button"
            className="map-fs-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? t('map.exitFullscreen') : t('map.fullscreen')}
            aria-label={isFullscreen ? t('map.exitFullscreen') : t('map.fullscreen')}
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>

          {flat ? (
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
          )}

          {bossModalLevel !== null && (
            <BossArena
              levelNumber={bossModalLevel}
              onClose={() => {
                setBossModalLevel(null);
                load();
              }}
            />
          )}

          {quizModalLevel !== null && (
            <LevelQuizModal
              levelNumber={quizModalLevel}
              onClose={() => {
                setQuizModalLevel(null);
                load();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
