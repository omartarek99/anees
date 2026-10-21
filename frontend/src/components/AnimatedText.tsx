import { useEffect, useRef } from 'react';
import { animate, splitText, stagger } from 'animejs';
import { useLanguage } from '../lib/language-context';

/** Text with the "hello world" animation from the anime.js docs (animejs.com/documentation/animation):
 * each piece springs up with a bounce while it spins, staggered along the line. It loops, except for
 * visitors who ask for reduced motion: they get a single pass instead of a perpetual one.
 * Latin text is split into letters; Arabic into words, because its letters connect and a lone letter
 * would lose its joined form. splitText adds a visually-hidden copy of the text, so screen readers
 * still hear it once. The leap is in `em` so it scales with the heading it sits in. */
export function AnimatedText({ children }: { children: string }) {
  const { lang } = useLanguage();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const byWord = lang === 'ar';
    const split = splitText(el, byWord ? { words: true, chars: false } : { words: true, chars: true });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = animate(byWord ? split.words : split.chars, {
      // Property keyframes
      y: [
        { to: byWord ? '-0.8em' : '-1.1em', ease: 'outExpo', duration: 600 },
        { to: 0, ease: 'outBounce', duration: 800, delay: 100 },
      ],
      // Property specific parameters
      rotate: {
        from: byWord ? '-0.04turn' : '-1turn', // a whole word only tilts: its far edge swings much further than a letter's
        delay: 0,
      },
      delay: stagger(byWord ? 120 : 50),
      ease: 'inOutCirc',
      loopDelay: 1000,
      loop: !reduceMotion,
    });
    return () => {
      animation.revert();
      split.revert();
    };
  }, [children, lang]);

  // Keyed on the text so a change (new name, other language) mounts a fresh element for splitText.
  return (
    <span key={children} ref={ref}>
      {children}
    </span>
  );
}
