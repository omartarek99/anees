import { useLayoutEffect, useRef, useState } from 'react';

/** A bar that never moves with the page: it is fixed `top` px from the top of the window from the first moment, and the page scrolls underneath it.
 *  There is no scroll code at all (nothing to lag or to switch on late), and it does not depend on what surrounds it (CSS `position: sticky` does).
 *  Put `slotRef` on an empty wrapper where the bar belongs in the page and `barRef` on the bar itself; the bar is given `barStyle` (fixed, with the
 *  wrapper's left edge and width, so it lines up with the page) and the class `is-fixed`. The wrapper keeps the bar's height so nothing jumps. */
export function useFixedBar(top: number) {
  const slotRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, width: 0, height: 0, ready: false });

  // layout effect: measured before the first paint, so the bar never shows up in the wrong place for a frame
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const bar = barRef.current;
    if (!slot || !bar) return;
    const measure = () => {
      const r = slot.getBoundingClientRect();
      const next = { left: Math.round(r.left), width: Math.round(r.width), height: Math.round(bar.offsetHeight), ready: true };
      setBox((b) => (b.left === next.left && b.width === next.width && b.height === next.height && b.ready ? b : next));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(slot);
    ro.observe(bar);
    // the page can shift sideways without the bar's size changing (a scrollbar appearing, the sidebar settling, fonts loading): measure again then too
    ro.observe(document.documentElement);
    void document.fonts?.ready.then(measure);
    const timers = [120, 500, 1200].map((ms) => window.setTimeout(measure, ms));
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const barStyle = { position: 'fixed' as const, top, left: box.left, width: box.width || undefined, visibility: box.ready ? ('visible' as const) : ('hidden' as const) };
  return { slotRef, barRef, barStyle, height: box.height };
}
