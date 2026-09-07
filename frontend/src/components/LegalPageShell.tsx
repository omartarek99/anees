import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../lib/language-context';
import { LanguageToggle } from './LanguageToggle';

/** Shared chrome for the three legal pages (Privacy/Terms/Cookies) — same header (back link +
 * language toggle) and card layout, readable independent of login state. */
export function LegalPageShell({ title, lastUpdated, children }: { title: string; lastUpdated: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="flex-between" style={{ marginBottom: 20 }}>
          <Link to="/" className="btn btn-ghost btn-sm">
            {t('legal.backToApp')}
          </Link>
          <LanguageToggle />
        </div>
        <div className="card" style={{ padding: '32px 28px' }}>
          <h1 style={{ fontSize: 26 }}>{title}</h1>
          <p className="muted" style={{ marginBottom: 24 }}>
            {t('legal.lastUpdated', { date: lastUpdated })}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** One heading + paragraphs/list-items section, shared by all three policy pages. */
export function LegalSection({ heading, body }: { heading: string; body: string[] }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 17 }}>{heading}</h2>
      {body.map((line, i) => (
        <p key={i} style={{ color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          {line}
        </p>
      ))}
    </section>
  );
}
