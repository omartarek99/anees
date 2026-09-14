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
  questions,
}: {
  subjectLabel: string;
  subjectIcon: string;
  difficultyLabel: string;
  questions: PrintableQuestion[];
}) {
  const { t, lang, dir } = useLanguage();
  const letters = lang === 'ar' ? ['أ', 'ب', 'ج', 'د'] : ['A', 'B', 'C', 'D'];

  return createPortal(
    <div className="printable-worksheet-portal" dir={dir}>
      <div className="printable-worksheet">
        <div className="printable-worksheet-corner printable-worksheet-corner-start" aria-hidden />
        <div className="printable-worksheet-corner printable-worksheet-corner-end" aria-hidden />

        <header className="printable-worksheet-header">
          <img src="/icons/icon-192.png" alt="" className="printable-worksheet-logo" />
          <div>
            <h1>{t('brand')}</h1>
            <p>
              {subjectIcon} {subjectLabel} — {difficultyLabel}
            </p>
          </div>
        </header>

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
            <li key={q.id}>
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

        <footer className="printable-worksheet-footer">{t('brand')}</footer>
      </div>
    </div>,
    document.body
  );
}
