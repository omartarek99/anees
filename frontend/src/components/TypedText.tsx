import { useEffect, useMemo, useState } from 'react';

const STEP_MS = 55; // between two letters
const COMMA_MS = 280; // the pause after a comma
const START_MS = 400;

/** Text that types itself out, one letter at a time, behind a caret that blinks a few times once it is done.
 * The letters not typed yet stay on the page, invisible, so the line breaks never move while it types. They are
 * counted as grapheme clusters, so Arabic letters keep their marks and join up as the word grows. Visitors who
 * ask for reduced motion get the finished text at once. Screen readers hear the whole text once, up front. */
export function TypedText({ children: text }: { children: string }) {
  const chars = useMemo(() => Array.from(new Intl.Segmenter().segment(text), (s) => s.segment), [text]);
  const still = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  // Remembering which text the count belongs to restarts it when the text changes, with no frame of the old count.
  const [typed, setTyped] = useState({ text, n: 0 });
  const n = still ? chars.length : typed.text === text ? typed.n : 0;

  useEffect(() => {
    if (n >= chars.length) return;
    const wait = n === 0 ? START_MS : /[,،]/.test(chars[n - 1]) ? COMMA_MS : STEP_MS;
    const id = setTimeout(() => setTyped({ text, n: n + 1 }), wait);
    return () => clearTimeout(id);
  }, [text, n, chars]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {chars.slice(0, n).join('')}
        {!still && <span className={n >= chars.length ? 'typed-caret typed-caret--done' : 'typed-caret'} />}
        <span className="typed-rest">{chars.slice(n).join('')}</span>
      </span>
    </>
  );
}
