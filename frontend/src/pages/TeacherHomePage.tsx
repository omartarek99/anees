import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { NewsCard } from '../components/NewsCard';
import { Topbar } from '../components/Topbar';

type NewsPost = {
  id: number;
  title: string;
  titleAr?: string | null;
  body: string;
  bodyAr?: string | null;
  icon: string;
  subject: string | null;
  publishedAt: string;
  isMine?: boolean;
};

/** The teacher's landing page — this is how a teacher account "provides material" on Anees:
 * posting announcements/study material onto the shared news feed that students see on their
 * own Home page. Teachers have no access to Reels/Map/Worksheets/etc (student-only, enforced
 * both by hidden nav and by the backend), so this composer plus their own post list is the
 * entirety of the teacher experience. */
export function TeacherHomePage() {
  const { t, lang } = useLanguage();
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [body, setBody] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [icon, setIcon] = useState('📣');
  const [subject, setSubject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function loadPosts() {
    setLoadError(null);
    api
      .get<{ posts: NewsPost[] }>('/news')
      .then((data) => setPosts(data.posts))
      .catch(() => setLoadError(t('home.loadError')));
  }

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/news', {
        title,
        titleAr,
        body,
        bodyAr,
        icon: icon || '📣',
        subject: subject || undefined,
      });
      setTitle('');
      setTitleAr('');
      setBody('');
      setBodyAr('');
      setIcon('📣');
      setSubject('');
      loadPosts();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setFormError(translateApiError(lang, message) || t('teacher.postError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/news/${id}`);
      setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    } catch {
      loadPosts();
    }
  }

  const myPosts = posts?.filter((p) => p.isMine) ?? [];

  return (
    <div className="stack">
      <Topbar title={t('teacher.homeTitle')} subtitle={t('teacher.homeSubtitle')} />

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('teacher.composerTitle')}</h3>
        <form onSubmit={handleSubmit}>
          {formError && <div className="form-error-banner">{formError}</div>}

          <div className="field">
            <label htmlFor="newsTitle">{t('teacher.titleLabel')}</label>
            <input id="newsTitle" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="newsTitleAr">{t('teacher.titleArLabel')}</label>
            <input id="newsTitleAr" dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="newsBody">{t('teacher.bodyLabel')}</label>
            <textarea id="newsBody" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={2000} rows={4} />
          </div>
          <div className="field">
            <label htmlFor="newsBodyAr">{t('teacher.bodyArLabel')}</label>
            <textarea id="newsBodyAr" dir="rtl" value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} maxLength={2000} rows={4} />
          </div>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <div className="field" style={{ width: 100 }}>
              <label htmlFor="newsIcon">{t('teacher.iconLabel')}</label>
              <input id="newsIcon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="newsSubject">{t('teacher.subjectLabel')}</label>
              <select id="newsSubject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">{t('teacher.subjectAny')}</option>
                <option value="math">{t('teacher.subjectMath')}</option>
                <option value="science">{t('teacher.subjectScience')}</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? t('teacher.posting') : t('teacher.postButton')}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('teacher.myPosts')}</h3>
        {loadError && <div className="form-error-banner">{loadError}</div>}
        {!posts && !loadError && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}
        {posts && myPosts.length === 0 && !loadError && <p className="muted">{t('teacher.noPosts')}</p>}
        <div className="stack" style={{ gap: 10 }}>
          {myPosts.map((post) => (
            <NewsCard key={post.id} post={post} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    </div>
  );
}
