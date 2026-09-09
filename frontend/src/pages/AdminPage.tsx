import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth, type Role } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { Topbar } from '../components/Topbar';
import { AdminUserRow, type AdminUser } from '../components/AdminUserRow';
import { AdminVideosPanel } from '../components/AdminVideosPanel';

type RoleFilter = 'all' | Role;
type Tab = 'users' | 'videos';

function AdminUsersPanel() {
  const { user: me } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  function loadUsers() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (roleFilter !== 'all') params.set('role', roleFilter);
    const qs = params.toString();
    api
      .get<{ users: AdminUser[] }>(`/admin/users${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setUsers(data.users);
        setLoadError(null);
      })
      .catch(() => setLoadError(t('admin.loadError')));
  }

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(loadUsers, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter]);

  return (
    <div className="card">
      <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.searchPlaceholder')}
            aria-label={t('admin.searchPlaceholder')}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)} aria-label={t('admin.roleLabel')}>
            <option value="all">{t('admin.roleFilterAll')}</option>
            <option value="student">{t('admin.roleFilterStudent')}</option>
            <option value="teacher">{t('admin.roleFilterTeacher')}</option>
            <option value="admin">{t('admin.roleFilterAdmin')}</option>
          </select>
        </div>
      </div>

      {loadError && <div className="form-error-banner">{loadError}</div>}
      {!users && !loadError && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {users && users.length === 0 && !loadError && <p className="muted">{t('admin.noUsers')}</p>}

      <div className="stack" style={{ gap: 10, marginTop: 12 }}>
        {users?.map((u) => (
          <AdminUserRow
            key={u.id}
            user={u}
            isSelf={u.id === me?.id}
            onUpdated={(updated) => setUsers((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev))}
            onDeleted={(id) => setUsers((prev) => (prev ? prev.filter((x) => x.id !== id) : prev))}
          />
        ))}
      </div>
    </div>
  );
}

export function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="stack">
      <Topbar title={t('admin.pageTitle')} subtitle={t('admin.pageSubtitle')} />

      <div className="flex gap-sm">
        <button type="button" className={`btn ${tab === 'users' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('users')}>
          {t('admin.tabUsers')}
        </button>
        <button type="button" className={`btn ${tab === 'videos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('videos')}>
          {t('admin.tabVideos')}
        </button>
      </div>

      {tab === 'users' ? <AdminUsersPanel /> : <AdminVideosPanel />}
    </div>
  );
}
