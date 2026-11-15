import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { RiCloseLine, RiGroupLine, RiLock2Fill, RiLockUnlockFill, RiSearchLine } from '@remixicon/react';
import { Switch } from './Switch';
import { usePinned } from '../lib/use-pinned';
import { FeatureArt, GROUPS, type Role } from './featureMeta';

type Hit = { id: number; username: string; displayName: string; email: string; role: 'student' | 'teacher' | 'admin'; grade: number | null; schoolName: string | null; isActive: boolean };
type Row = { key: string; group: boolean; own: boolean | null; effective: boolean; updatedAt: string | null; updatedBy: string | null };
type Detail = { account: { id: number; username: string; displayName: string; role: Role; grade: number | null; schoolName: string | null }; features: Row[] };

const ORDER = GROUPS.flatMap((g) => g.keys);
const initial = (name: string) => name.trim().slice(0, 1).toUpperCase();

/** The chosen account's header: fixed just under the tab strip while the cards scroll (lib/use-pinned.ts). Mounted together with the header, so it measures it. */
function PinnedHead({ top, children }: { top: number; children: React.ReactNode }) {
  const pin = usePinned(top);
  return (
    <div ref={pin.slotRef} className="fa-head-slot" style={{ minHeight: pin.height || undefined }}>
      <header ref={pin.elRef as React.RefObject<HTMLElement>} className={`card fa-head${pin.pinned ? ' is-pinned' : ''}`} style={pin.pinned ? { ...pin.pinStyle, top } : undefined}>
        {children}
      </header>
    </div>
  );
}

/** Admin > Features > One account: find a student or teacher by name, username or e-mail and open or close parts of the site for that account alone.
 *  An account's own switch beats its group's: "Close" shuts it for them only, "Open" lets them in while it is closed for the group, "Like the group"
 *  removes the own switch. */
export function AdminFeatureAccounts({ pinTop }: { pinTop: number }) {
  const { t, lang } = useLanguage();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const roleLabel = (r: string) => t(r === 'teacher' ? 'features.teachers' : 'features.students');

  // search as the admin types (after a short pause)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const id = window.setTimeout(() => {
      api
        .get<{ accounts: Hit[] }>(`/admin/accounts/search?q=${encodeURIComponent(term)}`)
        .then((d) => {
          if (seq === searchSeq.current) setHits(d.accounts.filter((a) => a.role !== 'admin'));
        })
        .catch(() => seq === searchSeq.current && setHits([]))
        .finally(() => seq === searchSeq.current && setSearching(false));
    }, 300);
    return () => window.clearTimeout(id);
  }, [q]);

  async function openAccount(id: number) {
    setError(null);
    try {
      setDetail(await api.get<Detail>(`/admin/features/accounts/${id}`));
      setHits(null);
      setQ('');
    } catch (e) {
      setError(e instanceof ApiError ? translateApiError(lang, e.message) : t('features.loadError'));
    }
  }

  async function setOwn(feature: string, enabled: boolean | null) {
    if (!detail) return;
    setSaving(feature);
    setError(null);
    try {
      setDetail(await api.put<Detail>(`/admin/features/accounts/${detail.account.id}`, { feature, enabled }));
    } catch (e) {
      setError(e instanceof ApiError ? translateApiError(lang, e.message) : t('features.saveError'));
    } finally {
      setSaving(null);
    }
  }

  const rows = detail ? [...detail.features].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)) : [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      {error && <div className="form-error-banner" role="alert">{error}</div>}

      <section className="card fa-search">
        <div className="fa-search-box">
          <RiSearchLine className="fa-search-ico" size={22} aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('features.searchPlaceholder')}
            aria-label={t('features.searchPlaceholder')}
            autoComplete="off"
          />
        </div>
        <span className="muted fa-search-hint" role="status">{searching ? t('features.searching') : t('features.searchHint')}</span>
        {hits && (
          <ul className="fa-hits">
            {hits.length === 0 && !searching && <li className="muted fa-none">{t('features.noResults')}</li>}
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="fa-hit" onClick={() => void openAccount(h.id)}>
                  <span className={`fa-avatar fa-avatar--${h.role}`} aria-hidden="true">{initial(h.displayName || h.username)}</span>
                  <span className="fa-hit-text">
                    <strong>{h.displayName}</strong>
                    <bdi className="muted">@{h.username}</bdi>
                  </span>
                  <span className={`fa-role fa-role--${h.role}`}>{roleLabel(h.role)}{h.grade ? ` · ${h.grade}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail && (
        <section className="fa-detail">
          <PinnedHead top={pinTop}>
            <span className={`fa-avatar fa-avatar--big fa-avatar--${detail.account.role}`} aria-hidden="true">{initial(detail.account.displayName || detail.account.username)}</span>
            <div className="fa-head-text">
              <small>{t('features.pickedAccount')}</small>
              <h2>{detail.account.displayName}</h2>
              <bdi className="muted">@{detail.account.username}</bdi>
            </div>
            <span className={`fa-role fa-role--${detail.account.role}`}>
              {roleLabel(detail.account.role)}{detail.account.grade ? ` · ${detail.account.grade}` : ''}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>
              <RiCloseLine size={16} aria-hidden="true" /> {t('features.changeAccount')}
            </button>
          </PinnedHead>

          <div className="fa-rows">
            {rows.map((r) => {
              const busy = saving === r.key;
              return (
                <article key={r.key} className={`card feature-tile fa-row${r.effective ? '' : ' is-off'}${r.own === null ? '' : ' is-own'}`}>
                  <div className="feature-tile-top">
                    <span className="feature-art-wrap">
                      <FeatureArt k={r.key} size={64} />
                    </span>
                    <div className="feature-tile-text">
                      <h3>{t(`features.${r.key}`)}</h3>
                      <p>{t(r.key === 'site' ? 'features.siteHelpAccount' : `features.${r.key}Help`)}</p>
                    </div>
                  </div>
                  <div className="fa-status">
                    <span className={`fa-pill ${r.effective ? 'is-open' : 'is-closed'}`}>
                      {r.effective ? <RiLockUnlockFill size={13} aria-hidden="true" /> : <RiLock2Fill size={13} aria-hidden="true" />}
                      {t(r.effective ? 'features.nowOpen' : 'features.nowClosed')}
                    </span>
                    <span className={`fa-why${r.own === null ? '' : ' is-own'}`}>
                      {r.own === null ? t(r.group ? 'features.groupIsOpen' : 'features.groupIsClosed') : t('features.ownSetting')}
                    </span>
                  </div>
                  {/* one switch, like the Everyone tab: flip it to give or take this feature for THIS account. If the new state is the same as the group's, the
                      account's own setting is dropped and it simply follows the group again. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.effective}
                    aria-label={`${t(`features.${r.key}`)} · ${detail.account.displayName}`}
                    className={`feature-switch fa-switch${r.effective ? ' is-on' : ''}`}
                    disabled={busy}
                    onClick={() => {
                      const next = !r.effective;
                      void setOwn(r.key, next === r.group ? null : next);
                    }}
                  >
                    <span className="feature-role-name">{t('features.pickedAccount')}</span>
                    <Switch kind="flat" on={r.effective} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
