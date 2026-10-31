import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { Avatar } from './Avatar';
import '../styles/challenge.css';

type Friend = { username: string; displayName: string; avatarKey: string };

/** "تحدى صديقك" from the home page: pick which friend to challenge, then the setup window (ChallengeSetupModal) takes over. */
export function ChallengePickerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (friend: Friend) => void }) {
  const { t } = useLanguage();
  const [friends, setFriends] = useState<Friend[] | null>(null);

  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) return;
    setFriends(null);
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(d.friends))
      .catch(() => setFriends([]));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <m.div
            className="modal-panel ch-setup"
            role="dialog"
            aria-modal="true"
            aria-label={t('challenge.pickTitle')}
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div style={{ fontSize: 40 }} aria-hidden>
                ⚔️
              </div>
              <h2 style={{ fontSize: 21, margin: '6px 0 2px' }}>{t('challenge.pickTitle')}</h2>
            </div>

            {friends === null && <div className="spinner" style={{ margin: '12px auto' }} />}

            {friends && friends.length === 0 && (
              <div className="text-center">
                <p className="muted" style={{ margin: '4px 0 12px' }}>{t('challenge.pickEmpty')}</p>
                <Link to="/friends" className="btn btn-primary" onClick={onClose}>
                  {t('challenge.findFriends')}
                </Link>
              </div>
            )}

            {friends && friends.length > 0 && (
              <ul className="ch-friends">
                {friends.map((f) => (
                  <li key={f.username}>
                    <Avatar avatarKey={f.avatarKey} size={40} />
                    <span className="ch-friend-name">
                      <strong>{f.displayName}</strong>
                      <small className="muted">
                        <bdi>@{f.username}</bdi>
                      </small>
                    </span>
                    <button type="button" className="btn btn-gold btn-sm" onClick={() => onPick(f)}>
                      ⚔️ {t('challenge.pick')}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
