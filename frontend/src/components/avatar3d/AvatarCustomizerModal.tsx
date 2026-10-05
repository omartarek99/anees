import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RiCloseLine, RiGlassesLine, RiShirtLine, RiUserSmileLine, RiVipCrownLine } from '@remixicon/react';
import { useLanguage } from '../../lib/language-context';
import { AvatarBoundary } from './AvatarBoundary';
import { AvatarMesh } from './AvatarMesh';
import {
  ACCESSORIES,
  BOTTOM_COLORS,
  HEADWEAR,
  OUTFITS,
  PALETTE,
  SKIN_TONES,
  THOBE_COLORS,
  TOPS,
  isLowPower,
  type AvatarConfig,
} from './avatarConfig';

type Props = {
  config: AvatarConfig; // the live draft -- ProfileAvatar3D owns it, so the mini avatar mirrors every click
  onChange: (patch: Partial<AvatarConfig>) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
};

const TABS = [
  { id: 'skin', Icon: RiUserSmileLine },
  { id: 'outfit', Icon: RiShirtLine },
  { id: 'headwear', Icon: RiVipCrownLine },
  { id: 'accessory', Icon: RiGlassesLine },
] as const;
type TabId = (typeof TABS)[number]['id'];

function entries<T extends Record<string, string>>(o: T) {
  return Object.entries(o) as [keyof T & string, string][];
}

// Round colour buttons -- each one is a labelled toggle, not just a coloured dot.
function Swatches<T extends string>({ label, ns, items, value, onPick }: {
  label: string;
  ns: string;
  items: [T, string][];
  value: T;
  onPick: (id: T) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="a3d-group" role="group" aria-label={label}>
      <div className="a3d-group-label">{label}</div>
      <div className="a3d-swatches">
        {items.map(([id, hex]) => (
          <button
            key={id}
            type="button"
            className="a3d-swatch"
            style={{ '--c': hex } as CSSProperties}
            aria-label={t(`${ns}.${id}`)}
            title={t(`${ns}.${id}`)}
            aria-pressed={value === id}
            onClick={() => onPick(id)}
          />
        ))}
      </div>
    </div>
  );
}

