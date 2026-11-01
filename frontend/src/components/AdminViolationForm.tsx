import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { describeMeasure, offenseKey, useViolations } from '../lib/violations';
import type { AdminUser } from './AdminUserRow';

type Applied = { pointsRemoved: number; certificatesRevoked: number; suspendedUntil: string | null; deactivated: boolean };

/** The admin's "a rule was broken" tool for a student (inside the Manage panel): pick the rule, see what happens for this being the 1st, 2nd or
 * 3rd time THAT rule is broken, and apply it -- the warning, the points, the certificates and the suspension or closure, all in one go. The rules
 * and their measures come from the server (lib/violations.ts), so what is shown here is exactly what is applied. */
export function AdminViolationForm({ user: u, onUpdated }: { user: AdminUser; onUpdated: (user: AdminUser) => void }) {
  const { t, lang } = useLanguage();
  const rules = useViolations();
  const [key, setKey] = useState('');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const rule = rules?.find((r) => r.key === key);
  const offense = u.violations.filter((v) => v.key === key).length + 1;
  const measure = rule?.steps[Math.min(offense, 3) - 1];
  const titleOf = (k: string) => {
    const r = rules?.find((x) => x.key === k);
    return r ? pickText(lang, r.title, r.titleAr) : k;
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-US');

  async function apply() {
    if (!rule || !window.confirm(t('admin.violationConfirm', { name: u.displayName }))) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await api.post<{ user: AdminUser; applied: Applied }>(`/admin/users/${u.id}/violations`, {
        violation: rule.key,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(measure?.deductPoints ? { points: Number(points) || 0 } : {}),
      });
      onUpdated(data.user);
      const a = data.applied;
      const done = [
        t('admin.violationWarningSent'),
        a.pointsRemoved > 0 && t('admin.violationPointsRemoved', { n: a.pointsRemoved }),
        a.certificatesRevoked > 0 && t('admin.violationCertsRevoked', { n: a.certificatesRevoked }),
        a.suspendedUntil && t('admin.violationSuspendedUntil', { date: date(a.suspendedUntil) }),
        a.deactivated && t('admin.violationClosed'),
      ].filter(Boolean);
      setMessage({ ok: true, text: t('admin.violationDone', { summary: done.join(' · ') }) });
      setKey('');
      setPoints('');
      setNote('');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? translateApiError(lang, err.message) : t('admin.loadError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field" style={{ margin: 0 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>{t('admin.violationTitle')}</label>

      {u.violations.length > 0 && (
        <ol className="muted" style={{ fontSize: 13, margin: '4px 0 8px', paddingInlineStart: 18 }}>
          {u.violations.map((v, i) => (
            <li key={i}>
              <strong>{titleOf(v.key)}</strong> · {t(offenseKey(v.offense))} · {date(v.issuedAt)}
              {v.issuedBy ? ` · ${v.issuedBy}` : ''}
              {v.note ? `: "${v.note}"` : ''}
            </li>
          ))}
        </ol>
      )}

      <select value={key} onChange={(e) => setKey(e.target.value)} aria-label={t('admin.violationTitle')} disabled={!rules}>
        <option value="">{t('admin.violationPick')}</option>
        {rules?.map((r) => (
          <option key={r.key} value={r.key}>
            {pickText(lang, r.title, r.titleAr)}
          </option>
        ))}
      </select>

      {rule && measure && (
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {pickText(lang, rule.example, rule.exampleAr)}
          </p>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            <strong>{t(offenseKey(offense))}:</strong> {describeMeasure(measure, t)}
          </p>
          {measure.deductPoints && (
            <div className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{t('admin.violationPoints')}</label>
              <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} style={{ width: 110 }} />
              <span className="muted" style={{ fontSize: 12.5 }}>
                {t('admin.violationPointsHint', { n: u.totalXp })}
              </span>
            </div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('admin.violationNote')} aria-label={t('admin.violationNote')} />
          <div>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={apply}>
              {t('admin.violationApply')}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={message.ok ? 'muted' : 'form-error-banner'} style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
