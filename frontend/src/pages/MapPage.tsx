import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { BossArena } from '../components/BossArena';
import { Topbar } from '../components/Topbar';
type MapLevel = {
  levelNumber: number;
  title: string;
  titleAr?: string | null;
  kind: 'normal' | 'boss';
  status: 'ready' | 'coming_soon';
  subject: { key: string; name: string; nameAr?: string | null; icon: string } | null;
  progress: { status: 'locked' | 'available' | 'completed'; stars: number };
};

const MAP_WIDTH = 340;

// Zones with real hand-drawn map artwork: each has 10 node positions hand-mapped (as
// fractions of the artwork's own width/height) to align exactly with the padlock circles
// drawn into the image. Adding a new image zone here is enough to wire it into positioning,
// rendering and height math throughout this file.
const IMAGE_ZONES: { src: string; aspect: number; fractions: { x: number; y: number }[] }[] = [
  {
    src: '/images/desert-map.jpg',
    aspect: 3510 / 1184, // desert-map.jpg's natural height/width ratio
    fractions: [
      { x: 0.5007, y: 0.049 },
      { x: 0.7748, y: 0.154 },
      { x: 0.837, y: 0.2565 },
      { x: 0.6474, y: 0.3535 },
      { x: 0.3556, y: 0.4525 },
      { x: 0.1807, y: 0.5525 },
      { x: 0.2474, y: 0.649 },
      { x: 0.5037, y: 0.7525 },
      { x: 0.7644, y: 0.854 },
      { x: 0.8222, y: 0.954 },
    ],
  },
  {
    src: '/images/souq-map.jpg',
    aspect: 3532 / 1216,
    fractions: [
      { x: 0.625, y: 0.0648 },
      { x: 0.3456, y: 0.1646 },
      { x: 0.1882, y: 0.2658 },
      { x: 0.2618, y: 0.3671 },
      { x: 0.5191, y: 0.4633 },
      { x: 0.7691, y: 0.5595 },
      { x: 0.8088, y: 0.6633 },
      { x: 0.625, y: 0.762 },
      { x: 0.3485, y: 0.8633 },
      { x: 0.1735, y: 0.9661 },
    ],
  },
  {
    src: '/images/corniche-map.jpg',
    aspect: 3486 / 1184,
    fractions: [
      { x: 0.2529, y: 0.0474 },
      { x: 0.5176, y: 0.1548 },
      { x: 0.7838, y: 0.2582 },
      { x: 0.8309, y: 0.3586 },
      { x: 0.6353, y: 0.452 },
      { x: 0.3529, y: 0.552 },
      { x: 0.1765, y: 0.6484 },
      { x: 0.2618, y: 0.7492 },
      { x: 0.5265, y: 0.8516 },
      { x: 0.8059, y: 0.953 },
    ],
  },
  {
    src: '/images/observatory-map.jpg',
    aspect: 3486 / 1184,
    fractions: [
      { x: 0.8191, y: 0.0474 },
      { x: 0.6221, y: 0.1538 },
      { x: 0.3265, y: 0.2582 },
      { x: 0.1647, y: 0.3631 },
      { x: 0.2529, y: 0.4535 },
      { x: 0.5265, y: 0.552 },
      { x: 0.7897, y: 0.6494 },
      { x: 0.8191, y: 0.7492 },
      { x: 0.625, y: 0.8516 },
      { x: 0.3265, y: 0.9581 },
    ],
  },
  {
    src: '/images/falcon-map.jpg',
    aspect: 3558 / 1184,
    fractions: [
      { x: 0.1502, y: 0.0475 },
      { x: 0.2553, y: 0.15 },
      { x: 0.5285, y: 0.254 },
      { x: 0.7763, y: 0.355 },
      { x: 0.8153, y: 0.4475 },
      { x: 0.6081, y: 0.545 },
      { x: 0.3228, y: 0.645 },
      { x: 0.1577, y: 0.745 },
      { x: 0.2327, y: 0.849 },
      { x: 0.5285, y: 0.954 },
    ],
  },
];
const IMAGE_ZONE_HEIGHTS = IMAGE_ZONES.map((z) => Math.round(MAP_WIDTH * z.aspect));
const IMAGE_ZONES_HEIGHT = IMAGE_ZONE_HEIGHTS.reduce((a, b) => a + b, 0);

