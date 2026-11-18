import { useEffect, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { RiFileShield2Line } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';

/** A pop-up on the teacher's lessons page for a teacher who has not sent a teaching certificate yet (or whose certificate was not approved): it asks them to
 *  send it. Shown EVERY time they open this page (each click on "Create video"); "Later" closes it, "Send certificate" closes it and takes them to the form
 *  (TeacherCertificateCard). Nothing shows once the certificate is waiting for review or approved. */
export function TeacherCertificatePopup() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const status = user?.teacherCertStatus ?? 'none';
  const needed = user?.role === 'teacher' && (status === 'none' || status === 'rejected');
  const [open, setOpen] = useState(false);

  // opens once nothing else is on screen: a new account gets the site's welcome tour and page hints (GuideHost) first, and two pop-ups must not stack
  useEffect(() => {
    if (!needed) {
      setOpen(false);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const guideOpen = document.querySelector('.guide-layer, .guide-welcome, .guide-pop');
      if (guideOpen) window.setTimeout(tick, 800);
      else setOpen(true);
    };
    const first = window.setTimeout(tick, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, [needed]);

  const close = () => setOpen(false);
  useEscapeToClose(close, open);

  const goToForm = () => {
    close();
    window.setTimeout(() => {
      const input = document.getElementById('teacher-cert');
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus({ preventScroll: true });
    }, 250);
  };

  return (
    <AnimatePresence>
      {open && (
        <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <m.div
            className="card stack text-center"
            role="dialog"
            aria-modal="true"
            aria-label={t('teacherCert.popupTitle')}
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            style={{ maxWidth: 420, width: 'calc(100% - 32px)', alignItems: 'center', padding: '28px 24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <RiFileShield2Line size={48} aria-hidden="true" />
            <h2 style={{ margin: 0, fontSize: 20 }}>{t('teacherCert.popupTitle')}</h2>
            <p style={{ margin: 0 }}>{t('teacherCert.popupBody')}</p>
            {status === 'rejected' && user?.teacherCertNote && (
              <p className="muted" style={{ margin: 0 }}>
                {t('teacherCert.reason')} {user.teacherCertNote}
              </p>
            )}
            <div className="flex gap-sm" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={goToForm}>
                {t('teacherCert.popupSend')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={close}>
                {t('teacherCert.popupLater')}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