function Choices<T extends string>({ label, ns, ids, value, onPick }: {
  label: string;
  ns: string;
  ids: readonly T[];
  value: T;
  onPick: (id: T) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="a3d-group" role="group" aria-label={label}>
      <div className="a3d-group-label">{label}</div>
      <div className="a3d-choices">
        {ids.map((id) => (
          <button key={id} type="button" className="a3d-choice" aria-pressed={value === id} onClick={() => onPick(id)}>
            {t(`${ns}.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Dark studio: pedestal with an emerald edge light, one shadow-casting key light, an amber rim light.
function Studio() {
  const shadow = isLowPower() ? 512 : 1024;
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[shadow, shadow]}
        shadow-camera-left={-1.5}
        shadow-camera-right={1.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-0.5}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 2.5, -3]} intensity={1.2} color="#fbbf24" />
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.62, 0.66, 0.06, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <torusGeometry args={[0.62, 0.012, 8, 64]} />
        <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={1.8} />
      </mesh>
    </>
  );
}

export default function AvatarCustomizerModal({ config, onChange, onSave, onClose, saving, error }: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabId>('outfit');
  const [lost, setLost] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const savingRef = useRef(saving);
  savingRef.current = saving;

  // Modal behaviour: focus moves in and is trapped, ESC closes, the page behind can't scroll,
  // and focus returns to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current!;
    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea'));
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!savingRef.current) onCloseRef.current(); // not mid-save: the result would land in a closed modal
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      // Focus can end up outside (the focused Save button just got disabled) -- pull it back in.
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        f[0].focus();
      } else if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus();
    };
  }, []);

  const unavailable = <p className="a3d-unavailable">{t('avatar3d.unavailable')}</p>;
  const set = onChange;

  return createPortal(
    <div className="a3d-overlay">
      <div ref={dialogRef} className="a3d-modal" role="dialog" aria-modal="true" aria-labelledby="a3d-title">
        <div className="a3d-stage">
          <AvatarBoundary fallback={unavailable}>
            {lost ? (
              unavailable
            ) : (
              <Canvas
                frameloop="demand"
                flat
                shadows
                dpr={[1, isLowPower() ? 1.5 : 2]}
                camera={{ position: [0, 1.25, 4.1], fov: 32, near: 0.3, far: 30 }}
                gl={{ antialias: true, alpha: true }}
                onCreated={({ gl }) =>
                  gl.domElement.addEventListener('webglcontextlost', (e) => {
                    e.preventDefault();
                    setLost(true);
                  })
                }
              >
                <Studio />
                <AvatarMesh config={config} />
                <OrbitControls
                  enablePan={false}
                  enableDamping
                  target={[0, 0.95, 0]}
                  minDistance={1.6}
                  maxDistance={6}
                  minPolarAngle={Math.PI * 0.2}
                  maxPolarAngle={Math.PI * 0.52}
                />
              </Canvas>
            )}
          </AvatarBoundary>
          <p className="a3d-hint">{t('avatar3d.hint')}</p>
        </div>

        <div className="a3d-panel">
          <header className="a3d-panel-head">
            <h2 id="a3d-title">{t('avatar3d.title')}</h2>
            <button type="button" className="a3d-close" onClick={onClose} disabled={saving} aria-label={t('avatar3d.close')}>
              <RiCloseLine size={22} />
            </button>
          </header>

          <div className="a3d-tabs" role="tablist">
            {TABS.map(({ id, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`a3d-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="a3d-tabpanel"
                className="a3d-tab"
                onClick={() => setTab(id)}
              >
                <Icon size={20} aria-hidden />
                <span>{t(`avatar3d.tabs.${id}`)}</span>
              </button>
            ))}
          </div>

          <div className="a3d-body" role="tabpanel" id="a3d-tabpanel" aria-labelledby={`a3d-tab-${tab}`}>
            {tab === 'skin' && (
              <Swatches label={t('avatar3d.tabs.skin')} ns="avatar3d.skin" items={entries(SKIN_TONES)} value={config.skin} onPick={(skin) => set({ skin })} />
            )}

            {tab === 'outfit' && (
              <>
                <Choices label={t('avatar3d.group.style')} ns="avatar3d.outfit" ids={OUTFITS} value={config.outfit} onPick={(outfit) => set({ outfit })} />
                {config.outfit === 'thobe' ? (
                  <Swatches label={t('avatar3d.group.thobe')} ns="avatar3d.thobe" items={entries(THOBE_COLORS)} value={config.thobe} onPick={(thobe) => set({ thobe })} />
                ) : (
                  <>
                    <Choices label={t('avatar3d.group.top')} ns="avatar3d.top" ids={TOPS} value={config.top} onPick={(top) => set({ top })} />
                    <Swatches label={t('avatar3d.group.topColor')} ns="avatar3d.color" items={entries(PALETTE)} value={config.topColor} onPick={(topColor) => set({ topColor })} />
                    <Swatches label={t('avatar3d.group.bottom')} ns="avatar3d.bottom" items={entries(BOTTOM_COLORS)} value={config.bottom} onPick={(bottom) => set({ bottom })} />
                  </>
                )}
              </>
            )}

            {tab === 'headwear' && (
              <>
                <Choices label={t('avatar3d.tabs.headwear')} ns="avatar3d.headwear" ids={HEADWEAR} value={config.headwear} onPick={(headwear) => set({ headwear })} />
                {config.headwear === 'cap' && (
                  <Swatches label={t('avatar3d.group.cap')} ns="avatar3d.color" items={entries(PALETTE)} value={config.capColor} onPick={(capColor) => set({ capColor })} />
                )}
              </>
            )}

            {tab === 'accessory' && (
              <Choices label={t('avatar3d.tabs.accessory')} ns="avatar3d.accessory" ids={ACCESSORIES} value={config.accessory} onPick={(accessory) => set({ accessory })} />
            )}
          </div>

          <footer className="a3d-footer">
            {error && (
              <div className="a3d-error" role="alert">
                {error}
              </div>
            )}
            <button type="button" className="a3d-btn a3d-btn-ghost" onClick={onClose} disabled={saving}>
              {t('avatar3d.cancel')}
            </button>
            <button type="button" className="a3d-btn a3d-btn-save" onClick={onSave} disabled={saving}>
              {saving ? t('avatar3d.saving') : t('avatar3d.save')}
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.body
  );
}
