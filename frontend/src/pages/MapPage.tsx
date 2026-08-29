import { useEffect, useMemo, useState } from 'react';
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

const ROW_HEIGHT = 100;
const AMPLITUDE = 110;
const CENTER_X = 170;
const TOP_PAD = 70;
const MAP_WIDTH = 340;

// Zones with real hand-drawn map artwork: each has 10 node positions hand-mapped (as
// fractions of the artwork's own width/height) to align exactly with the padlock circles
// drawn into the image, rather than computed from the generic sine-wave path used for the
// remaining zones. Adding a new image zone here is enough to wire it into positioning,
// rendering, and path/height math throughout this file.
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
const IMAGE_LEVELS_COUNT = IMAGE_ZONES.length * 10;

function imageZoneStartY(zoneIdx: number) {
  let y = 0;
  for (let i = 0; i < zoneIdx; i++) y += IMAGE_ZONE_HEIGHTS[i];
  return y;
}

function nodePosition(index: number) {
  if (index < IMAGE_LEVELS_COUNT) {
    const zoneIdx = Math.floor(index / 10);
    const f = IMAGE_ZONES[zoneIdx].fractions[index % 10];
    return { x: f.x * MAP_WIDTH, y: imageZoneStartY(zoneIdx) + f.y * IMAGE_ZONE_HEIGHTS[zoneIdx] };
  }
  const rest = index - IMAGE_LEVELS_COUNT;
  const y = IMAGE_ZONES_HEIGHT + TOP_PAD + rest * ROW_HEIGHT;
  const x = CENTER_X + AMPLITUDE * Math.sin(index * 0.9);
  return { x, y };
}

