import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { translateApiError } from '../lib/i18n';
import { useLanguage } from '../lib/language-context';

type Account = {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  grade: number | null;
  schoolName: string | null;
  isActive: boolean;
  /** "YYYY-MM-DD HH:MM:SS" (UTC): the last sign-in, point earned or lesson watched. */
  lastActiveAt: string;
  canEmailReset: boolean;
  isSelf: boolean;
};

const DAY_CHOICES = [30, 60, 90, 180];

/** Whole days since a server timestamp (the server writes UTC without a "Z"). */
function daysSince(stamp: string): number {
  const then = new Date(stamp.replace(' ', 'T') + 'Z').getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function useWhen() {
  const { t } = useLanguage();
  return (stamp: string) => {
    const d = daysSince(stamp);
    return d === 0 ? t('admin.accToday') : t('admin.accAgoDays', { n: String(d) });
  };
}

/** One account line: who it is, when it was last used, and the buttons given to it. */
function AccountLine({ a, children, note }: { a: Account; children: ReactNode; note?: { ok: boolean; text: string } | null }) {
  const { t } = useLanguage();
  const when = useWhen();
  return (
    <div className="card" style={{ background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
      <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <strong>
            {a.displayName} {a.isSelf && <span className="muted">{t('admin.you')}</span>}
          </strong>{' '}
          <span className="badge">{t(a.role === 'teacher' ? 'admin.roleFilterTeacher' : a.role === 'admin' ? 'admin.roleFilterAdmin' : 'admin.roleFilterStudent')}</span>
          {!a.isActive && <span className="badge"> {t('admin.accStopped')}</span>}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            <bdi dir="ltr">
              @{a.username} · {a.email}
            </bdi>
          </p>
          {a.schoolName && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              🏫 {a.schoolName}
            </p>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t('admin.accLastActive', { when: when(a.lastActiveAt) })}
          </p>
        </div>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
          {children}
        </div>
      </div>
      {note && (
        <p role="status" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: note.ok ? 'var(--success, #2e7d4f)' : 'var(--danger)' }}>
          {note.ok ? '✓ ' : ''}
          {note.text}
        </p>
      )}
    </div>
  );
}

function FindAccount() {
  const { t, lang } = useLanguage();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Account[] | null>(null);
  const [notes, setNotes] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setFound(null);
      return;
    }
    const id = setTimeout(() => {
      api
        .get<{ accounts: Account[] }>(`/admin/accounts/search?q=${encodeURIComponent(q.trim())}`)
        .then((d) => setFound(d.accounts))
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const say = (id: number, ok: boolean, text: string) => setNotes((n) => ({ ...n, [id]: { ok, text } }));

  async function sendReset(a: Account) {
    setBusy(a.id);
    try {
      await api.post(`/admin/users/${a.id}/send-password-reset`, { lang });
      say(a.id, true, t('admin.accResetSent', { email: a.email }));
    } catch (err) {
      say(a.id, false, translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong on our side. Please try again in a moment.'));
    } finally {
      setBusy(null);
    }
  }

  async function signOut(a: Account) {
    if (!window.confirm(t('admin.accSignOutConfirm', { name: a.displayName }))) return;
    setBusy(a.id);
    try {
      const r = await api.post<{ devices: number }>(`/admin/users/${a.id}/sign-out`, {});
      say(a.id, true, t('admin.accSignedOut', { n: String(r.devices) }));
    } catch (err) {
      say(a.id, false, translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong on our side. Please try again in a moment.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('admin.accFindTitle')}</h3>
      <div className="field">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.accFindPlaceholder')} aria-label={t('admin.accFindPlaceholder')} />
        <small className="muted">{t('admin.accFindHint')}</small>
      </div>
      {found && found.length === 0 && <p className="muted">{t('admin.accNone')}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {found?.map((a) => (
          <AccountLine key={a.id} a={a} note={notes[a.id]}>
            <button type="button" className="btn btn-secondary" disabled={busy === a.id || !a.canEmailReset} title={a.canEmailReset ? undefined : t('admin.accResetUnavailable')} onClick={() => sendReset(a)}>
              {t('admin.accSendReset')}
            </button>
            {!a.isSelf && (
              <button type="button" className="btn btn-secondary" disabled={busy === a.id} onClick={() => signOut(a)}>
                {t('admin.accSignOut')}
              </button>
            )}
          </AccountLine>
        ))}
      </div>
    </div>
  );
}

function InactiveAccounts() {
  const { t, lang } = useLanguage();
  const [days, setDays] = useState(60);
  const [list, setList] = useState<Account[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    api
      .get<{ total: number; accounts: Account[] }>(`/admin/accounts/inactive?days=${days}`)
      .then((d) => {
        setList(d.accounts);
        setTotal(d.total);
        setError(null);
      })
      .catch(() => setError(t('admin.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  async function stop(a: Account) {
    if (!window.confirm(t('admin.accStopConfirm', { name: a.displayName }))) return;
    try {
      await api.patch(`/admin/users/${a.id}/active`, { isActive: false });
      setList((prev) => (prev ? prev.filter((x) => x.id !== a.id) : prev));
      setTotal((n) => Math.max(0, n - 1));
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong on our side. Please try again in a moment.'));
    }
  }

  return (
    <div className="card">
      <div className="flex gap-sm" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>
          {t('admin.accInactiveTitle')} <span className="muted">· {t('admin.accInactiveTotal', { n: String(total) })}</span>
        </h3>
        <label className="flex gap-sm" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13 }}>{t('admin.accInactiveDays')}</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={t('admin.accInactiveDays')}>
            {DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                {t('admin.accDaysOption', { n: String(d) })}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="form-error-banner">{error}</div>}
      {!list && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {list && list.length === 0 && <p className="muted">{t('admin.accInactiveNone')}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {list?.map((a) => (
          <AccountLine key={a.id} a={a}>
            <button type="button" className="btn btn-secondary" onClick={() => stop(a)}>
              {t('admin.accStop')}
            </button>
          </AccountLine>
        ))}
      </div>
    </div>
  );
}

export function AdminAccountsPanel() {
  return (
    <div className="stack">
      <FindAccount />
      <InactiveAccounts />
    </div>
  );
}
