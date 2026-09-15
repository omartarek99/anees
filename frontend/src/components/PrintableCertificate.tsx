import { useId } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';

export type PrintableCertificateData = {
  recipientName: string;
  title: string;
  titleAr?: string | null;
  message: string;
  messageAr?: string | null;
  issuedAt: string;
};

// A small curved flourish, reused in all four corners via CSS rotation (see
// .printable-certificate-corner-* in theme.css) -- drawn as a vector, not an emoji, so it
// renders identically everywhere: some emoji (e.g. the eagle previously used here) fall
// back to a generic glyph in Chrome's print pipeline even though they display fine on
// screen, the same class of print-only rendering gap already hit once in this app (see
// PrintableWorksheet.tsx's watermark comment) -- safer to just not depend on it at all.
function CornerFlourish() {
  return (
    <svg viewBox="0 0 60 60" width="44" height="44" aria-hidden="true">
      <path d="M4 40 Q4 4 40 4" fill="none" stroke="#f0a83a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="4" cy="40" r="3" fill="#8a1538" />
      <circle cx="40" cy="4" r="3" fill="#8a1538" />
    </svg>
  );
}

// A medal/seal badge for the footer, same reasoning as CornerFlourish above -- a drawn
// vector instead of an emoji, guaranteed to render the same in the printed page as on
// screen.
function CertificateSeal() {
  const gradId = useId();
  return (
    <svg viewBox="0 0 100 118" width="64" height="76" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0c96a" />
          <stop offset="100%" stopColor="#c22954" />
        </linearGradient>
      </defs>
      <path d="M35 66 L26 112 L50 98 L74 112 L65 66 Z" fill="#8a1538" />
      <circle cx="50" cy="42" r="37" fill={`url(#${gradId})`} stroke="#8a1538" strokeWidth="2" />
      <circle cx="50" cy="42" r="29" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.85" />
      <path
        d="M50 23 L54.7 36.5 L69 36.5 L57.5 44.8 L61.8 58.5 L50 50 L38.2 58.5 L42.5 44.8 L31 36.5 L45.3 36.5 Z"
        fill="#fff"
      />
    </svg>
  );
}

/** Same portal + print-only pattern as PrintableWorksheet.tsx (see its comments for why):
 * renders as a sibling of #root so `@media print` (theme.css) can hide the app shell and
 * show only this, invisible on screen until the browser's print dialog opens. Prints on
 * its own landscape page (theme.css's `@page certificate`, opted into via the `page`
 * property) -- a certificate is conventionally wider than tall, unlike the worksheet's
 * portrait pages, and the two never print at the same time so the named page doesn't
 * affect the worksheet's own (default, portrait) page box. */
export function PrintableCertificate({ data }: { data: PrintableCertificateData }) {
  const { t, lang, dir } = useLanguage();

  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><text x="120" y="130" font-size="30" font-weight="800" fill="#8a1538" fill-opacity="0.07" text-anchor="middle" transform="rotate(-24 120 120)" font-family="sans-serif">${t('brand')}</text></svg>`;
  const watermarkStyle = { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(watermarkSvg)}")` };

  const title = pickText(lang, data.title, data.titleAr);
  const message = pickText(lang, data.message, data.messageAr);
  const dateLabel = new Date(data.issuedAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US');

  return createPortal(
    <div className="printable-certificate-portal" dir={dir}>
      <div className="printable-certificate" style={watermarkStyle}>
        <span className="printable-certificate-corner printable-certificate-corner-tl" aria-hidden>
          <CornerFlourish />
        </span>
        <span className="printable-certificate-corner printable-certificate-corner-tr" aria-hidden>
          <CornerFlourish />
        </span>
        <span className="printable-certificate-corner printable-certificate-corner-br" aria-hidden>
          <CornerFlourish />
        </span>
        <span className="printable-certificate-corner printable-certificate-corner-bl" aria-hidden>
          <CornerFlourish />
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
          <CertificateSeal />
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
