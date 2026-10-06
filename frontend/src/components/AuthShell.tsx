import type { ReactNode } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { useLanguage } from '../lib/language-context';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div
      className="auth-shell"
      style={{
        minHeight: '100vh',
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
            {/* The logo already spells out the name, so it IS the page's h1 (its alt text
                carries the heading) instead of sitting above a duplicate visible title.
                No backing tile: the logo's dark strokes would sink into the maroon backdrop,
                so a white outline hugs the artwork itself (stacked drop-shadows follow the
                alpha edge) with a soft glow behind it. */}
            <h1 style={{ margin: 0, lineHeight: 0 }}>
              <img
                src="/icons/logo.png"
                alt={t('auth.heroTitle')}
                style={{
                  height: 150,
                  width: 'auto',
                  margin: '0 auto',
                  filter: 'drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #fff) drop-shadow(0 4px 18px rgba(255, 255, 255, 0.45))',
                }}
              />
            </h1>
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
