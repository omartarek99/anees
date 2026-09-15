import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, type Role } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { Topbar } from '../components/Topbar';
import { AdminUserRow, type AdminUser } from '../components/AdminUserRow';
import { AdminVideosPanel } from '../components/AdminVideosPanel';
import { AdminReportsPanel } from '../components/AdminReportsPanel';
import { AdminCertificatesPanel } from '../components/AdminCertificatesPanel';
import { Pagination } from '../components/Pagination';
import { GradeFilterSelect, type GradeFilter } from '../components/GradeFilterSelect';

type RoleFilter = 'all' | Role;
type Tab = 'users' | 'videos' | 'reports' | 'certificates';

function AdminUsersPanel() {
  const { user: me } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  // Grades 5 and 8 are this platform's two active cohorts -- a dedicated tab for each keeps
  // the (potentially large) student list glanceable instead of one long mixed-grade page.
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [page, setPage] = useState(1);

  function loadUsers() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (gradeFilter !== 'all') params.set('grade', gradeFilter);
    params.set('page', String(page));
    api
      .get<{ users: AdminUser[]; totalPages: number }>(`/admin/users?${params.toString()}`)
      .then((data) => {
        setUsers(data.users);
        setTotalPages(data.totalPages);
        setLoadError(null);
      })
      .catch(() => setLoadError(t('admin.loadError')));
  }

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(loadUsers, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, gradeFilter, page]);

  // Any filter change invalidates the current page number -- jump back to page 1 rather
  // than risk landing past the end of a now-smaller filtered result.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, gradeFilter]);

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
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <GradeFilterSelect value={gradeFilter} onChange={setGradeFilter} />
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

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

const TABS: Tab[] = ['users', 'videos', 'reports', 'certificates'];

// Each section used to be an in-page tab switcher; it's now its own icon-bar entry
// (see Sidebar.tsx's ADMIN_LINKS) and its own route, matching every other page in the
// app -- Users/Videos/Reports/Friends/etc. are each reached by clicking a distinct icon,
// not by a secondary in-page control.
export function AdminPage() {
  const { t } = useLanguage();
  const { tab: rawTab } = useParams<{ tab: string }>();
  if (!TABS.includes(rawTab as Tab)) return <Navigate to="/admin/users" replace />;
  const tab = rawTab as Tab;

  const titleKey =
    tab === 'users' ? 'admin.tabUsers' : tab === 'videos' ? 'admin.tabVideos' : tab === 'reports' ? 'admin.tabReports' : 'admin.tabCertificates';

  return (
    <div className="stack">
      <Topbar title={t(titleKey)} subtitle={t('admin.pageSubtitle')} />

      {tab === 'users' && <AdminUsersPanel />}
      {tab === 'videos' && <AdminVideosPanel />}
      {tab === 'reports' && <AdminReportsPanel />}
      {tab === 'certificates' && <AdminCertificatesPanel />}
    </div>
  );
}