function imageZoneStartY(zoneIdx: number) {
  let y = 0;
  for (let i = 0; i < zoneIdx; i++) y += IMAGE_ZONE_HEIGHTS[i];
  return y;
}

// Node centres in the stage's coordinate system (levels 1..50, ten per image zone).
const POSITIONS = Array.from({ length: IMAGE_ZONES.length * 10 }, (_, i) => {
  const zoneIdx = Math.floor(i / 10);
  const f = IMAGE_ZONES[zoneIdx].fractions[i % 10];
  return { x: f.x * MAP_WIDTH, y: imageZoneStartY(zoneIdx) + f.y * IMAGE_ZONE_HEIGHTS[zoneIdx] };
});

export function MapPage() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [levels, setLevels] = useState<MapLevel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bossModalLevel, setBossModalLevel] = useState<number | null>(null);

  const zoneNames = [t('map.zoneDesert'), t('map.zoneSouq'), t('map.zoneCorniche'), t('map.zoneObservatory'), t('map.zoneFalcon')];

  function load() {
    api
      .get<{ levels: MapLevel[] }>('/map')
      .then((data) => setLevels(data.levels))
      .catch(() => setError(t('map.loadError')));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Nodes and artwork are laid out in a fixed 340px coordinate system; on a narrower card the
  // whole stage is scaled down together so the nodes stay on their padlocks (not clipped or drifting).
  const mapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const mapReady = levels !== null;
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / MAP_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapReady]);

  function handleNodeClick(lvl: MapLevel) {
    if (lvl.status !== 'ready' || lvl.progress.status === 'locked') return;
    if (lvl.kind === 'boss') {
      setBossModalLevel(lvl.levelNumber);
    } else {
      navigate(`/reels?level=${lvl.levelNumber}`);
    }
  }

  return (
    <div className="stack">
      <Topbar title={t('map.title')} subtitle={t('map.subtitle')} />

      {error && <div className="form-error-banner">{error}</div>}
      {!levels && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}

      {levels && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div ref={mapRef} style={{ position: 'relative', width: '100%', maxWidth: MAP_WIDTH, margin: '0 auto', height: IMAGE_ZONES_HEIGHT * scale }}>
          {/* Pinned to the physical left: in RTL a wider-than-parent box would otherwise overflow leftwards and the scale() would land off-centre. */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: MAP_WIDTH, height: IMAGE_ZONES_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {IMAGE_ZONES.map((zone, i) => (
              <div key={zone.src} style={{ position: 'absolute', top: imageZoneStartY(i), left: 0, right: 0, height: IMAGE_ZONE_HEIGHTS[i], overflow: 'hidden' }}>
                <img src={zone.src} alt={zoneNames[i]} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ))}

            {levels.map((lvl) => {
              const pos = POSITIONS[lvl.levelNumber - 1];
              const locked = lvl.status !== 'ready' || lvl.progress.status === 'locked';
              const completed = lvl.progress.status === 'completed';
              const available = !locked && lvl.progress.status === 'available';
              const isBoss = lvl.kind === 'boss';
              const levelTitle = pickText(lang, lvl.title, lvl.titleAr);

              // Nodes overlay the padlock circles already drawn into the artwork, so the button
              // stays transparent and just adds a state cue (glow ring when playable, solid green
              // + level number once completed) rather than covering the artwork with a flat circle.
              const size = isBoss ? 56 : 46;
              const showNumber = (available || completed) && lvl.levelNumber !== 1;
              return (
                <button
                  key={lvl.levelNumber}
                  onClick={() => handleNodeClick(lvl)}
                  disabled={locked}
                  title={`${t('reels.level', { n: lvl.levelNumber })}: ${levelTitle}`}
                  style={{
                    position: 'absolute',
                    left: pos.x - size / 2,
                    top: pos.y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    border: available ? '3px solid #f0c96a' : completed ? '3px solid #2f8f5b' : 'none',
                    background: completed ? 'rgba(46,143,91,0.62)' : 'transparent',
                    boxShadow: available ? '0 0 0 6px rgba(240,201,106,0.35), 0 0 16px rgba(240,201,106,0.65)' : 'none',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  {showNumber && (
                    <span style={{ fontSize: 16, color: 'white', fontWeight: 900, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                      {lvl.levelNumber}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </div>
        </div>
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
    </div>
  );
}
