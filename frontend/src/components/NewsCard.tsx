import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';

type NewsPost = {
  id: number;
  title: string;
  titleAr?: string | null;
  body: string;
  bodyAr?: string | null;
  icon: string;
  subject: string | null;
  publishedAt: string;
};

function timeAgo(iso: string, t: (path: string, vars?: Record<string, string | number>) => string): string {
  const diffMs = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  if (days < 30) return t('time.daysAgo', { n: days });
  const months = Math.floor(days / 30);
  return t('time.monthsAgo', { n: months });
}

export function NewsCard({ post }: { post: NewsPost }) {
  const { t, lang } = useLanguage();
  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <div className="list-row-icon">{post.icon}</div>
      <div style={{ flex: 1 }}>
        <div className="flex-between" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>{pickText(lang, post.title, post.titleAr)}</h3>
          {post.subject && (
            <span className={`badge ${post.subject === 'math' ? 'badge-maroon' : 'badge-gold'}`}>
              {post.subject === 'math' ? t('home.filterMath') : t('home.filterScience')}
            </span>
          )}
        </div>
        <p style={{ marginTop: 6, marginBottom: 6, color: 'var(--ink-soft)', fontSize: 14 }}>{pickText(lang, post.body, post.bodyAr)}</p>
        <span className="muted" style={{ fontSize: 12 }}>
          {timeAgo(post.publishedAt, t)}
        </span>
      </div>
    </div>
  );
}
