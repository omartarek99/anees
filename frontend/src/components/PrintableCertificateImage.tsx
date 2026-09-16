import { createPortal } from 'react-dom';

/** Prints a single certificate image full-page -- same portal + print-only pattern as
 * PrintableWorksheet.tsx (see its comments for why): renders as a sibling of #root so
 * `@media print` (theme.css) can hide the app shell and show only this. Reuses the
 * `.printable-certificate-portal` class the shared print toggle already targets (left over
 * from an earlier, code-drawn certificate design) rather than adding a new one. */
export function PrintableCertificateImage({ imageUrl, title }: { imageUrl: string; title: string }) {
  return createPortal(
    <div className="printable-certificate-portal">
      <img src={imageUrl} alt={title} className="printable-certificate-image" />
    </div>,
    document.body
  );
}
