import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { useEscapeToClose } from '../lib/useEscapeToClose';

type InboxMessage = { id: number; message: string; createdAt: string; reelId: number; reelTitle: string; reelTitleAr: string | null; adminName: string | null };

/**
 * A message an admin sent a teacher about one of their lessons (admin panel > Videos > Message): it pops up in a window until the teacher closes it,
 * one after another if there are several. It is looked for when the teacher opens the site, on every page they move to, and once a minute. Renders
 * nothing for anyone but a teacher, or when there is no message.
 */
export function AdminMessageModal() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const isTeacher = user?.role === 'teacher';

  const check = useCallback(() => {
    if (!isTeacher) return;
    api
      .get<{ messages: InboxMessage[] }>('/teacher-reels/messages')
      .then((data) => setMessages(data.messages))
      .catch(() => {});
  }, [isTeacher]);

  useEffect(() => {
    check();
  }, [check, pathname]);
  useEffect(() => {
    if (!isTeacher) return;
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [isTeacher, check]);

  const current = messages[0];

  async function close(then?: () => void) {
    if (!current || busy) return;
    setBusy(true);
    try {
      await api.post(`/teacher-reels/messages/${current.id}/read`);
    } catch {
      /* it will show again next time */
    }
    setMessages((prev) => prev.filter((x) => x.id !== current.id));
    setBusy(false);
    then?.();
  }

  useEscapeToClose(() => void close(), !!current);

  return (
    <AnimatePresence>
      {current && (
        <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <m.div
            className="modal-panel"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('adminMessage.title')}
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ maxWidth: 440 }}
          >
            <div className="text-center">
              <div style={{ fontSize: 42 }}>✉️</div>
              <h2 style={{ fontSize: 20, marginTop: 6 }}>{t('adminMessage.title')}</h2>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13.5 }}>
                {t('adminMessage.about', { title: pickText(lang, current.reelTitle, current.reelTitleAr) })}
              </p>
            </div>
            <p
              style={{ fontSize: 15.5, lineHeight: 1.6, margin: '16px 0 0', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2, rgba(0,0,0,0.05))', whiteSpace: 'pre-wrap' }}
              dir="auto"
            >
              {current.message}
            </p>
            {current.adminName && (
              <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                — {current.adminName}
              </p>
            )}
            {messages.length > 1 && (
              <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                {t('adminMessage.more', { n: String(messages.length - 1) })}
              </p>
            )}
            <div className="flex gap-sm" style={{ marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => void close(() => navigate(`/teacher/reels?edit=${current.reelId}`))}>
                {t('adminMessage.editLesson')}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => void close()}>
                {t('common.dismiss')}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
