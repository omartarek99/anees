import { Suspense, lazy, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import { useLanguage } from '../lib/language-context';
import { AvatarBoundary } from './avatar3d/AvatarBoundary';
import { DEFAULT_AVATAR, canUseWebGL, type AvatarConfig } from './avatar3d/avatarConfig';
import '../styles/avatar3d.css';

// The live 3D profile picture + its customiser. The react-three-fiber / drei code is lazy-loaded
// (separate chunks, fetched only when this renders), the static <Avatar> is the fallback while it loads and
// whenever WebGL isn't usable, and the state below is the single source of truth for both the
// mini picture and the modal -- so every click in the modal shows on the picture instantly.
//
// Use it for one avatar at a time (a profile header), never in a list: each 3D avatar holds a
// WebGL context and browsers only allow ~8-16 per page. Lists keep using <Avatar>.
//
//   <ProfileAvatar3D avatarKey={p.avatarKey} photoUrl={p.avatarUrl} config={p.avatar3d} size={72}
//                    onSave={isOwnProfile ? saveAvatar3d : undefined} />
//
// No `onSave` -> a read-only picture; with it -> the picture opens the customiser and a
// "Customize character" button appears beneath it.
const MiniAvatarCanvas = lazy(() => import('./avatar3d/MiniAvatarCanvas'));
const AvatarCustomizerModal = lazy(() => import('./avatar3d/AvatarCustomizerModal'));

type Props = {
  avatarKey: string; // static fallback (emoji avatar / uploaded photo)
  photoUrl?: string | null;
  config: AvatarConfig | null; // the saved character; null = never customised -> default boy
  size?: number;
  onSave?: (config: AvatarConfig) => Promise<void>; // should throw if saving fails
};

// Shown while the customiser chunk downloads. Portaled to <body> because the profile cards use
// backdrop-filter, which would otherwise make a position:fixed overlay cover just the card.
// Clicking it cancels the open.
function ModalLoading({ label, onClose }: { label: string; onClose: () => void }) {
  return createPortal(
    <div className="a3d-overlay" role="status" aria-label={label} onClick={onClose}>
      <div className="spinner" />
    </div>,
    document.body
  );
}

export function ProfileAvatar3D({ avatarKey, photoUrl, config, size = 48, onSave }: Props) {
  const { t } = useLanguage();
  const saved = config ?? DEFAULT_AVATAR;
  const [draft, setDraft] = useState(saved);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webgl] = useState(canUseWebGL);
  const [contextLost, setContextLost] = useState(false);
  const openBtn = useRef<HTMLButtonElement>(null);

  const fallback = <Avatar avatarKey={avatarKey} photoUrl={photoUrl} size={size} />;
  // A lost context only swaps in the static avatar once the customiser is closed -- never
  // yanks it (and the student's unsaved draft) out from under them.
  if (!webgl || (contextLost && !open)) return fallback;

  function openModal() {
    setDraft(saved);
    setError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave!(draft);
      setOpen(false);
    } catch {
      setError(t('common.genericError'));
    } finally {
      setSaving(false);
    }
  }

  // The round picture (CSS: fixed size, rounded-full, overflow hidden). Clicking it opens the
  // modal for mouse/touch users; keyboard and screen-reader users get the labelled button below.
  const style = { width: size, height: size };
  const canvas = (
    <Suspense fallback={fallback}>
      <MiniAvatarCanvas config={open ? draft : saved} onFail={() => setContextLost(true)} />
    </Suspense>
  );

  return (
    <div className="a3d-slot">
      <AvatarBoundary fallback={fallback}>
        {onSave ? (
          <button type="button" className="a3d-mini" style={style} onClick={() => {
              // The modal returns focus to whatever had it when it opened -- make that the labelled button, not this aria-hidden one.
              openBtn.current?.focus();
              openModal();
            }}
            tabIndex={-1}
            aria-hidden
          >
            {canvas}
          </button>
        ) : (
          <div className="a3d-mini" style={style} aria-hidden>
            {canvas}
          </div>
        )}
        {onSave && (
          <button ref={openBtn} type="button" className="btn btn-secondary btn-sm" onClick={openModal}>
            {t('avatar3d.button')}
          </button>
        )}
        {open && (
          <Suspense fallback={<ModalLoading label={t('avatar3d.loading')} onClose={() => setOpen(false)} />}>
            <AvatarCustomizerModal
              config={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              onSave={save}
              onClose={() => setOpen(false)}
              saving={saving}
              error={error}
            />
          </Suspense>
        )}
      </AvatarBoundary>
    </div>
  );
}
