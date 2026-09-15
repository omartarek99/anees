export type CertificateType = 'bronze' | 'gold' | 'platinum';

// Drives both the admin composer's tier picker and the printed certificate's whole color
// scheme (PrintableCertificate.tsx) -- same two-tone-per-tier idea as lib/ranks.ts on the
// backend (whose bronze/gold/platinum values these mirror), kept as its own small module
// since the admin panel and the printable component are otherwise unrelated.
export const CERT_TYPES: CertificateType[] = ['bronze', 'gold', 'platinum'];

export const CERT_PALETTES: Record<CertificateType, { light: string; dark: string }> = {
  bronze: { light: '#c88355', dark: '#8a5a35' },
  gold: { light: '#f0c96a', dark: '#c9971f' },
  platinum: { light: '#7fd8cf', dark: '#379e93' },
};

// Shared by the admin composer's tier picker, the profile card badge, and the printed
// certificate's own tier label -- one map instead of three copies drifting apart.
export const CERT_TYPE_LABEL_KEY: Record<CertificateType, 'admin.certTypeBronze' | 'admin.certTypeGold' | 'admin.certTypePlatinum'> = {
  bronze: 'admin.certTypeBronze',
  gold: 'admin.certTypeGold',
  platinum: 'admin.certTypePlatinum',
};
