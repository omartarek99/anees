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

// Bronze and platinum student certificates render an admin-supplied plaque photo verbatim
// (PrintableCertificate.tsx) instead of the drawn shield -- those photos are portrait, so
// they print on the page's natural default orientation. Every other combination (gold at
// any role, any tier for a teacher) still uses the drawn landscape shield. Shared between
// PrintableCertificate.tsx (which template to render) and ProfilePage.tsx's print trigger
// (whether to force landscape before calling window.print()) so the two can't drift apart.
export function usesCertificatePhotoTemplate(type: CertificateType, role: 'student' | 'teacher'): boolean {
  return role === 'student' && (type === 'bronze' || type === 'platinum');
}
