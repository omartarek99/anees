import { QFigure } from './QFigure';
import { createPortal } from 'react-dom';
import { useLanguage } from '../lib/language-context';
import { choiceLabel } from '../lib/bidi';
import { QText } from './QText';

/** Every worksheet is marked out of 20, whatever the number of questions. */
const WORKSHEET_TOTAL = 20;

type PrintableQuestion = { id: number; text: string; choices: string[]; image?: string | null };

/** Renders into a portal on document.body (a sibling of #root, not nested inside the app
 * shell) so `@media print` (theme.css) can hide #root entirely and show only this --
 * no need to fight the sidebar/topbar/app-shell's own layout to hide them piece by piece.
 * Always mounted whenever a worksheet exists; invisible on screen (`.printable-worksheet-
 * portal` is display:none outside of print) until the browser's print dialog opens. */
export function PrintableWorksheet({
  subjectName,
  topic,
  gradeLabel,
  questions,
}: {
  subjectName: string;
  /** The lesson / video the worksheet is about */
  topic?: string;
  gradeLabel?: string;
  questions: PrintableQuestion[];
}) {
  const { t, dir, lang } = useLanguage();
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
      <div className="pw-page-border" aria-hidden />
      <div className="printable-worksheet" style={watermarkStyle}>
      <table className="pw-frame pw-frame-cover">
        <thead><tr><td><div className="pw-spacer" /></td></tr></thead>
        <tfoot><tr><td><div className="pw-spacer" /></td></tr></tfoot>
        <tbody><tr><td>
        <section className="pw-cover">
          <div className="pw-cover-brand">
            <img src="/icons/logo-mark.png" alt="" className="pw-cover-logo" />
            <h1>{t('brand')}</h1>
          </div>
          <div className="pw-cover-main">
            <p className="pw-cover-kind">{t('worksheets.printCoverTitle')}</p>
            <h2 className="pw-cover-subject">{subjectName}</h2>
            {topic && (
              <p className="pw-cover-topic">
                <span>{t('worksheets.printTopicLabel')}</span> {topic}
              </p>
            )}
            {gradeLabel && <p className="pw-cover-grade">{gradeLabel}</p>}
          </div>
          <div className="pw-cover-mark-wrap">
            <div className="pw-cover-mark">
              <div className="pw-cover-mark-body" dir="ltr">
                <span className="pw-cover-mark-blank" />
                <span className="pw-cover-mark-total">{WORKSHEET_TOTAL}</span>
              </div>
            </div>
          </div>
          <div className="printable-worksheet-fields">
            <span>
              {t('worksheets.printName')}: <i />
            </span>
            <span>
              {t('worksheets.printClass')}: <i />
            </span>
            <span>
              {t('worksheets.printDate')}: <i />
            </span>
          </div>
          <div className="pw-cover-instructions">
            <h3>{t('worksheets.printInstructionsTitle')}</h3>
            <ul>
              <li>{t('worksheets.printInstr1')}</li>
              <li>{t('worksheets.printInstr2')}</li>
              <li>{t('worksheets.printInstr3')}</li>
            </ul>
          </div>
        </section>

        </td></tr></tbody>
      </table>

      <table className="pw-frame">
        <thead>
          <tr><td>
            <div className="pw-spacer" />
            <header className="pw-running-header">
              <span className="pw-running-brand">
                <img src="/icons/logo-mark.png" alt="" />
                {t('brand')}
              </span>
              <span>
                {subjectName}
                {topic ? ` · ${topic}` : ''}
              </span>
            </header>
          </td></tr>
        </thead>
        <tfoot><tr><td><div className="pw-spacer" /></td></tr></tfoot>
        <tbody><tr><td>

        <ol className="printable-worksheet-questions">
          {questions.map((q, i) => (
            <li key={q.id} className={tints[i % tints.length]}>
              <p className="quiz-q">
                <QText text={q.text} />
              </p>
              <QFigure image={q.image} />
              <ul>
                {q.choices.map((choice, ci) => (
                  <li key={ci}>
                    <span className="printable-worksheet-choice-box">{choiceLabel(ci, lang)}</span>
                    <span className="quiz-choice-text">
<QText text={choice} />
</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <footer className="printable-worksheet-footer">{t('brand')}</footer>
        </td></tr></tbody>
      </table>
      </div>
    </div>,
    document.body
  );
}
