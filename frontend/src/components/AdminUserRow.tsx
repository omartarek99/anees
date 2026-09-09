import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Role } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: Role;
  grade: number | null;
  totalXp: number;
  isActive: boolean;
  emailVerified: boolean;
  warningMessage: string | null;
  warningIssuedAt: string | null;
  bannedUntil: string | null;
  isBanned: boolean;
  createdAt: string;
};

const BAN_DURATIONS = [
  { days: 1, key: 'ban1Day' as const },
  { days: 7, key: 'ban7Days' as const },
  { days: 30, key: 'ban30Days' as const },
];

export function AdminUserRow({
  user: u,
  isSelf,
  onUpdated,
  onDeleted,
}: {
  user: AdminUser;
  isSelf: boolean;
  onUpdated: (user: AdminUser) => void;
  onDeleted: (id: number) => void;
}) {
  const { t, lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [xpDraft, setXpDraft] = useState(String(u.totalXp));
  const [warningDraft, setWarningDraft] = useState('');
  const [customBanDate, setCustomBanDate] = useState('');
  const [busy, setBusy] = useState(false);

  function reportError(err: unknown) {
    const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    setRowError(translateApiError(lang, message));
  }

  async function handleToggleActive() {
    setRowError(null);
    try {
      const data = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/active`, { isActive: !u.isActive });
      onUpdated(data.user);
    } catch (err) {
      reportError(err);
    }
  }

  async function handleRoleChange(role: Role) {
    setRowError(null);
    try {
      const data = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/role`, { role });
      onUpdated(data.user);
    } catch (err) {
      reportError(err);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('admin.deleteConfirm', { name: u.displayName }))) return;
    setRowError(null);
    try {
      await api.delete(`/admin/users/${u.id}`);
      onDeleted(u.id);
    } catch (err) {
      reportError(err);
    }
  }

  async function handleSaveXp() {
    const totalXp = Number(xpDraft);
    if (!Number.isInteger(totalXp) || totalXp < 0) return;
    setBusy(true);
    setRowError(null);
    try {
      const data = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/xp`, { totalXp });
      onUpdated(data.user);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendWarning() {
    if (!warningDraft.trim()) return;
    setBusy(true);
    setRowError(null);
    try {
      const data = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/warning`, { message: warningDraft.trim() });
      onUpdated(data.user);
      setWarningDraft('');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearWarning() {
    setBusy(true);
    setRowError(null);
    try {
      const data = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/warning`, { message: null });
      onUpdated(data.user);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleBan(bannedUntil: string | null) {
    setBusy(true);
    setRowError(null);
    try {
      const data = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/ban`, { bannedUntil });
      onUpdated(data.user);
      setCustomBanDate('');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleBanDays(days: number) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    handleBan(until);
  }

  function handleBanCustom() {
    if (!customBanDate) return;
    const until = new Date(customBanDate).toISOString();
    handleBan(until);
  }

  return (
    <div className="card" style={{ background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
      <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>
            {u.displayName} {isSelf && <span className="muted">{t('admin.you')}</span>}
          </strong>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            @{u.username} · {u.email}
          </p>
        </div>
        <div className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={u.role}
            disabled={isSelf}
            onChange={(e) => handleRoleChange(e.target.value as Role)}
            aria-label={t('admin.roleLabel')}
          >
            <option value="student">{t('admin.roleStudentOption')}</option>
            <option value="teacher">{t('admin.roleTeacherOption')}</option>
            <option value="admin">{t('admin.roleAdminOption')}</option>
          </select>
          <span className={`badge ${u.isActive ? 'badge-success' : 'badge-maroon'}`}>
            {u.isActive ? t('admin.statusActive') : t('admin.statusInactive')}
          </span>
          {u.isBanned && <span className="badge badge-gold">{t('admin.bannedUntil', { date: new Date(u.bannedUntil!).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-US') })}</span>}
          <button type="button" className="btn btn-secondary" disabled={isSelf} onClick={handleToggleActive}>
            {u.isActive ? t('admin.deactivateButton') : t('admin.activateButton')}
          </button>
          <button type="button" className="btn btn-secondary" disabled={isSelf} onClick={handleDelete}>
            {t('admin.deleteButton')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setExpanded((e) => !e)}>
            {expanded ? t('admin.hideButton') : t('admin.manageButton')}
          </button>
        </div>
      </div>

      {rowError && (
        <p className="form-error-banner" style={{ marginTop: 8, marginBottom: 0 }}>
          {rowError}
        </p>
      )}

      {expanded && (
        <div className="stack" style={{ gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <div className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>{t('admin.pointsLabel')}</label>
            <input
              type="number"
              min={0}
              value={xpDraft}
              onChange={(e) => setXpDraft(e.target.value)}
              style={{ width: 110 }}
              disabled={isSelf}
            />
            <button type="button" className="btn btn-secondary" disabled={isSelf || busy} onClick={handleSaveXp}>
              {t('admin.saveButton')}
            </button>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>{t('admin.warningLabel')}</label>
            {u.warningMessage && (
              <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {t('admin.currentWarning', { message: u.warningMessage })}
              </p>
            )}
            {!isSelf && (
              <>
                <textarea
                  value={warningDraft}
                  onChange={(e) => setWarningDraft(e.target.value)}
                  placeholder={t('admin.warningPlaceholder')}
                  maxLength={500}
                  rows={2}
                />
                <div className="flex gap-sm" style={{ marginTop: 6 }}>
                  <button type="button" className="btn btn-secondary" disabled={busy || !warningDraft.trim()} onClick={handleSendWarning}>
                    {t('admin.sendWarningButton')}
                  </button>
                  {u.warningMessage && (
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={handleClearWarning}>
                      {t('admin.clearWarningButton')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {!isSelf && (
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{t('admin.banLabel')}</label>
              <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {u.isBanned
                  ? t('admin.bannedUntil', { date: new Date(u.bannedUntil!).toLocaleString(lang === 'ar' ? 'ar' : 'en-US') })
                  : t('admin.notBanned')}
              </p>
              <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                {BAN_DURATIONS.map((d) => (
                  <button key={d.days} type="button" className="btn btn-secondary" disabled={busy} onClick={() => handleBanDays(d.days)}>
                    {t(`admin.${d.key}`)}
                  </button>
                ))}
                <input type="date" value={customBanDate} onChange={(e) => setCustomBanDate(e.target.value)} />
                <button type="button" className="btn btn-secondary" disabled={busy || !customBanDate} onClick={handleBanCustom}>
                  {t('admin.banCustom')}
                </button>
                {u.isBanned && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => handleBan(null)}>
                    {t('admin.unbanButton')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
