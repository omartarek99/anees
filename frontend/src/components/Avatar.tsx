import { translate, type Lang } from '../lib/i18n';

const AVATAR_MAP: Record<string, { emoji: string; from: string; to: string }> = {
  falcon: { emoji: '🦅', from: '#8A1538', to: '#B23A5C' },
  astronaut: { emoji: '👨‍🚀', from: '#1565C0', to: '#5AA9E6' },
  knight: { emoji: '🛡️', from: '#5C0D20', to: '#8A1538' },
  athlete: { emoji: '⚽', from: '#2E7D4F', to: '#66BB86' },
  robot: { emoji: '🤖', from: '#616161', to: '#9E9E9E' },
  explorer: { emoji: '🧭', from: '#C9A24B', to: '#E8CD85' },
};

export const AVATAR_OPTIONS = Object.keys(AVATAR_MAP) as (keyof typeof AVATAR_MAP)[];

export function avatarLabel(key: string, lang: Lang = 'en'): string {
  const validKey = (AVATAR_MAP[key] ? key : 'falcon') as keyof typeof AVATAR_MAP;
  return translate(lang, `avatars.${validKey}`);
}

export function Avatar({ avatarKey, size = 48 }: { avatarKey: string; size?: number }) {
  const cfg = AVATAR_MAP[avatarKey] ?? AVATAR_MAP.falcon;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(150deg, ${cfg.from}, ${cfg.to})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.55,
        border: '2px solid var(--gold)',
        flexShrink: 0,
        boxShadow: `0 ${Math.max(3, size * 0.08)}px ${Math.max(6, size * 0.16)}px rgba(20,30,60,0.3), inset 0 ${Math.max(1, size * 0.05)}px ${Math.max(2, size * 0.08)}px rgba(255,255,255,0.45), inset 0 -${Math.max(1, size * 0.05)}px ${Math.max(3, size * 0.1)}px rgba(0,0,0,0.2)`,
      }}
      aria-hidden
    >
      {cfg.emoji}
    </div>
  );
}
