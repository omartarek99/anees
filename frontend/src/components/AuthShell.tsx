import type { ReactNode } from 'react';
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
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="text-center" style={{ marginBottom: 20 }}>
          <img
            src="/icons/icon-192.png"
            alt=""
            style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)' }}
          />
          <h1 style={{ color: 'var(--white)', fontSize: 26, marginTop: 8 }}>{t('auth.heroTitle')}</h1>
        </div>
        <div className="card" style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
          <h2 style={{ fontSize: 21 }}>{title}</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            {subtitle}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
