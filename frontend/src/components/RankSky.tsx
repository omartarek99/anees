import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { RANK_SKY_STOPS, rankSky } from '../lib/sky/rankSkies';

// A rank's page background: an animated sky (the gradient engine's SKY type, lib/sky/skyEngine.ts) behind the whole signed-in app, under
// the glass, in the colours of the rank the site wears (lib/sky/rankSkies.ts) -- <html data-rank>, set by RankAura.tsx for a student's
// rank or the rank colours they picked. It fades in and out with the rank's colour change, and takes the new rank's colours when the
// rank changes. No data-rank (the site's own colours: visitors, teachers, admins, a new student): the usual background, no sky.
//
// The host is the engine's own mountGradient (a CSS gradient of the stops under a canvas the engine draws into, its clock: t += speed/100 x
// 1.2 x dt with dt capped at 0.05 s, reduced motion = one still frame, redrawn on resize), with these differences:
// - A little blur (BLUR css px) on the sky layer only, scaled up a touch (the engine's fieldBlur rule, 1 + blur/200) so its edges stay
//   covered; nothing on the page is blurred. Because of it the canvas is drawn at half the engine's backing size (it is blurred anyway),
//   and at most FPS frames a second: the glass panels re-blur the background on every frame it changes, so fewer, cheaper frames keep
//   the page light. Drawing stops while the tab is hidden and on the full-screen Reels feed, which covers it.
// - Without WebGL the engine would draw every frame on the CPU, far too slow to animate: there the layer keeps only its CSS gradient.
// - Dark theme: the light sky is laid faintly over the dark ground (CSS, .rank-sky), so the site stays dark.
const BLUR = 10;
const FPS = 30;
const RESOLUTION = 0.5;
const FADE_MS = 900; // with the rank colours' own cross-fade (theme.css, --rk-a..d)

function useRootAttribute(name: string): string | null {
  const [value, setValue] = useState(() => document.documentElement.getAttribute(name));
  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() => setValue(root.getAttribute(name)));
    mo.observe(root, { attributes: true, attributeFilter: [name] });
    setValue(root.getAttribute(name));
    return () => mo.disconnect();
  }, [name]);
  return value;
}

export function RankSky() {
  const rank = useRootAttribute('data-rank');
  const stops = rank ? RANK_SKY_STOPS[rank] : undefined;
  const { pathname } = useLocation();
  // the last rank's colours stay through the fade-out
  const [shown, setShown] = useState(stops);
  useEffect(() => {
    if (stops) setShown(stops);
    else if (shown) {
      const id = window.setTimeout(() => setShown(undefined), FADE_MS);
      return () => window.clearTimeout(id);
    }
  }, [stops, shown]);
  if (!shown) return null;
  return createPortal(<Sky stops={shown} on={!!stops} paused={pathname === '/reels'} />, document.body);
}

function Sky({ stops, on, paused }: { stops: readonly string[]; on: boolean; paused: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const recipeRef = useRef(rankSky(stops));
  const engineRef = useRef<typeof import('../lib/sky/skyEngine') | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const [drawn, setDrawn] = useState(false);

  // a new rank's colours: the engine re-reads its ramp from the stops on the next frame (or the still frame is redrawn)
  useEffect(() => {
    recipeRef.current = rankSky(stops);
    const engine = engineRef.current, field = fieldRef.current;
    if (engine && field) field.style.background = engine.backgroundCss(recipeRef.current);
    redrawRef.current?.();
  }, [stops]);

  useEffect(() => {
    const host = hostRef.current, field = fieldRef.current, canvas = canvasRef.current;
    if (!host || !field || !canvas) return;
    let cancelled = false, raf = 0;
    let ro: ResizeObserver | null = null;

    // The engine's first draw (compiling its shader and painting the first frame) is a heavy 0.5-1.5 s block of the main thread; started with the page it
    // delays everything else on screen (the home page's data, pictures and first paint). It waits until the browser is idle after the page has loaded.
    let idleId = 0;
    let timerId = 0;
    const start = () => void import('../lib/sky/skyEngine').then((engine) => {
      if (cancelled) return;
      const { render, backgroundCss, backingSize, CLOCK_RATE, START_T } = engine;
      engineRef.current = engine;
      field.style.background = backgroundCss(recipeRef.current);
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
        setDrawn(true); // the CSS gradient alone
        return;
      }
      let t = recipeRef.current.startT ?? START_T;
      const speed = Math.max(0, Math.min(100, recipeRef.current.speed));
      // On a phone the sky is one still picture under a 10 px blur: a third of the pixels look the same and take a tenth of the time to draw.
      const phoneSky = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
      const draw = (animating: boolean) => {
        const box = host.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;
        const [bw, bh] = backingSize(box.width, box.height, animating);
        const res = phoneSky ? 0.22 : RESOLUTION;
        const w = Math.max(1, Math.round(bw * res)), h = Math.max(1, Math.round(bh * res));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        render(canvas, recipeRef.current, t, animating);
      };
      // Phones get the sky as a still picture: an animated, blurred layer under the glass panels (each of which re-blurs what is behind it
      // every time it changes) is more than an iPhone's browser can keep up with, and it made every page of the app stutter there.
      const phone = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
      const motionOk = !phone && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let last = 0;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden || pausedRef.current) {
          last = 0;
          return;
        }
        if (last && now - last < 1000 / FPS - 2) return; // ~FPS a second
        if (last) t += (speed / 100) * CLOCK_RATE * Math.min(0.05, (now - last) / 1000);
        last = now;
        draw(true);
      };
      redrawRef.current = () => {
        if (!raf) draw(false);
      };
      ro = new ResizeObserver(() => redrawRef.current?.());
      ro.observe(host);
      if (speed > 0 && motionOk) raf = requestAnimationFrame(frame);
      else draw(false);
      setDrawn(true);
    });
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) idleId = ric(start, { timeout: 2500 });
    else timerId = window.setTimeout(start, 1200);

    return () => {
      cancelled = true;
      if (idleId) (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(idleId);
      window.clearTimeout(timerId);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      redrawRef.current = null;
    };
  }, []);

  return (
    <div ref={hostRef} className={`rank-sky${on && drawn ? ' is-on' : ''}`} aria-hidden="true">
      <div ref={fieldRef} className="rank-sky-field" style={{ filter: `blur(${BLUR}px)`, transform: `scale(${1 + BLUR / 200})` }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
