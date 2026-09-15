import { useId, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { CERT_PALETTES, CERT_TYPE_LABEL_KEY, type CertificateType } from '../lib/certificateTiers';

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

// Gear cluster (bronze), orrery (gold), and atom + crystals (platinum) -- a student
// certificate's seal icon changes with its tier, not just its color, so each tier reads
// as its own little emblem (mechanical / celestial / crystalline, echoing the reference
// plaques this design was modeled on) rather than a single reused medal shape.
function GearIcon({ light, dark }: { light: string; dark: string }) {
  const bigTeeth = Array.from({ length: 8 }, (_, i) => (
    <rect key={i} x="46" y="2" width="8" height="14" rx="2.5" fill={dark} transform={`rotate(${(360 / 8) * i} 50 40)`} />
  ));
  const smallTeeth = Array.from({ length: 6 }, (_, i) => (
    <rect key={`s${i}`} x="73.5" y="61" width="5" height="9" rx="1.5" fill={light} transform={`rotate(${(360 / 6) * i} 76 68)`} />
  ));
  return (
    <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true">
      {bigTeeth}
      <circle cx="50" cy="40" r="25" fill={light} stroke={dark} strokeWidth="2.5" />
      <circle cx="50" cy="40" r="9" fill="#fff" stroke={dark} strokeWidth="2.5" />
      {smallTeeth}
      <circle cx="76" cy="68" r="12" fill={dark} stroke={light} strokeWidth="2" />
      <circle cx="76" cy="68" r="4.5" fill="#fff" />
    </svg>
  );
}
function SunIcon({ light, dark }: { light: string; dark: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => (
    <rect key={i} x="48" y="1" width="4" height="12" rx="2" fill={light} transform={`rotate(${(360 / 12) * i} 50 50)`} />
  ));
  const planets = [
    { angle: 20, r: 3.5 },
    { angle: 140, r: 3 },
    { angle: 250, r: 4 },
  ];
  return (
    <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="none" stroke={light} strokeWidth="1.2" opacity="0.6" />
      <circle cx="50" cy="50" r="36" fill="none" stroke={dark} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
      {rays}
      <circle cx="50" cy="50" r="21" fill={dark} />
      <path
        d="M50 36 L54 46 L64 46 L56 52 L59 62 L50 56 L41 62 L44 52 L36 46 L46 46 Z"
        fill="#fff"
      />
      {planets.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const cx = 50 + 44 * Math.cos(rad);
        const cy = 50 + 44 * Math.sin(rad);
        return <circle key={i} cx={cx} cy={cy} r={p.r} fill={dark} stroke={light} strokeWidth="1" />;
      })}
    </svg>
  );
}
function AtomIcon({ light, dark }: { light: string; dark: string }) {
  return (
    <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true">
      <ellipse cx="50" cy="44" rx="40" ry="15" fill="none" stroke={light} strokeWidth="3" />
      <ellipse cx="50" cy="44" rx="40" ry="15" fill="none" stroke={light} strokeWidth="3" transform="rotate(60 50 44)" />
      <ellipse cx="50" cy="44" rx="40" ry="15" fill="none" stroke={light} strokeWidth="3" transform="rotate(120 50 44)" />
      <circle cx="50" cy="44" r="7" fill={dark} />
      <circle cx="90" cy="44" r="4" fill={dark} />
      <circle cx="30" cy="57" r="4" fill={dark} transform="rotate(60 50 44)" />
      <circle cx="30" cy="57" r="4" fill={dark} transform="rotate(120 50 44)" />
      <path d="M37 88 L41.5 74 L46 88 Z" fill={light} stroke={dark} strokeWidth="1" />
      <path d="M47.5 92 L53 70 L58.5 92 Z" fill={dark} stroke={dark} strokeWidth="1" opacity="0.9" />
      <path d="M59 88 L63.5 76 L68 88 Z" fill={light} stroke={dark} strokeWidth="1" />
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
 * show only this, invisible on screen until the browser's print dialog opens. Prints
 * landscape -- a certificate is conventionally wider than tall, unlike the worksheet's
 * portrait pages -- via ProfilePage.tsx's print trigger injecting a temporary `@page`
 * style around the print call rather than page CSS here (a CSS named page turned out not
 * to reliably drive Chrome's actual print orientation, see ProfilePage.tsx's comment).
 *
 * The card's double border is two nested elements, not a single CSS `border` -- an outer
 * one (the tier gradient) slightly larger than an inner one (the white/watermarked panel
 * with all the actual content), the size difference reading as a frame all the way around.
 * The whole color scheme (frame, heading, divider, seal, signature) is driven by the
 * certificate's tier -- set as CSS custom properties here so theme.css's rules can stay
 * tier-agnostic. */
export function PrintableCertificate({ data }: { data: PrintableCertificateData }) {
  const { t, lang, dir } = useLanguage();
  const palette = CERT_PALETTES[data.type];

  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><text x="120" y="130" font-size="30" font-weight="800" fill="${palette.dark}" fill-opacity="0.07" text-anchor="middle" transform="rotate(-24 120 120)" font-family="sans-serif">${t('brand')}</text></svg>`;
  const frameStyle = {
    '--cert-light': palette.light,
    '--cert-dark': palette.dark,
  } as CSSProperties;
  const panelStyle: CSSProperties = {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(watermarkSvg)}")`,
  };

  const title = pickText(lang, data.title, data.titleAr);
  const message = pickText(lang, data.message, data.messageAr);
  const dateLabel = new Date(data.issuedAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US');

  return createPortal(
    <div className="printable-certificate-portal" dir={dir}>
      <div className="printable-certificate" style={frameStyle}>
        <div className="printable-certificate-panel" style={panelStyle}>
          <span className="printable-certificate-corner printable-certificate-corner-tl" aria-hidden>
            <CornerFlourish light={palette.light} dark={palette.dark} />
          </span>
          <span className="printable-certificate-corner printable-certificate-corner-tr" aria-hidden>
            <CornerFlourish light={palette.light} dark={palette.dark} />
          </span>
          <span className="printable-certificate-corner printable-certificate-corner-bl" aria-hidden>
            <CornerFlourish light={palette.light} dark={palette.dark} />
          </span>
          <span className="printable-certificate-corner printable-certificate-corner-br" aria-hidden>
            <CornerFlourish light={palette.light} dark={palette.dark} />
          </span>

          <img src="/icons/icon-192.png" alt="" className="printable-certificate-logo" />
          <p className="printable-certificate-brand">{t('brand')}</p>
          <span className="printable-certificate-tier-badge">{t(CERT_TYPE_LABEL_KEY[data.type])}</span>
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
      </div>
    </div>,
    document.body
  );
}
