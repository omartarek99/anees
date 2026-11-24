import { useEffect, useState, type CSSProperties } from 'react';
import { useFixedBar } from '../lib/use-pinned';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Switch } from './Switch';
import { AdminFeatureAccounts } from './AdminFeatureAccounts';
import { RiLock2Fill, RiTeamFill, RiUserSearchFill } from '@remixicon/react';
import { FeatureArt, GROUPS, type Role } from './featureMeta';

type State = { enabled: boolean; message: string | null; updatedAt: string | null; updatedBy: string | null };
type Feature = { key: string; roles: Partial<Record<Role, State>> };
const ROLES: Role[] = ['student', 'teacher'];

/** Admin only: one on/off switch per part of the site and per kind of account (students, teachers). Takes effect for everyone on the site within a minute
 *  (the app asks again about once a minute, and straight away when the server answers "closed"). The admin account itself is never switched off. */
export function AdminFeaturesPanel() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'groups' | 'account'>('groups');
  // the tab bar is fixed at the top of the window and the page scrolls under it (lib/use-pinned.ts); the chosen account's header docks into it
  const bar = useFixedBar(12);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  return (
    <div className="stack feature-page" style={{ gap: 18 }}>
      <div ref={bar.slotRef} className="fa-bar-slot" style={{ minHeight: bar.height || undefined }}>
      <div ref={bar.barRef} className="fa-bar" style={bar.barStyle}>
      <div className="fa-tabs" role="tablist">
        {(['groups', 'account'] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`fa-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
            <span className="fa-tab-ico" aria-hidden="true">{id === 'groups' ? <RiTeamFill size={22} /> : <RiUserSearchFill size={22} />}</span>
            <span className="fa-tab-text">
              <strong>{t(id === 'groups' ? 'features.tabGroups' : 'features.tabAccount')}</strong>
              <span>{t(id === 'groups' ? 'features.tabGroupsHelp' : 'features.tabAccountHelp')}</span>
            </span>
          </button>
        ))}
      </div>
      <div ref={setDock} className="fa-dock" />
      </div>
      </div>
      {tab === 'groups' ? <AdminFeatureGroups /> : <AdminFeatureAccounts dock={dock} />}
    </div>
  );
}

function AdminFeatureGroups() {
  const { t, lang } = useLanguage();
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // "feature|role" being saved
  const [savedNote, setSavedNote] = useState<string | null>(null); // "site|role" whose notice was just saved
  const [notes, setNotes] = useState<Record<Role, string>>({ student: '', teacher: '' });

  function apply(list: Feature[]) {
    setFeatures(list);
    const site = list.find((f) => f.key === 'site');
    setNotes({ student: site?.roles.student?.message ?? '', teacher: site?.roles.teacher?.message ?? '' });
  }

  useEffect(() => {
    api
      .get<{ features: Feature[] }>('/admin/features')
      .then((d) => apply(d.features))
      .catch(() => setError(t('features.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roleLabel = (r: Role) => t(r === 'student' ? 'features.students' : 'features.teachers');

  async function save(feature: string, role: Role, enabled: boolean, message?: string | null) {
    const id = `${feature}|${role}`;
    setSaving(id);
    setError(null);
    try {
      const data = await api.put<{ features: Feature[] }>('/admin/features', { feature, role, enabled, ...(message !== undefined ? { message } : {}) });
      // keep what the admin is typing in the notice boxes; only the switches come from the server
      setFeatures(data.features);
      if (message !== undefined) {
        setSavedNote(id);
        window.setTimeout(() => setSavedNote((cur) => (cur === id ? null : cur)), 2500);
      }
    } catch (e) {
      setError(e instanceof ApiError ? translateApiError(lang, e.message) : t('features.saveError'));
    } finally {
      setSaving(null);
    }
  }

  function toggle(f: Feature, role: Role) {
    const cur = f.roles[role];
    if (!cur) return;
    // no "are you sure" window: a switch acts at once, and switching it back on is one click
    void save(f.key, role, !cur.enabled);
  }

  const when = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  };

  if (!features) {
    return error ? (
      <div className="form-error-banner">{error}</div>
    ) : (
      <div className="empty-state">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      {error && <div className="form-error-banner" role="alert">{error}</div>}

      <div className="feature-groups">
        {GROUPS.map((g) => {
          const rows = g.keys.map((k) => features.find((f) => f.key === k)).filter((f): f is Feature => !!f);
          if (rows.length === 0) return null;
          return (
            <section key={g.title} className="feature-group" style={{ '--n': g.keys[0] === 'site' ? 4 : rows.length } as CSSProperties}>
              <h2 className="feature-group-title">
                <span className="feature-group-ico" aria-hidden="true">{g.icon}</span>
                {t(g.title)}
              </h2>
              <div className="feature-grid">
                {rows.map((f) => {
                  const states = ROLES.map((r) => f.roles[r]).filter((x): x is State => !!x);
                  // the "open without a level" switches are off by default: off is not "closed", so they get no ribbon
                  const allOff = !f.key.endsWith('_open') && states.length > 0 && states.every((x) => !x.enabled);
                  return (
                    <article key={f.key} className={`card feature-tile${allOff ? ' is-off' : ''}${f.key === 'site' ? ' feature-tile--wide' : ''}`}>
                      <div className="feature-tile-top">
                        <span className="feature-art-wrap">
                          <FeatureArt k={f.key} size={f.key === 'site' ? 64 : 52} />
                          {allOff && (
                            <span className="feature-ribbon">
                              <RiLock2Fill size={12} aria-hidden="true" />
                              {t('features.closedTag')}
                            </span>
                          )}
                        </span>
                        <div className="feature-tile-text">
                          <h3>{t(`features.${f.key}`)}</h3>
                          <p>{t(`features.${f.key}Help`)}</p>
                        </div>
                      </div>

                      <div className="feature-roles">
                        {ROLES.map((role) => {
                          const st = f.roles[role];
                          if (!st) {
                            return (
                              <span key={role} className="feature-switch feature-na" title={t('features.notForRole')}>
                                <span className="feature-role-name">{roleLabel(role)}</span>
                                <span className="feature-na-dash" aria-hidden="true">—</span>
                              </span>
                            );
                          }
                          const busy = saving === `${f.key}|${role}`;
                          return (
                            <button
                              key={role}
                              type="button"
                              role="switch"
                              aria-checked={st.enabled}
                              aria-label={`${t(`features.${f.key}`)} · ${roleLabel(role)}`}
                              className={`feature-switch${st.enabled ? ' is-on' : ''}`}
                              disabled={busy}
                              onClick={() => toggle(f, role)}
                              title={st.updatedBy ? t('features.changedBy', { name: st.updatedBy, when: when(st.updatedAt) }) : t('features.neverChanged')}
                            >
                              <span className="feature-role-name">{roleLabel(role)}</span>
                              <Switch kind="flat" on={st.enabled} />
                            </button>
                          );
                        })}
                      </div>

                      {f.key === 'site' && (
                        <div className="feature-notes">
                          {ROLES.map((role) => {
                            const id = `site|${role}`;
                            return (
                              <div key={role} className="field">
                                <label htmlFor={`note-${role}`}>
                                  {t('features.noticeLabel')} · {roleLabel(role)}
                                </label>
                                <div className="feature-note-row">
                                  <input
                                    id={`note-${role}`}
                                    type="text"
                                    maxLength={300}
                                    value={notes[role]}
                                    placeholder={t('features.noticePlaceholder')}
                                    onChange={(e) => setNotes((n) => ({ ...n, [role]: e.target.value }))}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={saving === id}
                                    onClick={() => void save('site', role, f.roles[role]?.enabled ?? true, notes[role])}
                                  >
                                    {savedNote === id ? `✓ ${t('features.saved')}` : t('features.saveNotice')}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          <p className="muted feature-notes-help">{t('features.noticeHelp')}</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
