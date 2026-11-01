import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { describeMeasure, offenseKey, useViolations } from '../lib/violations';

/** The rules students can break and what happens each time -- a section of the Terms page, from the same list an admin applies. */
export function ConductRules() {
  const { t, lang } = useLanguage();
  const rules = useViolations();
  if (!rules) return null;
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 17 }}>{t('rules.title')}</h2>
      <p style={{ color: 'var(--ink-soft)', lineHeight: 1.7 }}>{t('rules.intro')}</p>
      <div className="stack" style={{ gap: 14 }}>
        {rules.map((r) => (
          <div key={r.key}>
            <h3 style={{ fontSize: 15, margin: 0 }}>{pickText(lang, r.title, r.titleAr)}</h3>
            <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6, margin: '2px 0 4px', fontSize: 14 }}>{pickText(lang, r.example, r.exampleAr)}</p>
            <ul style={{ margin: 0, paddingInlineStart: 20, color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6 }}>
              {r.steps.map((m, i) => (
                <li key={i}>
                  <strong style={{ color: 'var(--ink)' }}>{t(offenseKey(i + 1))}:</strong> {describeMeasure(m, t)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