export function MapPage() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [levels, setLevels] = useState<MapLevel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bossModalLevel, setBossModalLevel] = useState<number | null>(null);

  const ZONES = [
    {
      min: 1,
      max: 10,
      name: t('map.zoneDesert'),
      icon: '🏜️',
      pathBase: '#c17a3a',
      pathHi: '#e0a860',
      stoneAvail: ['#93a2c9', '#4d5a86'],
      stoneBorder: '#333c5c',
    },
    {
      min: 11,
      max: 20,
      name: t('map.zoneSouq'),
      icon: '🏺',
      pathBase: '#b8563f',
      pathHi: '#e08a6a',
      stoneAvail: ['#e0937a', '#a3543a'],
      stoneBorder: '#7a3a26',
    },
    {
      min: 21,
      max: 30,
      name: t('map.zoneCorniche'),
      icon: '🌊',
      pathBase: '#3d7bd9',
      pathHi: '#7fb3e8',
      stoneAvail: ['#7ab8e0', '#2e6a96'],
      stoneBorder: '#1f4a6b',
    },
    {
      min: 31,
      max: 40,
      name: t('map.zoneObservatory'),
      icon: '🔭',
      pathBase: '#6a5acd',
      pathHi: '#b8aaf0',
      stoneAvail: ['#a68be0', '#5c3a96'],
      stoneBorder: '#3f2a6b',
    },
    {
      min: 41,
      max: 50,
      name: t('map.zoneFalcon'),
      icon: '🏔️',
      pathBase: '#5c6b4f',
      pathHi: '#a3ad9a',
      stoneAvail: ['#a8b89a', '#5c6b4f'],
      stoneBorder: '#3d4736',
    },
  ];

  function load() {
    api
      .get<{ levels: MapLevel[] }>('/map')
      .then((data) => setLevels(data.levels))
      .catch(() => setError(t('map.loadError')));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const positions = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    for (let i = 0; i < 50; i++) map.set(i + 1, nodePosition(i));
    return map;
  }, []);

  // Image zones' paths are baked into their own artwork, so they're excluded here — only the
  // connectors between zones (10→11, 20→21, ...) are drawn on the SVG layer.
  const imageZoneMins = IMAGE_ZONES.map((_, i) => i * 10 + 1);
  const zonePaths = ZONES.filter((zone) => !imageZoneMins.includes(zone.min)).map((zone) => {
    const fromLevel = zone.min - 1;
    let d = '';
    for (let i = fromLevel; i <= zone.max; i++) {
      const p = positions.get(i)!;
      d += i === fromLevel ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`;
    }
    return { key: zone.name, d, pathBase: zone.pathBase, pathHi: zone.pathHi };
  });

  const remainingLevels = 50 - IMAGE_LEVELS_COUNT;
  const totalHeight = IMAGE_ZONES_HEIGHT + (remainingLevels > 0 ? TOP_PAD + remainingLevels * ROW_HEIGHT : 0);

  function zoneForLevel(levelNumber: number) {
    return ZONES.find((z) => levelNumber >= z.min && levelNumber <= z.max)!;
  }

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
          <div style={{ position: 'relative', width: '100%', maxWidth: 340, margin: '0 auto', height: totalHeight }}>
            {ZONES.map((zone) => {
              const imageZoneIdx = imageZoneMins.indexOf(zone.min);
              const isImageZone = imageZoneIdx !== -1;
              const imageSrc = isImageZone ? IMAGE_ZONES[imageZoneIdx].src : null;
              const startY = isImageZone
                ? imageZoneStartY(imageZoneIdx)
                : IMAGE_ZONES_HEIGHT + TOP_PAD - ROW_HEIGHT / 2 + (zone.min - (IMAGE_LEVELS_COUNT + 1)) * ROW_HEIGHT;
              const zoneHeight = isImageZone ? IMAGE_ZONE_HEIGHTS[imageZoneIdx] : (zone.max - zone.min + 1) * ROW_HEIGHT;
              return (
                <div
                  key={zone.name}
                  style={{
                    position: 'absolute',
                    top: startY,
                    left: 0,
                    right: 0,
                    height: zoneHeight,
                    overflow: 'hidden',
                  }}
                >
                  {imageSrc ? (
                    <img src={imageSrc} alt={zone.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div className="flex-center" style={{ width: '100%' }}>
                      <span
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          fontWeight: 800,
                          color: 'var(--maroon-dark)',
                          background: 'rgba(255,255,255,0.8)',
                          padding: '2px 10px',
                          borderRadius: 'var(--radius-pill)',
                          height: 20,
                          position: 'relative',
                          zIndex: 1,
                        }}
                      >
                        {zone.icon} {zone.name}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            <svg width="100%" height={totalHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
              {zonePaths.map((zp) => (
                <g key={zp.key}>
                  <path d={zp.d} fill="none" stroke={zp.pathBase} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                  <path d={zp.d} fill="none" stroke={zp.pathHi} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 13" />
                </g>
              ))}
            </svg>

            {levels.map((lvl) => {
              const pos = positions.get(lvl.levelNumber)!;
              const locked = lvl.status !== 'ready' || lvl.progress.status === 'locked';
              const completed = lvl.progress.status === 'completed';
              const available = !locked && lvl.progress.status === 'available';
              const isBoss = lvl.kind === 'boss';
              const zone = zoneForLevel(lvl.levelNumber);
              const levelTitle = pickText(lang, lvl.title, lvl.titleAr);

              if (imageZoneMins.includes(zone.min)) {
                // Image zones: nodes overlay the padlock circles already drawn into their
                // artwork, so the button stays transparent and just adds a state cue (glow
                // ring when playable, solid green + level number once completed) rather than
                // covering the artwork with a flat stone circle.
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
              }

              const stoneBg = locked
                ? 'radial-gradient(circle at 35% 30%, #a8afc2, #5c6480)'
                : completed
                  ? 'radial-gradient(circle at 35% 30%, #7ed6a0, #2f8f5b)'
                  : `radial-gradient(circle at 35% 30%, ${zone.stoneAvail[0]}, ${zone.stoneAvail[1]})`;
              const borderColor = completed ? '#1f6b42' : locked ? '#454d63' : zone.stoneBorder;

              return (
                <button
                  key={lvl.levelNumber}
                  onClick={() => handleNodeClick(lvl)}
                  disabled={locked}
                  title={`${t('reels.level', { n: lvl.levelNumber })}: ${levelTitle}`}
                  style={{
                    position: 'absolute',
                    left: pos.x - (isBoss ? 28 : 22),
                    top: pos.y - (isBoss ? 28 : 22),
                    width: isBoss ? 56 : 44,
                    height: isBoss ? 56 : 44,
                    borderRadius: '50%',
                    border: `3px solid ${borderColor}`,
                    background: isBoss ? 'var(--maroon)' : stoneBg,
                    color: 'white',
                    fontSize: isBoss ? 24 : 18,
                    fontWeight: 800,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    boxShadow: `${available ? '0 0 0 6px rgba(201,162,75,0.35), ' : ''}0 4px 10px rgba(20,30,60,0.3), inset 0 2px 3px rgba(255,255,255,0.4), inset 0 -3px 5px rgba(0,0,0,0.2)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  {locked ? '🔒' : isBoss ? '👹' : completed ? '✓' : lvl.levelNumber}
                </button>
              );
            })}
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
