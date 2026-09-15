import { createPortal } from 'react-dom';
import { useLanguage } from '../lib/language-context';

export type PrintableQuestion = { id: number; text: string; choices: string[] };

/** Renders into a portal on document.body (a sibling of #root, not nested inside the app
 * shell) so `@media print` (theme.css) can hide #root entirely and show only this --
 * no need to fight the sidebar/topbar/app-shell's own layout to hide them piece by piece.
 * Always mounted whenever a worksheet exists; invisible on screen (`.printable-worksheet-
 * portal` is display:none outside of print) until the browser's print dialog opens. */
export function PrintableWorksheet({
  subjectLabel,
  subjectIcon,
  difficultyLabel,
  difficultyIcon,
  questions,
}: {
  subjectLabel: string;
  subjectIcon: string;
  difficultyLabel: string;
  difficultyIcon: string;
  questions: PrintableQuestion[];
}) {
  const { t, dir } = useLanguage();
  // Always Latin letters, even in the Arabic layout -- A/B/C/D is how a multiple-choice
  // worksheet is conventionally lettered for this age group either way.
  const letters = ['A', 'B', 'C', 'D'];
  // Cycles a handful of print-safe pastel tints across questions purely for visual
  // variety -- grade 5/6 age group, so the page reads as a fun activity sheet rather
  // than a plain exam.
  const tints = ['pw-tint-a', 'pw-tint-b', 'pw-tint-c', 'pw-tint-d'];

  // The watermark is a *tiling background image*, not a positioned DOM element -- Chrome's
  // print/PDF engine doesn't reliably repeat position:fixed content across pages (a real,
  // longstanding limitation despite what the paged-media spec calls for), so a single
  // watermark element only ever showed up once, clipped wherever it happened to land in
  // the whole multi-page flow. A background-image tile has no such problem: each page
  // simply paints the portion of the infinitely-repeating pattern that falls inside it,
  // the same ordinary way backgrounds always work, page breaks or not.
  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><text x="120" y="130" font-size="30" font-weight="800" fill="#8a1538" fill-opacity="0.09" text-anchor="middle" transform="rotate(-24 120 120)" font-family="sans-serif">${t('brand')}</text></svg>`;
  const watermarkStyle = { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(watermarkSvg)}")` };

  return createPortal(
    <div className="printable-worksheet-portal" dir={dir}>
      <div className="printable-worksheet" style={watermarkStyle}>
        <header className="printable-worksheet-header">
          <img src="/icons/icon-192.png" alt="" className="printable-worksheet-logo" />
          <div>
            <h1>
              {t('brand')} <span aria-hidden>🦅</span>
            </h1>
            <p>
              {subjectIcon} {subjectLabel} — {difficultyIcon} {difficultyLabel}
            </p>
          </div>
        </header>

        <p className="printable-worksheet-tagline">{t('worksheets.printTagline')}</p>

        <div className="printable-worksheet-fields">
          <span>
            {t('worksheets.printName')}: <i />
          </span>
          <span>
            {t('worksheets.printDate')}: <i />
          </span>
        </div>

        <ol className="printable-worksheet-questions">
          {questions.map((q, i) => (
            <li key={q.id} className={tints[i % tints.length]}>
              <p>{q.text}</p>
              <ul>
                {q.choices.map((choice, ci) => (
                  <li key={ci}>
                    <span className="printable-worksheet-choice-box">{letters[ci]}</span>
                    {choice}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <div className="printable-worksheet-checkout">
          <div className="printable-worksheet-score">
            <span aria-hidden>⭐</span>
            {t('worksheets.printScoreLabel')} <i />/ {questions.length}
          </div>
          <div className="printable-worksheet-mood">
            <span>{t('worksheets.printMoodQuestion')}</span>
            <span className="printable-worksheet-mood-faces" aria-hidden>
              😄 😐 😕
            </span>
          </div>
        </div>

        <footer className="printable-worksheet-footer">{t('brand')}</footer>
      </div>
    </div>,
    document.body
  );
}
