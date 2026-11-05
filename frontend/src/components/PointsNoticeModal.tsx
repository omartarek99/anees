import { useCallback, useEffect, useRef, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { useLocation } from 'react-router-dom';
import { pickText } from '../lib/i18n';
import { useViolations } from '../lib/violations';

type Notice = { id: number; delta: number; newTotal: number; kind: 'xp' | 'teacher'; note: string | null; violation: string | null; createdAt: string; adminName: string | null };

/**
 * Points an admin added to or took from this account (admin panel > Users) come up in a window until the person closes it: how many, what they have now,
 * and the reason when the admin wrote one. Looked for when the site opens, on every page they move to, and once a minute; one after another if there are
 * several. Not for admins themselves (an admin cannot change their own points).
 */
export function PointsNoticeModal() {
  const { user, refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const rules = useViolations();
  const { pathname } = useLocation();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(false);
  const enabled = user?.role === 'student' || user?.role === 'teacher';
  const refreshedFor = useRef(0);

  const check = useCallback(() => {
    if (!enabled) return;
    api
      .get<{ notices: Notice[] }>('/users/me/points-notices')
      .then((data) => {
        setNotices(data.notices);
        // their points changed on the server: update what the top bar shows (once per new notice)
        const newest = data.notices[data.notices.length - 1]?.id ?? 0;
        if (newest > refreshedFor.current) {
          refreshedFor.current = newest;
          void refreshUser();
        }
      })
      .catch(() => {});
  }, [enabled, refreshUser]);

  useEffect(() => {
    check();
  }, [check, pathname]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, check]);

  const current = notices[0];

  async function close() {
    if (!current || busy) return;
    setBusy(true);
    try {
      await api.post(`/users/me/points-notices/${current.id}/read`);
    } catch {
      /* it will show again next time */
    }
    setNotices((prev) => prev.filter((x) => x.id !== current.id));
    setBusy(false);
  }

  useEscapeToClose(() => void close(), !!current);

  const added = !!current && current.delta > 0;
  // taken away because a rule was broken (an admin named it, or recorded it with the rules form): the window says so and names the rule
  const rule = current?.violation ? rules?.find((r) => r.key === current.violation) : null;
  const ruleBroken = !!current?.violation && !added;
  return (
    <AnimatePresence>
      {current && (
        <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <m.div
            className="modal-panel text-center"
            role="alertdialog"
            aria-modal="true"
            aria-label={t(ruleBroken ? 'pointsNotice.ruleBroken' : 'pointsNotice.title')}
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ maxWidth: 400 }}
          >
            <div style={{ fontSize: 46 }}>{added ? '⭐' : '⚠️'}</div>
            <h2 style={{ fontSize: 20, marginTop: 6, color: added ? 'var(--success, #2e7d4f)' : 'var(--danger)' }}>{t(ruleBroken ? 'pointsNotice.ruleBroken' : 'pointsNotice.title')}</h2>
            {ruleBroken && rule && (
              <p style={{ fontSize: 15, fontWeight: 700, margin: '6px 0 0' }} dir="auto">
                {t('pointsNotice.rule', { title: pickText(lang, rule.title, rule.titleAr) })}
              </p>
            )}
            <p style={{ fontSize: 16.5, lineHeight: 1.55, margin: '10px 0 0', fontWeight: 700 }}>
              {t(added ? 'pointsNotice.added' : 'pointsNotice.removed', { n: String(Math.abs(current.delta)) })}
            </p>
            {current.note && (
              <p style={{ fontSize: 14.5, margin: '8px 0 0', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2, rgba(0,0,0,0.05))' }} dir="auto">
                {t('pointsNotice.reason', { note: current.note })}
              </p>
            )}
            <p className="muted" style={{ fontSize: 14, margin: '10px 0 0' }}>
              {t(current.kind === 'teacher' ? 'pointsNotice.totalTeacher' : 'pointsNotice.total', { n: String(current.newTotal) })}
            </p>
            {notices.length > 1 && (
              <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
                {t('pointsNotice.more', { n: String(notices.length - 1) })}
              </p>
            )}
            <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={busy} onClick={() => void close()}>
              {t('common.dismiss')}
            </button>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
