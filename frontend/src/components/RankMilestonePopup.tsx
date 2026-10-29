import { useEffect, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { CERT_PALETTES, type CertificateType } from '../lib/certificateTiers';
import { rankName } from '../lib/medalLevels';
import { setMilestonesPending } from '../lib/popupGate';

type Milestone = { id: number; tier: CertificateType; status: string };

/** What a student sees when they reach a new level (Bronze, Silver or Gold), in two steps:
 *  1. the rank's logo pops out on the page by itself, bouncing and glowing -- no window yet;
 *  2. when they click it, the congratulation window opens: their shield certificate is being prepared, an admin approves it (the admin
 *     Certificates page), and the certificate itself later arrives through CertificateAwardPopup.
 * Fetched when the app loads, one level at a time, oldest first. It only counts as seen once the window is closed, so a logo that was
 * never clicked comes back on the next visit. */
export function RankMilestonePopup() {
  const { t, lang } = useLanguage();
  const [queue, setQueue] = useState<Milestone[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMilestonesPending(true); // until we know whether there is anything to show, the shield pop-out waits
    api
      .get<{ requests: Milestone[] }>('/certificates/requests/unseen')
      .then((data) => {
        if (cancelled) return;
        setQueue(data.requests);
        setMilestonesPending(data.requests.length > 0);
      })
      .catch(() => {
        // Best-effort: the logo just doesn't appear this visit.
        setMilestonesPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue && queue.length > 0 ? queue[0] : null;

  async function close() {
    if (!current) return;
    setOpen(false);
    const rest = queue!.slice(1);
    setQueue(rest);
    setMilestonesPending(rest.length > 0);
    try {
      await api.post(`/certificates/requests/${current.id}/seen`, {});
    } catch {
      // Best-effort: worst case it is shown again on the next visit.
    }
  }

  useEscapeToClose(close, current !== null && open);

  const palette = current ? CERT_PALETTES[current.tier] : null;
  const level = current ? rankName(current.tier, lang, true) : '';
  const logo = current ? `/images/ranks/${current.tier}.webp?v=2` : '';

  return (
    <>
      {/* Step 1: the page goes dark behind a big logo that pops out and floats, to be clicked (a tap on the dark part works too). */}
      <AnimatePresence>
        {current && !open && (
          <m.div
            key={`shade-${current.id}`}
            className="rank-pop-shade"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(true)}
            aria-hidden
          />
        )}
        {current && !open && (
          <m.button
            key={`logo-${current.id}`}
            type="button"
            className="rank-pop"
            aria-label={t('rankMilestone.tapLabel', { level })}
            title={t('rankMilestone.tapLabel', { level })}
            initial={{ scale: 0, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 11 }}
            onClick={() => setOpen(true)}
          >
            <span className="rank-pop-glow" style={{ background: `radial-gradient(circle, ${palette!.light}cc, transparent 68%)` }} aria-hidden />
            <img src={logo} alt="" width={460} height={460} />
            <span className="rank-pop-hint">{t('rankMilestone.tap')}</span>
          </m.button>
        )}
      </AnimatePresence>

      {/* Step 2: the window with the message. */}
      <AnimatePresence>
        {current && open && palette && (
          <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
            <m.div
              className="modal-panel text-center"
              role="alertdialog"
              aria-modal="true"
              aria-label={t('rankMilestone.title')}
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              style={{ maxWidth: 400 }}
              onClick={(e) => e.stopPropagation()}
            >
              <img src={logo} alt="" width={96} height={96} style={{ display: 'block', margin: '0 auto', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }} />
              <h2 style={{ fontSize: 21, marginTop: 8, color: palette.dark }}>{t('rankMilestone.title')}</h2>
              <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.5, margin: '4px 0 0' }}>{t('rankMilestone.reached', { level })}</p>
              <p style={{ fontSize: 15.5, lineHeight: 1.5, margin: '8px 0 0' }}>{t('rankMilestone.shieldInProcess')}</p>
              <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={close}>
                {t('rankMilestone.button')}
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
