import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, AVATAR_OPTIONS, avatarLabel } from './Avatar';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';

// The student's picture choice (opened from their profile picture). A click saves at once and closes; picking a
// picture also replaces an uploaded photo (the server clears it). Portaled to <body>: the profile cards use
// backdrop-filter, which would otherwise make the fixed overlay cover just the card.
export function AvatarPicker({ current, onPick, onClose }: { current: string; onPick: (key: string) => Promise<void>; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEscapeToClose(onClose, !saving);

  async function pick(key: string) {
    setSaving(key);
    setError(false);
    try {
      await onPick(key);
      onClose();
    } catch {
      setError(true);
      setSaving(null);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal-panel avatar-picker" role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ alignItems: 'center' }}>
          <h2 id="avatar-picker-title" style={{ fontSize: 20, margin: 0 }}>{t('avatars.pick')}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={!!saving}>
            {t('common.close')}
          </button>
        </div>
        <div className="avatar-picker-grid">
          {AVATAR_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              className="avatar-choice"
              aria-pressed={key === current}
              disabled={!!saving}
              onClick={() => (key === current ? onClose() : pick(key))}
            >
              <Avatar avatarKey={key} size={76} />
              <span>{saving === key ? '…' : avatarLabel(key, lang)}</span>
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" style={{ color: 'var(--danger, #c0392b)', margin: 0, fontSize: 14 }}>
            {t('common.genericError')}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
