import type { ViewMode } from './CameraRig';

// The DOM controls over the 3D view: jump to a zone, jump back to the player's level, choose the camera view, and a one-line
// hint. DOM rather than 3D so they are real buttons: focusable, labelled, and styled with the site's own tokens (map3d.css).

export function MapHud({
  zoneNames,
  activeZone,
  onZone,
  onMyLevel,
  view,
  views,
  onView,
  labels,
}: {
  zoneNames: readonly string[];
  activeZone: number;
  onZone: (index: number) => void;
  onMyLevel: () => void;
  view: ViewMode;
  views: readonly { key: ViewMode; icon: string; label: string }[];
  onView: (view: ViewMode) => void;
  labels: { zones: string; myLevel: string; views: string; hint: string };
}) {
  return (
    <>
      <div className="map3d-hud">
        {/* one drop-down instead of a row of five zone buttons (they crowded the top of the map, worst on a phone) */}
        <select className="map3d-zone-select" aria-label={labels.zones} value={activeZone} onChange={(e) => onZone(Number(e.target.value))}>
          {zoneNames.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <div className="map3d-side">
          <button type="button" className="map3d-here" onClick={onMyLevel}>
            <span aria-hidden="true">◎</span> {labels.myLevel}
          </button>
          <div className="map3d-views" role="group" aria-label={labels.views}>
            {views.map((v) => (
              <button key={v.key} type="button" className={v.key === view ? 'is-active' : undefined} aria-pressed={v.key === view} onClick={() => onView(v.key)}>
                <span aria-hidden="true">{v.icon}</span> {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="map3d-hint" aria-hidden="true">
        {labels.hint}
      </p>
    </>
  );
}
