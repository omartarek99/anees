// The DOM controls over the 3D view: jump to a zone, jump back to the player's level, and a one-line hint. DOM rather
// than 3D so they are real buttons: focusable, labelled, and styled with the site's own tokens (map3d.css).

export function MapHud({
  zoneNames,
  activeZone,
  onZone,
  onMyLevel,
  labels,
}: {
  zoneNames: readonly string[];
  activeZone: number;
  onZone: (index: number) => void;
  onMyLevel: () => void;
  labels: { zones: string; myLevel: string; hint: string };
}) {
  return (
    <>
      <div className="map3d-hud">
        <div className="map3d-zones" role="group" aria-label={labels.zones}>
          {zoneNames.map((name, i) => (
            <button key={name} type="button" className={i === activeZone ? 'is-active' : undefined} aria-pressed={i === activeZone} onClick={() => onZone(i)}>
              {name}
            </button>
          ))}
        </div>
        <button type="button" className="map3d-here" onClick={onMyLevel}>
          <span aria-hidden="true">◎</span> {labels.myLevel}
        </button>
      </div>
      <p className="map3d-hint" aria-hidden="true">
        {labels.hint}
      </p>
    </>
  );
}
