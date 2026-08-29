import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { Topbar } from '../components/Topbar';

type Thread = { username: string; displayName: string; avatarKey: string; lastMessage: string | null; lastAt: string | null };
type Message = { id: number; fromMe: boolean; body: string; createdAt: string };

const POLL_MS = 4000;

function ThreadList() {
  const { t } = useLanguage();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ threads: Thread[] }>('/messages')
      .then((d) => setThreads(d.threads))
      .catch(() => setError(t('messages.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack">
      <Topbar title={t('messages.title')} subtitle={t('messages.subtitle')} />

      {error && <div className="form-error-banner">{error}</div>}
      {!threads && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {threads && threads.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>📪</div>
          <p>
            {t('messages.emptyThreads').split('{link}')[0]}
            <Link to="/friends">{t('messages.friendsLink')}</Link>
            {t('messages.emptyThreads').split('{link}')[1]}
          </p>
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        {threads?.map((thread) => (
          <Link
            key={thread.username}
            to={`/messages/${thread.username}`}
            className="list-row flex gap-md"
            style={{ alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
          >
            <Avatar avatarKey={thread.avatarKey} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{thread.displayName}</div>
              <div className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {thread.lastMessage ?? t('messages.sayHello')}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Conversation({ username }: { username: string }) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCreatedAt = useRef<string | null>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  async function loadInitial() {
    try {
      const data = await api.get<{ messages: Message[] }>(`/messages/${username}`);
      setMessages(data.messages);
      if (data.messages.length > 0) lastCreatedAt.current = data.messages[data.messages.length - 1].createdAt;
      setLoaded(true);
      scrollToBottom();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('messages.loadError'));
      setLoaded(true);
    }
  }

  async function poll() {
    if (!lastCreatedAt.current) return;
    try {
      const data = await api.get<{ messages: Message[] }>(`/messages/${username}?since=${encodeURIComponent(lastCreatedAt.current)}`);
      if (data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages]);
        lastCreatedAt.current = data.messages[data.messages.length - 1].createdAt;
        scrollToBottom();
      }
    } catch {
      // silent — will retry on next interval
    }
  }

  useEffect(() => {
    setMessages([]);
    setLoaded(false);
    lastCreatedAt.current = null;
    loadInitial();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const data = await api.post<{ message: Message }>(`/messages/${username}`, { body: trimmed });
      setMessages((prev) => [...prev, data.message]);
      lastCreatedAt.current = data.message.createdAt;
      setBody('');
      scrollToBottom();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('messages.loadError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/messages')}>
        {t('messages.allConversations')}
      </button>

      <div
        className="card"
        style={{ display: 'flex', flexDirection: 'column', height: '60vh', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!loaded && (
            <div className="empty-state">
              <div className="spinner" />
            </div>
          )}
          {loaded && messages.length === 0 && !error && <p className="muted text-center">{t('messages.startChat')}</p>}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.fromMe ? 'flex-end' : 'flex-start',
                background: m.fromMe ? 'var(--maroon)' : 'var(--sand)',
                color: m.fromMe ? 'white' : 'var(--ink)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                maxWidth: '75%',
              }}
            >
              {m.body}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {error && (
          <div className="form-error-banner" style={{ margin: '0 16px' }}>
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-sm"
          style={{ padding: 12, borderTop: '1px solid var(--sand-dark)' }}
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('messages.inputPlaceholder')}
            maxLength={500}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-pill)',
              border: '2px solid var(--sand-dark)',
            }}
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !body.trim()}>
            {t('messages.send')}
          </button>
        </form>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        {t('messages.footer', { username, name: user?.displayName ?? '' })}
      </p>
    </div>
  );
}

export function MessagesPage() {
  const { username } = useParams();
  if (username) return <Conversation username={username} />;
  return <ThreadList />;
}
