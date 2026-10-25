import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { ZONE_ART } from './layout';
import type { ApiLevel } from './schema';

// The original flat map (artwork with buttons laid over it), kept only as the fallback for a device whose browser cannot
// give WebGL. It reads its zones and node positions from layout.ts, the same single source the 3D map is built from.

const MAP_WIDTH = 340;
const ZONE_HEIGHTS = ZONE_ART.map((z) => Math.round(MAP_WIDTH * z.aspect));
const TOTAL_HEIGHT = ZONE_HEIGHTS.reduce((a, b) => a + b, 0);

function zoneStartY(zoneIdx: number) {
  let y = 0;
  for (let i = 0; i < zoneIdx; i++) y += ZONE_HEIGHTS[i];
  return y;
}

// Node centres in the stage's coordinate system (levels 1..50, ten per zone).
const POSITIONS = Array.from({ length: ZONE_ART.length * 10 }, (_, i) => {
  const zoneIdx = Math.floor(i / 10);
  const f = ZONE_ART[zoneIdx].fractions[i % 10];
  return { x: f.x * MAP_WIDTH, y: zoneStartY(zoneIdx) + f.y * ZONE_HEIGHTS[zoneIdx] };
});

export function Map2D({ levels, onOpen }: { levels: readonly ApiLevel[]; onOpen: (levelNumber: number) => void }) {
  const { t, lang } = useLanguage();
  const zoneNames = ZONE_ART.map((z) => t(z.nameKey));

  // Nodes and artwork are laid out in a fixed 340px coordinate system; on a narrower card the
  // whole stage is scaled down together so the nodes stay on their padlocks (not clipped or drifting).
  const mapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / MAP_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', width: 'fit-content', maxWidth: '100%', margin: '0 auto' }}>
      <div ref={mapRef} style={{ position: 'relative', width: MAP_WIDTH, maxWidth: '100%', height: TOTAL_HEIGHT * scale }}>
        {/* Pinned to the physical left: in RTL a wider-than-parent box would otherwise overflow leftwards and the scale() would land off-centre. */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: MAP_WIDTH, height: TOTAL_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {ZONE_ART.map((zone, i) => (
            <div key={zone.src} style={{ position: 'absolute', top: zoneStartY(i), left: 0, right: 0, height: ZONE_HEIGHTS[i], overflow: 'hidden' }}>
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
                onClick={() => onOpen(lvl.levelNumber)}
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
  );
}
