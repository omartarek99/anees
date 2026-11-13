import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type HelixTemplate = {
  render(frame: { ctx: CanvasRenderingContext2D; t: number; width: number; height: number; params: object; images: (HTMLImageElement | HTMLCanvasElement | undefined)[]; background: null }): void;
};

export type HelixStory = { id: string; img: string; copy: ReactNode };

const DPR_CAP = 2;
/** The export's parameters. */
const EXPORT_PARAMS = {"cornerRadius":3,"padding":6,"shadowEnabled":false,"turns":3.75,"cardCount":24,"direction":"down","motion":"flow","pulse":60,"ringSize":62,"taper":0,"cardSize":33,"cardAspect":"1:1","cardStyle":"curved","backFade":55,"perspective":20,"tilt":0,"gap":28,"scalePulse":0,"offsetX":0,"offsetY":0,"backgroundType":"color","background":"rgba(0,0,0,0)"};
// Three large pictures, each on the helix once: CARDS slots round the spiral, the stories' pictures on three neighbouring slots and the
// rest left empty (a transparent picture: the template draws a grey placeholder only for a missing one). The scroll walks the helix
// from a few slots before the first story to a few after the last (stepAt: -3..n + 2 slots), so on 9 slots a picture that runs off one end
// comes round again only 4 slots from the middle, off the canvas for cards this large (taller than about a ninth of it). Bigger cards, a wider ring and fewer turns than the
// export's 24-card spiral, so the three read large: the one at rest faces the front, and with 3 turns over 9 slots its neighbours sit a
// third of a turn round, behind it, peeking out above and below (fewer turns leave them edge-on, nearly invisible). cardSize is past the
// export UI's 36 % and ringSize at its 90 % top; render() takes any value.
const CARDS = 9;
const PARAMS = { ...EXPORT_PARAMS, cardCount: CARDS, turns: 3, cardSize: 60, gap: 10, ringSize: 90 };
const EASE = 10; // how fast the drawn helix catches up with the scroll (1/s)
const SHOW_WITHIN = 0.5; // a story's paragraph shows while its picture is the one nearest the middle: picture and paragraph change together
const HOLD = 0.4; // the middle part of each story's stretch where the helix stands still, so its paragraph can be read

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  // only a fully loaded image goes to render() (templates cache rendered cards by media identity); a failed one is a hole,
  // which the template draws as a grey placeholder card
  return img.decode().then(() => img, () => undefined);
}

/** Where the helix stands for a scroll position r (0..n across the pinned stretch, story i's stretch is i..i+1), in card steps: story i's
 *  picture is in the middle at i. Within a stretch the helix eases in to the picture, stands still there for the middle HOLD of it
 *  and eases out (p|p|, slope K at the joins); before and after the stretch it keeps turning at that slope as the section scrolls in and out. */
const K = 2 / (1 - HOLD);
function stepAt(r: number, n: number): number {
  if (r < 0) return -0.5 + K * r;
  if (r > n) return n - 0.5 + K * (r - n);
  const i = Math.min(n - 1, Math.floor(r));
  const c = 2 * (r - i) - 1;
  const p = Math.sign(c) * Math.max(0, (Math.abs(c) - HOLD) / (1 - HOLD));
  return i + 0.5 * p * Math.abs(p);
}

