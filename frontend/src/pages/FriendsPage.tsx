import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RiSearchLine } from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { Topbar } from '../components/Topbar';
import { VictoryShield } from '../components/VictoryShield';
import { XpIcon } from '../components/XpIcon';
import { ChallengeSetupModal } from '../components/ChallengeSetupModal';
import '../styles/friends.css';

type Friend = { username: string; displayName: string; avatarKey: string; totalXp: number; hasShield?: boolean };
type FriendRequest = { requestId: number; username: string; displayName: string; avatarKey: string; createdAt: string };
type Person = { username: string; displayName: string; avatarKey: string; hasShield?: boolean };

type Tab = 'friends' | 'requests' | 'suggested';

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
  // the friend a challenge is being set up for ("تحدى صديقك")
  const [challengeFor, setChallengeFor] = useState<Friend | null>(null);

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

  // One row: the person, an optional chip (their XP) and what you can do with them. (A render function, not a component:
  // declared inside one, a component would remount every row on each render.)
  const item = (key: string | number, p: Person, chip: ReactNode, actions: ReactNode) => (
    <li key={key} className="fr-item">
      <Avatar avatarKey={p.avatarKey} size={48} />
      <div className="fr-who">
        <div className="fr-name">
          {p.displayName}
          {p.hasShield && <VictoryShield size={16} />}
        </div>
        <div className="fr-handle">
          <bdi dir="ltr">@{p.username}</bdi>
        </div>
      </div>
      <div className="fr-chip-slot">{chip}</div>
      <div className="fr-actions">{actions}</div>
    </li>
  );

  // Someone you could add: an Add button, or a plain status when there is nothing left to do.
  const personRow = (p: Person) => {
    const status = statusOf(p.username);
    return item(
      p.username,
      p,
      null,
      status ? (
        <span className="fr-status">{status}</span>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={() => sendRequest(p.username)}>
          {t('friends.addFriend')}
        </button>
      )
    );
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'friends', label: t('friends.tabFriends', { n: friends?.length ?? 0 }) },
    { key: 'requests', label: t('friends.tabRequests', { n: incoming.length }) },
    { key: 'suggested', label: t('friends.tabSuggested') },
  ];

  return (
    <div className="stack">
      <Topbar />

      {error && <div className="form-error-banner">{error}</div>}
      {message && <div className="form-success-banner">{message}</div>}

      <section className="fr">
        <header className="fr-head">
          <div>
            <h1 className="fr-title">{t('friends.title')}</h1>
            <p className="fr-sub">{t('friends.subtitle')}</p>
          </div>
          <label className="fr-search">
            <RiSearchLine size={18} aria-hidden="true" />
            <input aria-label={t('friends.searchLabel')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('friends.searchPlaceholder')} />
          </label>
        </header>

        {searching ? (
          <ul className="fr-list">
            {results.map(personRow)}
            {results.length === 0 && <li className="fr-empty">{t('friends.noResults')}</li>}
          </ul>
        ) : (
          <>
            <div className="fr-tabs">
              {tabs.map((tabDef) => (
                <button
                  key={tabDef.key}
                  className={`fr-tab${tab === tabDef.key ? ' is-active' : ''}`}
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

            {tab === 'friends' &&
              (friends && friends.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: 40 }}>🫂</div>
                  <p>{t('friends.empty')}</p>
                </div>
              ) : (
                <ul className="fr-list">
                  {friends?.map((f) =>
                    item(
                      f.username,
                      f,
                      <span className="fr-chip">
                        <XpIcon size={22} />
                        {f.totalXp} {t('common.xpUnit')}
                      </span>,
                      <>
                        <button type="button" className="btn btn-gold btn-sm" onClick={() => setChallengeFor(f)}>
                          ⚔️ {t('challenge.button')}
                        </button>
                        <Link to={`/profile/${f.username}`} className="btn btn-secondary btn-sm">
                          {t('friends.viewProfile')}
                        </Link>
                      </>
                    )
                  )}
                </ul>
              ))}

            {tab === 'requests' && (
              <ul className="fr-list">
                <li className="fr-section">{t('friends.incoming')}</li>
                {incoming.length === 0 && <li className="fr-empty">{t('friends.noIncoming')}</li>}
                {incoming.map((r) =>
                  item(
                    r.requestId,
                    r,
                    null,
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => respond(r.requestId, 'accept')}>
                        {t('friends.accept')}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => respond(r.requestId, 'decline')}>
                        {t('friends.decline')}
                      </button>
                    </>
                  )
                )}
                <li className="fr-section">{t('friends.sent')}</li>
                {outgoing.length === 0 && <li className="fr-empty">{t('friends.noOutgoing')}</li>}
                {outgoing.map((r) => item(r.requestId, r, null, <span className="fr-chip">{t('friends.pending')}</span>))}
              </ul>
            )}

            {tab === 'suggested' && (
              <ul className="fr-list">
                {suggestions.map(personRow)}
                {suggestions.length === 0 && <li className="fr-empty">{t('friends.suggestionsEmpty')}</li>}
                <li className="fr-more">
                  <Link to="/leaderboard" className="btn btn-secondary btn-sm">
                    {t('friends.viewAll')}
                  </Link>
                </li>
              </ul>
            )}
          </>
        )}
      </section>
      <ChallengeSetupModal friend={challengeFor} onClose={() => setChallengeFor(null)} />
    </div>
  );
}
