import { useId, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { CERT_PALETTES, type CertificateType } from '../lib/certificateTiers';

export type PrintableCertificateData = {
  recipientName: string;
  recipientRole: 'student' | 'teacher';
  title: string;
  titleAr?: string | null;
  message: string;
  messageAr?: string | null;
  type: CertificateType;
  issuedAt: string;
};

// A small curved flourish, reused in all four corners via CSS rotation (see
// .printable-certificate-corner-* in theme.css) -- drawn as a vector, not an emoji, so it
// renders identically everywhere: some emoji (e.g. the eagle previously used here) fall
// back to a generic glyph in Chrome's print pipeline even though they display fine on
// screen, the same class of print-only rendering gap already hit once in this app (see
// PrintableWorksheet.tsx's watermark comment) -- safer to just not depend on it at all.
function CornerFlourish({ light, dark }: { light: string; dark: string }) {
  return (
    <svg viewBox="0 0 60 60" width="44" height="44" aria-hidden="true">
      <path d="M4 40 Q4 4 40 4" fill="none" stroke={light} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="4" cy="40" r="3" fill={dark} />
      <circle cx="40" cy="4" r="3" fill={dark} />
    </svg>
  );
}

// Teacher certificates use a formal compass/medallion seal -- the same shape at every
// tier, only recolored, echoing a traditional award-plaque medallion.
function TeacherSeal({ light, dark }: { light: string; dark: string }) {
  const gradId = useId();
  return (
    <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke={dark} strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
      <g fill={`url(#${gradId})`}>
        <path d="M50 8 L57 43 L50 50 L43 43 Z" />
        <path d="M92 50 L57 57 L50 50 L57 43 Z" />
        <path d="M50 92 L43 57 L50 50 L57 57 Z" />
        <path d="M8 50 L43 43 L50 50 L43 57 Z" />
      </g>
      <g fill={dark} opacity="0.85">
        <path d="M50 22 L54 46 L50 50 L46 46 Z" transform="rotate(45 50 50)" />
        <path d="M50 22 L54 46 L50 50 L46 46 Z" transform="rotate(135 50 50)" />
        <path d="M50 22 L54 46 L50 50 L46 46 Z" transform="rotate(225 50 50)" />
        <path d="M50 22 L54 46 L50 50 L46 46 Z" transform="rotate(315 50 50)" />
      </g>
      <circle cx="50" cy="50" r="11" fill="#fff" stroke={dark} strokeWidth="1.5" />
      <circle cx="50" cy="50" r="4" fill={dark} />
    </svg>
  );
}

// Gear (bronze), sunburst (gold), and atom (platinum) -- a student certificate's seal icon
// changes with its tier, not just its color, so each tier reads as its own little emblem.
function GearIcon({ light, dark }: { light: string; dark: string }) {
  const teeth = Array.from({ length: 8 }, (_, i) => (
    <rect key={i} x="46" y="3" width="8" height="15" rx="2.5" fill={dark} transform={`rotate(${(360 / 8) * i} 50 50)`} />
  ));
  return (
    <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true">
      {teeth}
      <circle cx="50" cy="50" r="29" fill={light} stroke={dark} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="12" fill="#fff" stroke={dark} strokeWidth="2.5" />
    </svg>
  );
}
function SunIcon({ light, dark }: { light: string; dark: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => (
    <rect key={i} x="48" y="1" width="4" height="15" rx="2" fill={light} transform={`rotate(${(360 / 12) * i} 50 50)`} />
  ));
  return (
    <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true">
      {rays}
      <circle cx="50" cy="50" r="26" fill={dark} />
      <path
        d="M50 32 L55.5 45.5 L70 45.5 L58.5 54 L62.5 68 L50 59.5 L37.5 68 L41.5 54 L30 45.5 L44.5 45.5 Z"
        fill="#fff"
      />
    </svg>
  );
}
function AtomIcon({ light, dark }: { light: string; dark: string }) {
  return (
    <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true">
      <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke={light} strokeWidth="3" />
      <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke={light} strokeWidth="3" transform="rotate(60 50 50)" />
      <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke={light} strokeWidth="3" transform="rotate(120 50 50)" />
      <circle cx="50" cy="50" r="7" fill={dark} />
      <circle cx="92" cy="50" r="4.5" fill={dark} />
      <circle cx="29" cy="64" r="4.5" fill={dark} transform="rotate(60 50 50)" />
      <circle cx="29" cy="64" r="4.5" fill={dark} transform="rotate(120 50 50)" />
    </svg>
  );
}
function StudentSeal({ light, dark, type }: { light: string; dark: string; type: CertificateType }) {
  if (type === 'bronze') return <GearIcon light={light} dark={dark} />;
  if (type === 'platinum') return <AtomIcon light={light} dark={dark} />;
  return <SunIcon light={light} dark={dark} />;
}

/** Same portal + print-only pattern as PrintableWorksheet.tsx (see its comments for why):
 * renders as a sibling of #root so `@media print` (theme.css) can hide the app shell and
 * show only this, invisible on screen until the browser's print dialog opens. Prints on
 * its own landscape page (theme.css's `@page certificate`, opted into via the `page`
 * property) -- a certificate is conventionally wider than tall, unlike the worksheet's
 * portrait pages, and the two never print at the same time so the named page doesn't
 * affect the worksheet's own (default, portrait) page box. The whole color scheme (border,
 * heading, divider, corners, seal, signature) is driven by the certificate's tier -- set
 * as CSS custom properties here so theme.css's rules can stay tier-agnostic. */
export function PrintableCertificate({ data }: { data: PrintableCertificateData }) {
  const { t, lang, dir } = useLanguage();
  const palette = CERT_PALETTES[data.type];

  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><text x="120" y="130" font-size="30" font-weight="800" fill="${palette.dark}" fill-opacity="0.07" text-anchor="middle" transform="rotate(-24 120 120)" font-family="sans-serif">${t('brand')}</text></svg>`;
  const cardStyle = {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(watermarkSvg)}")`,
    '--cert-light': palette.light,
    '--cert-dark': palette.dark,
  } as CSSProperties;

  const title = pickText(lang, data.title, data.titleAr);
  const message = pickText(lang, data.message, data.messageAr);
  const dateLabel = new Date(data.issuedAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US');

  return createPortal(
    <div className="printable-certificate-portal" dir={dir}>
      <div className="printable-certificate" style={cardStyle}>
        <span className="printable-certificate-corner printable-certificate-corner-tl" aria-hidden>
          <CornerFlourish light={palette.light} dark={palette.dark} />
        </span>
        <span className="printable-certificate-corner printable-certificate-corner-tr" aria-hidden>
          <CornerFlourish light={palette.light} dark={palette.dark} />
        </span>
        <span className="printable-certificate-corner printable-certificate-corner-br" aria-hidden>
          <CornerFlourish light={palette.light} dark={palette.dark} />
        </span>
        <span className="printable-certificate-corner printable-certificate-corner-bl" aria-hidden>
          <CornerFlourish light={palette.light} dark={palette.dark} />
        </span>

        <img src="/icons/icon-192.png" alt="" className="printable-certificate-logo" />
        <p className="printable-certificate-brand">{t('brand')}</p>
        <h1 className="printable-certificate-heading">{t('certificate.heading')}</h1>
        <div className="printable-certificate-divider" aria-hidden />
        <p className="printable-certificate-presented">{t('certificate.presentedTo')}</p>
        <p className="printable-certificate-name">{data.recipientName}</p>
        <p className="printable-certificate-award-title">{title}</p>
        {message && <p className="printable-certificate-message">{message}</p>}

        <div className="printable-certificate-seal">
          {data.recipientRole === 'teacher' ? (
            <TeacherSeal light={palette.light} dark={palette.dark} />
          ) : (
            <StudentSeal light={palette.light} dark={palette.dark} type={data.type} />
          )}
        </div>

        <div className="printable-certificate-footer">
          <span className="printable-certificate-signature">{t('certificate.signatureLine')}</span>
          <span>
            {t('certificate.dateLabel')}: {dateLabel}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
