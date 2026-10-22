import { translate, type Lang } from '../lib/i18n';
import { useLanguage } from '../lib/language-context';

const AVATAR_MAP: Record<string, { emoji: string; from: string; to: string }> = {
  falcon: { emoji: '🦅', from: '#8A1538', to: '#B23A5C' },
  astronaut: { emoji: '👨‍🚀', from: '#1565C0', to: '#5AA9E6' },
  knight: { emoji: '🛡️', from: '#5C0D20', to: '#8A1538' },
  athlete: { emoji: '⚽', from: '#2E7D4F', to: '#66BB86' },
  robot: { emoji: '🤖', from: '#616161', to: '#9E9E9E' },
  explorer: { emoji: '🧭', from: '#C9A24B', to: '#E8CD85' },
  // Teachers' default: a plain person silhouette, no emoji (drawn below, so `emoji` is unused).
  anonymous: { emoji: '', from: '#8F95A3', to: '#C4C8D2' },
};

// What a student can pick -- the anonymous silhouette is a default for teachers, not a choice.
export const AVATAR_OPTIONS = Object.keys(AVATAR_MAP).filter((k) => k !== 'anonymous') as (keyof typeof AVATAR_MAP)[];

export function avatarLabel(key: string, lang: Lang = 'en'): string {
  const validKey = (AVATAR_MAP[key] ? key : 'falcon') as keyof typeof AVATAR_MAP;
  return translate(lang, `avatars.${validKey}`);
}

// `photoUrl`, when set, shows an uploaded profile photo instead of the stylized emoji
// avatar -- same circular frame/border/shadow either way, so it drops in anywhere an
// Avatar already renders (profile page, reel author credit, ...) without new layout.
export function Avatar({ avatarKey, size = 48, photoUrl, square = false }: { avatarKey: string; size?: number; photoUrl?: string | null; square?: boolean }) {
  const { lang } = useLanguage();
  const cfg = AVATAR_MAP[avatarKey] ?? AVATAR_MAP.falcon;
  const radius = square ? Math.round(size * 0.14) : '50%';
  const shadow = `0 ${Math.max(3, size * 0.08)}px ${Math.max(6, size * 0.16)}px rgba(20,30,60,0.3), inset 0 ${Math.max(1, size * 0.05)}px ${Math.max(2, size * 0.08)}px rgba(255,255,255,0.45), inset 0 -${Math.max(1, size * 0.05)}px ${Math.max(3, size * 0.1)}px rgba(0,0,0,0.2)`;
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: 'cover',
          border: '2px solid var(--avatar-ring, var(--gold))',
          flexShrink: 0,
          boxShadow: shadow,
        }}
      />
    );
  }
  if (avatarKey === 'anonymous') {
    return (
      <div
        role="img"
        aria-label={avatarLabel('anonymous', lang)}
        title={avatarLabel('anonymous', lang)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: `linear-gradient(150deg, ${cfg.from}, ${cfg.to})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid var(--avatar-ring, var(--gold))',
          flexShrink: 0,
          boxShadow: shadow,
          overflow: 'hidden',
        }}
      >
        {/* Fills the whole circle: a large head, and shoulders that run out to the edge (the round
            frame clips them), like the standard "no photo" avatar. */}
        <svg viewBox="0 0 24 24" width={size} height={size} fill="#ffffff" aria-hidden="true" style={{ display: 'block' }}>
          <circle cx="12" cy="9" r="5" />
          <path d="M-2 26c0-7 5.4-10.4 14-10.4S26 19 26 26z" />
        </svg>
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(150deg, ${cfg.from}, ${cfg.to})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.55,
        border: '2px solid var(--avatar-ring, var(--gold))',
        flexShrink: 0,
        boxShadow: shadow,
      }}
      aria-hidden
    >
      {cfg.emoji}
    </div>
  );
}