// The motion-template engine's "Helix" (spiral-stream, lib/helix/template.ts) for the landing's three stories: their three pictures,
// each once (see PARAMS), and the scroll drives it. The section is a tall stretch with a pinned (sticky) screen; scrolling through it turns
// the helix one slot at a time, and each story's picture rests in the middle of the spiral (the front, half-way down) for a while, with
// its paragraph beside it; between pictures the paragraph fades out. The pictures come down the spiral in story order. The canvas is
// drawn at min(devicePixelRatio, 2) and only when the helix moves; transparent, so the
// cards wind over the particle form. Reduced motion: the helix does not turn -- it shows each story's picture in turn, the paragraphs fade.
// Each story has an anchor (its id) at the scroll position where it rests, for the header links and for keyboard focus.
export function HelixShowcase({ stories, label }: { stories: HelixStory[]; label: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const n = stories.length;
  const imgs = stories.map((s) => s.img).join('\n');

  useEffect(() => {
    const section = sectionRef.current, box = boxRef.current, canvas = canvasRef.current;
    if (!section || !box || !canvas) return;
    const ctx = canvas.getContext('2d');
    let cancelled = false, raf = 0;
    // The scroll loop (and so the paragraphs) runs on its own; the drawing joins it once the template and the pictures have
    // loaded. If they never do, the stories still read, with no helix.
    let TEMPLATE: HelixTemplate | null = null, cards: (HTMLImageElement | HTMLCanvasElement | undefined)[] | null = null;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dirty = true;
    const phone = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : DPR_CAP); // a phone redraws a third fewer pixels per frame
      const w = Math.round(box.clientWidth * dpr), h = Math.round(box.clientHeight * dpr);
      if (w === canvas.width && h === canvas.height) return; // setting the size wipes and reallocates the canvas: only when it changed
      canvas.width = w;
      canvas.height = h;
      dirty = true;
    };
    resize();
    const target = () => {
      // the pinned stretch: the section's height less the pinned screen's (100svh, not innerHeight, which grows when a phone's
      // toolbar slides away)
      const rect = section.getBoundingClientRect();
      const travel = Math.max(1, rect.height - (box.parentElement?.clientHeight ?? window.innerHeight));
      const e = stepAt((-rect.top / travel) * n, n);
      return still ? Math.min(n - 1, Math.max(0, Math.round(e))) : e;
    };
    let step = 0, drawn = NaN, last = 0, shown: number | null = null;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const goal = target();
      // nothing on the canvas yet: start where the scroll is, rather than easing in from wherever the step was left
      step = still || Number.isNaN(drawn) ? goal : goal + (step - goal) * Math.exp(-EASE * dt);
      if (Math.abs(goal - step) < 1e-4) step = goal;
      if (TEMPLATE && cards && ctx && (dirty || Math.abs(step - drawn) > 1e-5)) {
        dirty = false;
        drawn = step;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const t = (((0.5 + step / CARDS) % 1) + 1) % 1;
        TEMPLATE.render({ ctx, t, width: canvas.width, height: canvas.height, params: PARAMS, images: cards, background: null });
      }
      const i = Math.round(step);
      const now2 = i >= 0 && i < n && Math.abs(step - i) < SHOW_WITHIN ? i : null;
      if (now2 !== shown) setActive((shown = now2));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    // run only while the section is on screen (the latest entry: a quick out-and-back can deliver two at once)
    const io = new IntersectionObserver((entries) => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (entries[entries.length - 1].isIntersecting) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(section);

    // the template and the pictures load once the section is near
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        Promise.all([
          import('../lib/helix/template') as Promise<{ default: HelixTemplate }>,
          Promise.all(imgs.split('\n').map(loadImage)),
        ]).then(
          ([{ default: template }, pics]) => {
            if (cancelled) return;
            // card k goes through the middle at step -k (mod CARDS): story i goes on card -i (mod CARDS), every other card stays empty
            const empty = document.createElement('canvas');
            empty.width = empty.height = 2;
            cards = Array.from({ length: CARDS }, (_, k) => {
              const i = (CARDS - k) % CARDS;
              return i < n ? pics[i] : empty;
            });
            TEMPLATE = template;
            dirty = true;
          },
          () => {} // no helix (e.g. a stale chunk after a deploy): the paragraphs carry on without it
        );
      },
      { rootMargin: '100% 0px' }
    );
    near.observe(section);

    // Each story is a resting point: when a scroll stops between two of them, the page glides on to the nearer one, so one full
    // scroll shows one picture with its paragraph. (CSS proximity snapping was tried: browsers left the page between stories.)
    const anchors = () => Array.from(section.querySelectorAll<HTMLElement>('.landing-showcase-anchor'), (a) => a.getBoundingClientRect().top + window.scrollY);
    let idle = 0, rest = NaN; // rest: the story the page last settled on
    const settle = () => {
      const tops = anchors();
      const y = window.scrollY, gap = tops[1] - tops[0] || window.innerHeight;
      if (y < tops[0] - gap / 2 || y > tops[tops.length - 1] + gap / 2) {
        rest = NaN; // above or below the stories: scroll freely
        return;
      }
      // a quarter of a screen away from the story it rested on is enough to go on to the next one that way; otherwise the nearest
      let to = tops.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
      if (!Number.isNaN(rest) && to === rest && Math.abs(y - rest) > gap / 4) to = tops.find((a) => (y > rest ? a > rest : a < rest) && Math.abs(a - rest) <= gap + 2) ?? to;
      rest = to;
      if (Math.abs(to - y) > 2) window.scrollTo({ top: to, behavior: still ? 'auto' : 'smooth' });
    };
    const onScroll = () => {
      clearTimeout(idle);
      idle = window.setTimeout(settle, 160);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      cancelled = true;
      clearTimeout(idle);
      window.removeEventListener('scroll', onScroll);
      near.disconnect();
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [imgs, n]);

  return (
    <section className="landing-showcase" ref={sectionRef} style={{ '--n': n } as CSSProperties}>
      {stories.map((s, i) => (
        <span key={s.id} id={s.id} className="landing-showcase-anchor" style={{ '--i': i } as CSSProperties} />
      ))}
      <div className="landing-showcase-stage">
        <div className="landing-showcase-copy">
          {stories.map((s, i) => (
            <article
              key={s.id}
              className={`landing-copy${i === active ? ' is-on' : ''}`}
              // a keyboard user tabbing to a story's link scrolls to that story, so the link is never focused unseen
              onFocus={() => i !== active && document.getElementById(s.id)?.scrollIntoView()}
            >
              {s.copy}
            </article>
          ))}
        </div>
        <div className="helix-showcase" ref={boxRef} role="img" aria-label={label}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </section>
  );
}
