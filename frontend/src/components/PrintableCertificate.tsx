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

/** Same portal + print-only pattern as PrintableWorksheet.tsx (see its comments for why):
 * renders as a sibling of #root so `@media print` (theme.css) can hide the app shell and
 * show only this, invisible on screen until the browser's print dialog opens. */
export function PrintableCertificate({ data }: { data: PrintableCertificateData }) {
  const { t, lang, dir } = useLanguage();

  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><text x="120" y="130" font-size="30" font-weight="800" fill="#8a1538" fill-opacity="0.08" text-anchor="middle" transform="rotate(-24 120 120)" font-family="sans-serif">${t('brand')}</text></svg>`;
  const watermarkStyle = { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(watermarkSvg)}")` };

  const title = pickText(lang, data.title, data.titleAr);
  const message = pickText(lang, data.message, data.messageAr);
  const dateLabel = new Date(data.issuedAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US');

  return createPortal(
    <div className="printable-certificate-portal" dir={dir}>
      <div className="printable-certificate" style={watermarkStyle}>
        <img src="/icons/icon-192.png" alt="" className="printable-certificate-logo" />
        <p className="printable-certificate-brand">
          {t('brand')} 🦅
        </p>
        <h1 className="printable-certificate-heading">{t('certificate.heading')}</h1>
        <p className="printable-certificate-presented">{t('certificate.presentedTo')}</p>
        <p className="printable-certificate-name">{data.recipientName}</p>
        <p className="printable-certificate-award-title">{title}</p>
        {message && <p className="printable-certificate-message">{message}</p>}
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
