import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { Topbar } from '../components/Topbar';

type Friend = { username: string; displayName: string; avatarKey: string; totalXp: number };
type FriendRequest = { requestId: number; username: string; displayName: string; avatarKey: string; createdAt: string };
type SearchResult = { username: string; displayName: string; avatarKey: string };

type Tab = 'friends' | 'requests' | 'add';

export function FriendsPage() {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<{ users: SearchResult[] }>(`/users/search?q=${encodeURIComponent(query)}`)
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
      loadFriends();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    }
  }

  return (
    <div className="stack">
      <Topbar title={t('friends.title')} subtitle={t('friends.subtitle')} />

      <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
        {(
          [
            { key: 'friends', label: t('friends.tabFriends', { n: friends?.length ?? 0 }) },
            { key: 'requests', label: t('friends.tabRequests', { n: incoming.length }) },
            { key: 'add', label: t('friends.tabAdd') },
          ] as { key: Tab; label: string }[]
        ).map((tabDef) => (
          <button
            key={tabDef.key}
            className="btn btn-sm"
            onClick={() => setTab(tabDef.key)}
            style={{
              background: tab === tabDef.key ? 'var(--maroon)' : 'var(--white)',
              color: tab === tabDef.key ? 'white' : 'var(--maroon)',
              border: '2px solid var(--maroon)',
            }}
          >
            {tabDef.label}
          </button>
        ))}
      </div>

      {error && <div className="form-error-banner">{error}</div>}
      {message && <div className="form-success-banner">{message}</div>}

      {tab === 'friends' && (
        <div className="stack">
          {friends && friends.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 40 }}>🫂</div>
              <p>{t('friends.empty')}</p>
            </div>
          )}
          {friends?.map((f) => (
            <div key={f.username} className="list-row flex-between">
              <Link to={`/profile/${f.username}`} className="flex gap-md" style={{ alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
                <Avatar avatarKey={f.avatarKey} size={44} />
                <div>
                  <div style={{ fontWeight: 700 }}>{f.displayName}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    @{f.username} · {f.totalXp} {t('common.xpUnit')}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {tab === 'requests' && (
        <div className="stack">
          <h3 style={{ fontSize: 15 }}>{t('friends.incoming')}</h3>
          {incoming.length === 0 && <p className="muted">{t('friends.noIncoming')}</p>}
          {incoming.map((r) => (
            <div key={r.requestId} className="list-row flex-between">
              <div className="flex gap-md" style={{ alignItems: 'center' }}>
                <Avatar avatarKey={r.avatarKey} size={40} />
                <div style={{ fontWeight: 700 }}>{r.displayName}</div>
              </div>
              <div className="flex gap-sm">
                <button className="btn btn-primary btn-sm" onClick={() => respond(r.requestId, 'accept')}>
                  {t('friends.accept')}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => respond(r.requestId, 'decline')}>
                  {t('friends.decline')}
                </button>
              </div>
            </div>
          ))}

          <h3 style={{ fontSize: 15, marginTop: 12 }}>{t('friends.sent')}</h3>
          {outgoing.length === 0 && <p className="muted">{t('friends.noOutgoing')}</p>}
          {outgoing.map((r) => (
            <div key={r.requestId} className="list-row flex-between">
              <div className="flex gap-md" style={{ alignItems: 'center' }}>
                <Avatar avatarKey={r.avatarKey} size={40} />
                <div style={{ fontWeight: 700 }}>{r.displayName}</div>
              </div>
              <span className="badge badge-maroon">{t('friends.pending')}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'add' && (
        <div className="stack">
          <div className="field">
            <label htmlFor="search">{t('friends.searchLabel')}</label>
            <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('friends.searchPlaceholder')} />
          </div>
          {results.map((r) => (
            <div key={r.username} className="list-row flex-between">
              <div className="flex gap-md" style={{ alignItems: 'center' }}>
                <Avatar avatarKey={r.avatarKey} size={40} />
                <div>
                  <div style={{ fontWeight: 700 }}>{r.displayName}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    @{r.username}
                  </div>
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => sendRequest(r.username)}>
                {t('friends.addFriend')}
              </button>
            </div>
          ))}
          {query.trim().length >= 2 && results.length === 0 && <p className="muted">{t('friends.noResults')}</p>}
        </div>
      )}
    </div>
  );
}
