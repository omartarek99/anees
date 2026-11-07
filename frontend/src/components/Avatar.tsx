import { translate, type Lang } from '../lib/i18n';
import { useLanguage } from '../lib/language-context';

// The pictures a student can pick (public/images/avatars/<key>.webp: round cut-outs, white inside the circle,
// transparent outside). Order = the order in the picker. The first is everyone's default.
export const AVATAR_OPTIONS = ['owl', 'astronaut', 'qatariBoy', 'qatariGirl', 'scientist', 'pilot', 'wizard', 'robot'] as const;
const PICTURES = new Set<string>(AVATAR_OPTIONS);

// Teachers' default is 'anonymous' (a plain silhouette, drawn below). Anything else unknown (an old key) shows the default picture.
function pictureKey(key: string): string {
  return PICTURES.has(key) ? key : AVATAR_OPTIONS[0];
}

export function avatarLabel(key: string, lang: Lang = 'en'): string {
  return translate(lang, `avatars.${key === 'anonymous' ? key : pictureKey(key)}`);
}

// `photoUrl`, when set, shows an uploaded profile photo instead of the picture -- same frame/border/shadow
// either way, so it drops in anywhere an Avatar already renders.
export function Avatar({ avatarKey, size = 48, photoUrl, square = false }: { avatarKey: string; size?: number; photoUrl?: string | null; square?: boolean }) {
  const { lang } = useLanguage();
  const frame = {
    width: size,
    height: size,
    borderRadius: square ? Math.round(size * 0.14) : '50%',
    border: '2px solid var(--avatar-ring, var(--gold))',
    flexShrink: 0,
    boxShadow: `0 ${Math.max(3, size * 0.08)}px ${Math.max(6, size * 0.16)}px rgba(20,30,60,0.3)`,
    overflow: 'hidden',
  } as const;
  if (photoUrl) {
    return <img src={photoUrl} alt="" aria-hidden style={{ ...frame, objectFit: 'cover' }} />;
  }
  if (avatarKey === 'anonymous') {
    return (
      <div
        role="img"
        aria-label={avatarLabel('anonymous', lang)}
        title={avatarLabel('anonymous', lang)}
        style={{ ...frame, background: 'linear-gradient(150deg, #8F95A3, #C4C8D2)' }}
      >
        {/* Fills the whole circle: a large head, and shoulders that run out to the edge (the round
            frame clips them), like the standard "no photo" avatar. */}
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="#ffffff" aria-hidden="true" style={{ display: 'block' }}>
          <circle cx="12" cy="9" r="5" />
          <path d="M-2 26c0-7 5.4-10.4 14-10.4S26 19 26 26z" />
        </svg>
      </div>
    );
  }
  // White behind the picture, so a square frame's corners match the white inside the circle.
  return (
    <img
      src={`/images/avatars/${pictureKey(avatarKey)}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      style={{ ...frame, objectFit: 'cover', background: '#fff' }}
    />
  );
}
