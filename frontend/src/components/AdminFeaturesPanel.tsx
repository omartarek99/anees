import { useEffect, useState, type ReactNode } from 'react';
import {
  RiMapFill,
  RiGamepadLine,
  RiSwordLine,
  RiVideoFill,
  RiFilePaper2Line,
  RiRobot2Line,
  RiBarChartBoxFill,
  RiGroupFill,
  RiMovie2Line,
  RiUserAddLine,
  RiToolsLine,
} from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Switch } from './Switch';

type Role = 'student' | 'teacher';
type State = { enabled: boolean; message: string | null; updatedAt: string | null; updatedBy: string | null };
type Feature = { key: string; roles: Partial<Record<Role, State>> };

// The order and grouping of the switches. The keys are the ones in the backend lib/features.ts.
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'features.groupSite', keys: ['site'] },
  { title: 'features.groupGames', keys: ['map', 'craft', 'challenges'] },
  { title: 'features.groupLearning', keys: ['reels', 'worksheets', 'ai_worksheets'] },
  { title: 'features.groupCommunity', keys: ['leaderboard', 'friends'] },
  { title: 'features.groupTeachers', keys: ['teacher_upload'] },
  { title: 'features.groupAccounts', keys: ['signup'] },
];

const ICONS: Record<string, ReactNode> = {
  site: <RiToolsLine size={22} />,
  map: <RiMapFill size={22} />,
  craft: <RiGamepadLine size={22} />,
  challenges: <RiSwordLine size={22} />,
  reels: <RiVideoFill size={22} />,
  worksheets: <RiFilePaper2Line size={22} />,
  ai_worksheets: <RiRobot2Line size={22} />,
  leaderboard: <RiBarChartBoxFill size={22} />,
  friends: <RiGroupFill size={22} />,
  teacher_upload: <RiMovie2Line size={22} />,
  signup: <RiUserAddLine size={22} />,
};

/** Admin only: one on/off switch per part of the site and per kind of account (students, teachers). Takes effect for everyone on the site within a minute
 *  (the app asks again about once a minute, and straight away when the server answers "closed"). The admin account itself is never switched off. */
export function AdminFeaturesPanel() {
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
    if (cur.enabled) {
      // switching OFF is the one that locks people out: ask first
      const msg = t(f.key === 'site' ? 'features.confirmSiteOff' : 'features.confirmOff', { name: t(`features.${f.key}`), role: roleLabel(role) });
      if (!window.confirm(msg)) return;
    }
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
    <div className="stack" style={{ gap: 16 }}>
      <p className="muted" style={{ margin: 0 }}>{t('features.adminIntro')}</p>
      {error && <div className="form-error-banner" role="alert">{error}</div>}

      {GROUPS.map((g) => {
        const rows = g.keys.map((k) => features.find((f) => f.key === k)).filter((f): f is Feature => !!f);
        if (rows.length === 0) return null;
        return (
          <section key={g.title} className="card feature-card">
            <div className="feature-row feature-head">
              <h2 style={{ margin: 0, fontSize: 18 }}>{t(g.title)}</h2>
              <span>{t('features.students')}</span>
              <span>{t('features.teachers')}</span>
            </div>
            {rows.map((f) => (
              <div key={f.key}>
                <div className="feature-row">
                  <div className="feature-name">
                    <span className="feature-icon" aria-hidden="true">{ICONS[f.key]}</span>
                    <div>
                      <strong>{t(`features.${f.key}`)}</strong>
                      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{t(`features.${f.key}Help`)}</div>
                    </div>
                  </div>
                  {(['student', 'teacher'] as Role[]).map((role) => {
                    const st = f.roles[role];
                    if (!st) {
                      return (
                        <span key={role} className="feature-na" title={t('features.notForRole')} aria-label={t('features.notForRole')}>
                          —
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
                        className="feature-switch"
                        disabled={busy}
                        onClick={() => toggle(f, role)}
                        title={st.updatedBy ? t('features.changedBy', { name: st.updatedBy, when: when(st.updatedAt) }) : t('features.neverChanged')}
                      >
                        <Switch kind="flat" on={st.enabled} />
                        <span className={st.enabled ? 'feature-state is-on' : 'feature-state'}>{t(st.enabled ? 'features.on' : 'features.off')}</span>
                      </button>
                    );
                  })}
                </div>

                {f.key === 'site' && (
                  <div className="feature-notes">
                    {(['student', 'teacher'] as Role[]).map((role) => {
                      const id = `site|${role}`;
                      return (
                        <div key={role} className="field">
                          <label htmlFor={`note-${role}`}>
                            {t('features.noticeLabel')} · {roleLabel(role)}
                          </label>
                          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                            <input
                              id={`note-${role}`}
                              type="text"
                              maxLength={300}
                              style={{ flex: 1, minWidth: 220 }}
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
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('features.noticeHelp')}</p>
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
