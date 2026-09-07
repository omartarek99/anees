import type { ReactNode } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { useLanguage } from '../lib/language-context';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--maroon)',
        backgroundImage:
          'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.16), transparent 42%), radial-gradient(circle at 85% 15%, rgba(240,168,58,0.35), transparent 42%), radial-gradient(circle at 75% 90%, rgba(255,255,255,0.14), transparent 45%), linear-gradient(160deg, var(--maroon-light), var(--maroon-dark))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      {/* This app's global MotionConfig turns reduced-motion handling off (boss-fight/level-up
          motion is functional feedback, not decoration — see main.tsx). Auth-flow motion is pure
          polish, so it opts back into respecting the OS setting: framer-motion's "user" mode keeps
          opacity/color transitions but drops spatial movement (scale/y) for anyone who asked for
          reduced motion. */}
      <MotionConfig reducedMotion="user">
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div className="text-center" style={{ marginBottom: 20 }}>
            <img
              src="/icons/icon-192.png"
              alt=""
              style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)' }}
            />
            <h1 style={{ color: 'var(--white)', fontSize: 26, marginTop: 8 }}>{t('auth.heroTitle')}</h1>
          </div>
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}
          >
            <h2 style={{ fontSize: 21 }}>{title}</h2>
            <p className="muted" style={{ marginBottom: 20 }}>
              {subtitle}
            </p>
            {children}
          </motion.div>
        </div>
      </MotionConfig>
    </div>
  );
}
