import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';

type Status = { active: boolean; windowId: string; secondsRemaining: number; secondsUntilNext: number };

const POLL_INTERVAL_MS = 15000;

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Pops up the moment the hour's random 10-minute double-quiz-points window opens (see
 * backend/src/lib/doublePoints.ts) -- polled, not pushed, since there's no websocket in
 * this app. Only announces once per window: dismissing it (or letting the countdown run
 * out) doesn't bring it back until a genuinely new window (a different windowId) opens.
 *
 * Plain conditional render + a CSS-only entrance, not framer-motion's AnimatePresence --
 * this component's visibility flips true well after mount (once an async poll resolves),
 * the same shape of case CookieConsentBanner's own comment documents AnimatePresence
 * getting stuck on (a transform that never settles back to rest), reproduced here too. */
export function DoublePointsNotification() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const announcedWindowIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.get<Status>('/reels/double-points-status');
        if (cancelled) return;
        setStatus(data);
        if (data.active && announcedWindowIdRef.current !== data.windowId) {
          announcedWindowIdRef.current = data.windowId;
          setDismissed(false);
        }
      } catch {
        // Best-effort only -- a missed poll just tries again next tick.
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Smooth per-second countdown between polls, instead of jumping every 15s.
  useEffect(() => {
    if (!status?.active) return;
    const id = setInterval(() => {
      setStatus((prev) => (prev && prev.secondsRemaining > 0 ? { ...prev, secondsRemaining: prev.secondsRemaining - 1 } : prev));
    }, 1000);
    return () => clearInterval(id);
  }, [status?.active, status?.windowId]);

  const visible = !!status?.active && !dismissed && status.secondsRemaining > 0;

  if (!visible || !status) return null;

  return (
    <div
      role="status"
      className="double-points-toast"
      style={{
        position: 'fixed',
        // Logical inset, the opposite side from the quick menu (bottom:20 +
        // inset-inline-start there) -- right in English, left in Arabic, so the two never
        // overlap in either language.
        bottom: 16,
        insetInlineEnd: 16,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))',
        color: 'var(--maroon-dark)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 18px',
        boxShadow: '0 16px 40px rgba(169,112,28,0.4), 0 4px 12px rgba(20,30,60,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
        maxWidth: 'min(92vw, 420px)',
      }}
    >
      <span style={{ fontSize: 26, flexShrink: 0 }} aria-hidden>
        🎉
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 14.5 }}>{t('doublePoints.title')}</strong>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, fontWeight: 600 }}>
          {t('doublePoints.body', { time: formatCountdown(status.secondsRemaining) })}
        </p>
      </div>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={() => setDismissed(true)}
        style={{
          background: 'rgba(255,255,255,0.35)',
          border: 'none',
          borderRadius: '50%',
          width: 26,
          height: 26,
          fontSize: 15,
          lineHeight: 1,
          cursor: 'pointer',
          color: 'var(--maroon-dark)',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
