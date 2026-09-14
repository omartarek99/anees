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
  const { t, lang, dir } = useLanguage();
  const letters = lang === 'ar' ? ['أ', 'ب', 'ج', 'د'] : ['A', 'B', 'C', 'D'];
  // Cycles a handful of print-safe pastel tints across questions purely for visual
  // variety -- grade 5/6 age group, so the page reads as a fun activity sheet rather
  // than a plain exam.
  const tints = ['pw-tint-a', 'pw-tint-b', 'pw-tint-c', 'pw-tint-d'];

  return createPortal(
    <div className="printable-worksheet-portal" dir={dir}>
      <div className="printable-worksheet">
        <div className="printable-worksheet-watermark" aria-hidden>
          {t('brand')}
        </div>

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
