import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RiSearchLine, RiVipDiamondFill } from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { Topbar } from '../components/Topbar';
import { VictoryShield } from '../components/VictoryShield';
import '../styles/friends.css';

type Friend = { username: string; displayName: string; avatarKey: string; totalXp: number; hasShield?: boolean };
type FriendRequest = { requestId: number; username: string; displayName: string; avatarKey: string; createdAt: string };
type Person = { username: string; displayName: string; avatarKey: string };

type Tab = 'friends' | 'requests';

const SUGGESTIONS_SHOWN = 6;

export function FriendsPage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  // This month's top players on the viewer's own board -- people worth adding, drawn from data the app already has.
  const [topPlayers, setTopPlayers] = useState<Person[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadFriends() {
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(d.friends))
      .catch(() => setError(t('messages.loadError')));
  }

  function loadRequests() {
    api
      .get<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests')
      .then((d) => {
        setIncoming(d.incoming);
        setOutgoing(d.outgoing);
      })
      .catch(() => setError(t('messages.loadError')));
  }

  useEffect(() => {
    loadFriends();
    loadRequests();
    api
      .get<{ leaders: Person[] }>('/leaderboard')
      .then((d) => setTopPlayers(d.leaders))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<{ users: Person[] }>(`/users/search?q=${encodeURIComponent(query)}`)
        .then((d) => setResults(d.users))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function sendRequest(username: string) {
    setMessage(null);
    setError(null);
    try {
      await api.post('/friends/request', { toUsername: username });
      setMessage(t('friends.requestSent', { username }));
      loadRequests();
      loadFriends();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    }
  }

  async function respond(requestId: number, action: 'accept' | 'decline') {
    try {
      await api.post(`/friends/requests/${requestId}/${action}`);
      loadRequests();
      if (action === 'accept') loadFriends(); // declining can't change the friends list
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    }
  }

  // Already friends / a request is pending either way -> a status label, not a button that can only fail with a 409.
  const statusOf = (username: string) =>
    friends?.some((f) => f.username === username)
      ? t('friends.statusFriends')
      : [...incoming, ...outgoing].some((q) => q.username === username)
        ? t('friends.statusPending')
        : null;

  const suggestions = topPlayers.filter((p) => p.username !== user?.username && !statusOf(p.username)).slice(0, SUGGESTIONS_SHOWN);
  const searching = query.trim().length >= 2;

  // One person with the action that fits: an Add pill, or a plain status when there is nothing left to do.
  // (A render function, not a component: declared inside one, a component would remount every row on each render.)
  const personRow = (p: Person, size: number) => {
    const status = statusOf(p.username);
    return (
      <div key={p.username} className="fr-row">
        <Avatar avatarKey={p.avatarKey} size={size} />
        <div className="fr-row-text">
          <div className="fr-name">{p.displayName}</div>
          <div className="fr-handle">
            <bdi dir="ltr">@{p.username}</bdi>
          </div>
        </div>
        {status ? (
          <span className="fr-status">{status}</span>
        ) : (
          <button className="btn btn-primary btn-sm fr-pill" onClick={() => sendRequest(p.username)}>
            {t('friends.addFriend')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="stack">
      <Topbar title={t('friends.title')} subtitle={t('friends.subtitle')} />

      {error && <div className="form-error-banner">{error}</div>}
      {message && <div className="form-success-banner">{message}</div>}

      <div className="fr">
        <section className="fr-panel">
          <header className="fr-me">
            <Avatar avatarKey={user?.avatarKey ?? 'falcon'} size={44} />
            <div className="fr-row-text">
              <div className="fr-name">
                {user?.displayName}
                {user?.hasShield && <VictoryShield size={16} />}
              </div>
              <div className="fr-handle">
                <bdi dir="ltr">@{user?.username}</bdi>
              </div>
            </div>
            <span className="fr-count">{t('friends.tabFriends', { n: friends?.length ?? 0 })}</span>
          </header>

          <label className="fr-search">
            <RiSearchLine size={18} aria-hidden="true" />
            <input aria-label={t('friends.searchLabel')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('friends.searchPlaceholder')} />
          </label>

          {searching ? (
            <div className="fr-list">
              {results.map((r) => personRow(r, 40))}
              {results.length === 0 && <p className="muted">{t('friends.noResults')}</p>}
            </div>
          ) : (
            <>
              <div className="fr-tabs">
                {(
                  [
                    { key: 'friends', label: t('friends.tabFriends', { n: friends?.length ?? 0 }) },
                    { key: 'requests', label: t('friends.tabRequests', { n: incoming.length }) },
                  ] as { key: Tab; label: string }[]
                ).map((tabDef) => (
                  <button
                    key={tabDef.key}
                    className={`btn btn-sm fr-pill ${tab === tabDef.key ? 'btn-primary' : 'btn-secondary'}`}
                    aria-pressed={tab === tabDef.key}
                    onClick={() => {
                      setTab(tabDef.key);
                      setMessage(null);
                      setError(null);
                    }}
                  >
                    {tabDef.label}
                  </button>
                ))}
              </div>

              {tab === 'friends' && (
                <>
                  {friends && friends.length === 0 && (
                    <div className="empty-state">
                      <div style={{ fontSize: 40 }}>🫂</div>
                      <p>{t('friends.empty')}</p>
                    </div>
                  )}
                  <div className="fr-grid">
                    {friends?.map((f) => (
                      <Link key={f.username} to={`/profile/${f.username}`} className="fr-friend">
                        <span className="fr-tile">
                          <Avatar avatarKey={f.avatarKey} size={72} square />
                        </span>
                        <span className="fr-name">
                          {f.displayName}
                          {f.hasShield && <VictoryShield size={16} />}
                        </span>
                        <span className="fr-handle">
                          <bdi dir="ltr">@{f.username}</bdi>
                        </span>
                        <span className="fr-xp">
                          <RiVipDiamondFill size={14} aria-hidden="true" />
                          {f.totalXp} {t('common.xpUnit')}
                        </span>
                        <span className="btn btn-secondary btn-sm fr-pill">{t('friends.viewProfile')}</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}

              {tab === 'requests' && (
                <div className="fr-list">
                  <h3 className="fr-heading">{t('friends.incoming')}</h3>
                  {incoming.length === 0 && <p className="muted">{t('friends.noIncoming')}</p>}
                  {incoming.map((r) => (
                    <div key={r.requestId} className="fr-row">
                      <Avatar avatarKey={r.avatarKey} size={40} />
                      <div className="fr-row-text">
                        <div className="fr-name">{r.displayName}</div>
                      </div>
                      <button className="btn btn-primary btn-sm fr-pill" onClick={() => respond(r.requestId, 'accept')}>
                        {t('friends.accept')}
                      </button>
                      <button className="btn btn-ghost btn-sm fr-pill" onClick={() => respond(r.requestId, 'decline')}>
                        {t('friends.decline')}
                      </button>
                    </div>
                  ))}

                  <h3 className="fr-heading">{t('friends.sent')}</h3>
                  {outgoing.length === 0 && <p className="muted">{t('friends.noOutgoing')}</p>}
                  {outgoing.map((r) => (
                    <div key={r.requestId} className="fr-row">
                      <Avatar avatarKey={r.avatarKey} size={40} />
                      <div className="fr-row-text">
                        <div className="fr-name">{r.displayName}</div>
                      </div>
                      <span className="badge badge-maroon">{t('friends.pending')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="fr-panel">
          <div className="fr-side-head">
            <h3 className="fr-heading">{t('friends.suggestions')}</h3>
            <Link to="/leaderboard" className="btn btn-secondary btn-sm fr-pill">
              {t('friends.viewAll')}
            </Link>
          </div>
          <div className="fr-list">
            {suggestions.map((p) => personRow(p, 38))}
            {suggestions.length === 0 && <p className="muted">{t('friends.suggestionsEmpty')}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
