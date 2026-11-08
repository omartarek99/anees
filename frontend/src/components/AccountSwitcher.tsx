import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth, type Role } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { translateApiError } from '../lib/i18n';
import { Avatar } from './Avatar';

type Linked = { id: number; username: string; displayName: string; avatarKey: string; role: Role };

/**
 * Switching between a person's own accounts (a student and a teacher account, say). Another account is linked once by signing in to it here
 * (its password is checked by the server, never stored); after that one tap switches to it -- no password -- and a link can be removed at any time.
 * Opened from the quick menu.
 */
export function AccountSwitcher({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { user, switchAccount } = useAuth();
  useEscapeToClose(onClose, true);
  const [accounts, setAccounts] = useState<Linked[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ accounts: Linked[] }>('/auth/linked-accounts')
      .then((r) => alive && setAccounts(r.accounts))
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  const fail = (err: unknown) => setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'));
  const roleLabel = (r: Role) => t(r === 'teacher' ? 'auth.roleTeacher' : r === 'admin' ? 'auth.roleAdminOption' : 'auth.roleStudent');

  async function link(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ accounts: Linked[] }>('/auth/linked-accounts', { username: username.trim(), password });
      setAccounts(r.accounts);
      setAdding(false);
      setUsername('');
      setPassword('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: number) {
    setError(null);
    try {
      const r = await api.delete<{ accounts: Linked[] }>(`/auth/linked-accounts/${id}`);
      setAccounts(r.accounts);
    } catch (err) {
      fail(err);
    }
  }

  async function go(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await switchAccount(id); // reloads the app as the other account
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel stack" role="dialog" aria-modal="true" aria-label={t('accounts.title')} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: 'calc(100% - 32px)' }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{t('accounts.title')}</h2>

        {user && (
          <div className="flex gap-sm" style={{ alignItems: 'center' }}>
            <Avatar avatarKey={user.avatarKey} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{user.displayName}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                @{user.username} · {roleLabel(user.role)}
              </div>
            </div>
            <span className="badge badge-gold">{t('accounts.current')}</span>
          </div>
        )}

        {accounts === null && <div className="spinner" />}
        {accounts?.length === 0 && !adding && <p className="muted" style={{ margin: 0 }}>{t('accounts.none')}</p>}
        {accounts?.map((a) => (
          <div key={a.id} className="flex gap-sm" style={{ alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => go(a.id)} style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'start' }}>
              <Avatar avatarKey={a.avatarKey} size={36} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700 }}>{a.displayName}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  @{a.username} · {roleLabel(a.role)}
                </span>
              </span>
            </button>
            <button type="button" className="btn btn-ghost" aria-label={t('accounts.unlink')} title={t('accounts.unlink')} onClick={() => unlink(a.id)}>
              ✕
            </button>
          </div>
        ))}

        {adding ? (
          <form className="stack" onSubmit={link}>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{t('accounts.addHint')}</p>
            <div className="field">
              <label htmlFor="linkUsername">{t('auth.username')}</label>
              <input id="linkUsername" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" required />
            </div>
            <div className="field">
              <label htmlFor="linkPassword">{t('auth.password')}</label>
              <input id="linkPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required />
            </div>
            <div className="flex gap-sm">
              <button type="submit" className="btn btn-primary" disabled={busy || !username.trim() || !password}>
                {t('accounts.link')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setAdding(false); setError(null); }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => { setAdding(true); setError(null); }}>
            ➕ {t('accounts.add')}
          </button>
        )}

        {error && <div className="form-error-banner">{error}</div>}
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
