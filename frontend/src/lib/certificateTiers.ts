export type CertificateType = 'bronze' | 'gold' | 'platinum';

// Drives both the admin composer's tier picker and the printed certificate's whole color
// scheme (PrintableCertificate.tsx) -- same two-tone-per-tier idea as lib/ranks.ts on the
// backend (whose bronze/gold/platinum values these mirror), kept as its own small module
// since the admin panel and the printable component are otherwise unrelated.
export const CERT_TYPES: CertificateType[] = ['bronze', 'gold', 'platinum'];

// `ink` is the text colour for pills/badges filled with the light->dark gradient (white text on
// these pastel tones was ~1.6:1).
export const CERT_PALETTES: Record<CertificateType, { light: string; dark: string; ink: string }> = {
  bronze: { light: '#c88355', dark: '#8a5a35', ink: '#1f0f03' },
  gold: { light: '#f0c96a', dark: '#c9971f', ink: '#2e2000' },
  platinum: { light: '#7fd8cf', dark: '#379e93', ink: '#03221f' },
};

// Fill for pills/badges: stops short of the dark end so the dark `ink` text stays >= ~4.5:1.
export function certPillBackground(type: CertificateType): string {
  const p = CERT_PALETTES[type];
  return `linear-gradient(135deg, ${p.light}, color-mix(in srgb, ${p.light} 55%, ${p.dark}))`;
}

// Shared by the admin composer's tier picker, the profile card badge, and the printed
// certificate's own tier label -- one map instead of three copies drifting apart.
export const CERT_TYPE_LABEL_KEY: Record<CertificateType, 'admin.certTypeBronze' | 'admin.certTypeGold' | 'admin.certTypePlatinum'> = {
  bronze: 'admin.certTypeBronze',
  gold: 'admin.certTypeGold',
  platinum: 'admin.certTypePlatinum',
};
