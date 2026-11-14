import { useState } from 'react';
import { useLanguage } from '../lib/language-context';
import { choiceLabel } from '../lib/bidi';
import { QText } from './QText';
import type { QuizQuestion } from './QuizCard';

export type ReelQuizQuestion = QuizQuestion & { format?: 'choice' | 'match' };
export type ReelQuizAnswer = { questionId: number; choiceIndex: number } | { questionId: number; matchIndex: number };

// A reel's quiz in two styles (the server decides which question is which, backend/src/routes/reels.ts matchSet):
// - multiple choice: the answers as lettered tiles, two a row;
// - matching: the questions in a column and their answers in a pool below; pick a question, then the answer that goes with it
//   (or the answer first, then the question). Each answer goes with one question; giving it to another moves it there.
export function ReelQuiz({
  questions,
  matchPool,
  onSubmit,
  submitting,
}: {
  questions: ReelQuizQuestion[];
  matchPool: string[];
  onSubmit: (answers: ReelQuizAnswer[]) => void;
  submitting: boolean;
}) {
  const { t, lang } = useLanguage();
  const choice = questions.filter((q) => q.format !== 'match');
  const match = questions.filter((q) => q.format === 'match');
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [paired, setPaired] = useState<Record<number, number>>({}); // question id -> pool index
  const [pickedQ, setPickedQ] = useState<number | null>(null);
  const [pickedA, setPickedA] = useState<number | null>(null);

  const pair = (qid: number, ai: number) => {
    setPaired((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([, a]) => a !== ai));
      return { ...next, [qid]: ai };
    });
    setPickedQ(null);
    setPickedA(null);
  };
  const tapQuestion = (qid: number) => (pickedA !== null ? pair(qid, pickedA) : setPickedQ(pickedQ === qid ? null : qid));
  const tapAnswer = (ai: number) => (pickedQ !== null ? pair(pickedQ, ai) : setPickedA(pickedA === ai ? null : ai));
  const numberOf = (qid: number) => match.findIndex((q) => q.id === qid) + 1;

  const done = choice.every((q) => chosen[q.id] !== undefined) && match.every((q) => paired[q.id] !== undefined);
  const submit = () =>
    onSubmit([
      ...choice.map((q) => ({ questionId: q.id, choiceIndex: chosen[q.id] })),
      ...match.map((q) => ({ questionId: q.id, matchIndex: paired[q.id] })),
    ]);

  return (
    <div className="stack rq">
      {choice.map((q) => (
        <section key={q.id} className="card rq-card">
          <p className="rq-kind">{t('quiz.kindChoice')}</p>
          <p className="quiz-q">
            <QText text={q.text} />
          </p>
          <div className="rq-tiles">
            {q.choices.map((c, ci) => (
              <button
                key={ci}
                type="button"
                aria-pressed={chosen[q.id] === ci}
                className={`rq-tile${chosen[q.id] === ci ? ' is-on' : ''}`}
                onClick={() => setChosen((prev) => ({ ...prev, [q.id]: ci }))}
              >
                <span className="rq-letter">{choiceLabel(ci, lang)}</span>
                <span className="quiz-choice-text">
                  <QText text={c} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {match.length > 0 && (
        <section className="card rq-card">
          <p className="rq-kind">{t('quiz.kindMatch')}</p>
          <p className="muted" style={{ fontSize: 14, margin: '0 0 10px' }}>
            {t('quiz.matchHint')}
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {match.map((q, i) => {
              const a = paired[q.id];
              return (
                <button
                  key={q.id}
                  type="button"
                  aria-pressed={pickedQ === q.id}
                  className={`rq-match-q${pickedQ === q.id ? ' is-picked' : ''}${a !== undefined ? ' is-paired' : ''}`}
                  onClick={() => tapQuestion(q.id)}
                >
                  <span className="rq-num">{i + 1}</span>
                  <span className="rq-match-text">
                    <QText text={q.text} />
                    <span className="rq-match-slot">{a !== undefined ? <QText text={matchPool[a]} /> : t('quiz.matchEmpty')}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rq-pool">
            {matchPool.map((text, ai) => {
              const owner = Object.entries(paired).find(([, x]) => x === ai)?.[0];
              return (
                <button
                  key={ai}
                  type="button"
                  aria-pressed={pickedA === ai}
                  className={`rq-chip${pickedA === ai ? ' is-picked' : ''}${owner ? ' is-used' : ''}`}
                  onClick={() => tapAnswer(ai)}
                >
                  {owner && <span className="rq-num rq-num-sm">{numberOf(Number(owner))}</span>}
                  <QText text={text} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <button className="btn btn-primary btn-block" disabled={!done || submitting} onClick={submit}>
        {submitting ? t('quiz.checking') : t('quiz.submit')}
      </button>
    </div>
  );
}
