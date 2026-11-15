import { useEffect, useRef, useState } from 'react';

/** Keeps an element fixed at `top` px from the top of the window once the page has been scrolled past it, and in its place in the page before that.
 *  Unlike CSS `position: sticky` it does not depend on what surrounds the element (an ancestor with overflow, a different scroll container), so it
 *  holds in every browser and layout. Put `slotRef` on an empty wrapper around the element and `elRef` on the element itself, and give the element
 *  `pinStyle` plus the class `is-pinned` while `pinned` (the stylesheet makes that class `position: fixed`). The wrapper keeps the element's height so
 *  the page below does not jump. */
export function usePinned(top: number | (() => number)) {
  const slotRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ pinned: false, left: 0, width: 0, height: 0 });
  const topRef = useRef(top);
  topRef.current = top;

  useEffect(() => {
    const slot = slotRef.current;
    const el = elRef.current;
    if (!slot || !el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const limit = typeof topRef.current === 'function' ? topRef.current() : topRef.current;
      const r = slot.getBoundingClientRect();
      const pinned = r.top <= limit;
      const next = { pinned, left: Math.round(r.left), width: Math.round(r.width), height: Math.round(el.offsetHeight) };
      setState((s) => (s.pinned === next.pinned && s.left === next.left && s.width === next.width && s.height === next.height ? s : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(slot);
    ro.observe(el);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const pinStyle = state.pinned ? { left: state.left, width: state.width } : undefined;
  return { slotRef, elRef, pinned: state.pinned, pinStyle, height: state.height };
}
