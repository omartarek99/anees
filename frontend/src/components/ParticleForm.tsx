import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Object3D, PerspectiveCamera, Quaternion } from 'three';
import { VORTEX } from '../lib/particle-field/presets';

type ParticleStudio = import('../lib/particle-field/engine').ParticleStudio;

/** The vortex's tilt about x, in place of the seed's own: a quarter turn puts the funnel face-on (see mount). */
const FRONT_TILT = Math.PI / 2;
/** The engine's camera distance at rest (engine.ts HOME_DISTANCE). */
const HOME = 4.8;
/** engine.ts MIN_DISTANCE / MAX_DISTANCE: zoomBy never goes past them. */
const MIN_DISTANCE = 1.8;
const MAX_DISTANCE = 12;
// The camera only ever flies in, starting when the top of the wrapper reaches the top of the screen: first a quick
// dive -- over FIRST_SCREENS of scrolling, fastest at the very first scroll (twice its average speed) and slowing to
// exactly the speed of what follows, so there is no stall where they meet -- from the designed framing (HOME) into the
// mouth of the vortex (FIRST_DISTANCE; the form's 97th-percentile radius is 1.25), then on, steadily, down the funnel to
// END_DISTANCE exactly when the page can scroll no further, however long the page is, until its particles have spread
// almost out of sight. Both stretches run in log space (equal scrolling, equal zoom factor). Scrolling up flies back out the same
// way. Closer than the engine's 1.8 limit, the camera stops at 1.8 and the scene is scaled up instead
// (scale = 1.8 / distance): the same view of the form, with the particles nearest the camera drawn smaller than a
// real dolly would, which keeps the cost of flying through them down.
const FIRST_SCREENS = 0.8;
const FIRST_DISTANCE = 1.1;
const END_DISTANCE = 0.12;
/** The engine's own zoom easing (engine.ts ZOOM_EASE, 1/s): the scene scale eases at the same rate as the dolly. */
const ZOOM_EASE = 9;
// Hover parallax: while the mouse moves over the stage the whole scene turns a little toward it (radians at the
// stage's edges), so the near arms follow the pointer and the dust behind the form drifts the other way; it
// eases there and back at PARALLAX_EASE per second.
const PARALLAX_YAW = 0.14;
const PARALLAX_PITCH = 0.09;
const PARALLAX_EASE = 4;
// The stage is a full screen tall; when it is narrower than this (width / height, i.e. a phone held upright) the
// camera stands further back by the same ratio, so the vortex fits across it the way it does on a 4:5 box.
const FIT_ASPECT = 0.8;
// The particles behind the page's text soften (CSS blur on the canvas, --pf-blur 0..1 of the CSS radius) so the
// text reads clearly: sharp during the empty fly-in, blurring in while the first content rises from the bottom of
// the screen to BLUR_FULL of the way up, then staying soft behind everything after it.
const BLUR_FULL = 0.6;
// Entrance: while the top of the wrapper rises from the bottom of the screen to the top (the hero scrolling away)
// the vortex flies in from deep behind the page: it starts ENTER_DEPTH world units further from the camera (a faint
// speck, its points shrunk and faded by distance) and ENTER_SIDE of the view's half-width toward the inline-end side
// (the right in English, the left in Arabic), turned away by ENTER_YAW, and zooms forward into place, easing out as
// it arrives (a gentle ease: the stage's middle only shows once its top is half-way up, so most of the flight must
// still be ahead then -- about 40% of its size there, the whole of it when the stage reaches the top), while the
// stage fades in. Tied to the scroll, so scrolling back up sends it back. Reduced motion: the
// fade only.
const ENTER_DEPTH = 30;
const ENTER_SIDE = 0.45;
const ENTER_YAW = 0.5;
// Slow devices: if frames stay slower than SLOW_FRAME for SLOW_FOR seconds while the form is drawing, render it at a
// lower pixel ratio (2 -> 1.5 -> 1, never back up). Fast devices never get here, so they keep the full look; on a
// slow one the bloom's glow gets a little wider (its blur is measured in render pixels), the price of a smooth page.
const SLOW_FRAME = 1 / 40;
const SLOW_FOR = 2;

/** screens: scrolled since the wrapper's top reached the screen's top; endScreens: the same at the bottom of the page. */
function distanceAt(screens: number, endScreens: number): number {
  if (screens <= FIRST_SCREENS || endScreens <= FIRST_SCREENS) {
    // The dive's log-space progress, a cubic with slope 2 at the start and, at the end, the steady stretch's slope
    // relative to the dive's average (a); a = 0 when there is no steady stretch.
    const a = endScreens <= FIRST_SCREENS ? 0 : Math.min(1, (Math.log(END_DISTANCE / FIRST_DISTANCE) / (endScreens - FIRST_SCREENS)) / (Math.log(FIRST_DISTANCE / HOME) / FIRST_SCREENS));
    const t = Math.min(1, screens / FIRST_SCREENS);
    return HOME * Math.pow(FIRST_DISTANCE / HOME, t * (2 - (1 + a) * t + a * t * t));
  }
  const t = Math.min(1, (screens - FIRST_SCREENS) / (endScreens - FIRST_SCREENS));
  return FIRST_DISTANCE * Math.pow(END_DISTANCE / FIRST_DISTANCE, t);
}

// The GPU particle form (lib/particle-field) behind everything inside this wrapper: landing.css keeps the stage (first
// child) on screen behind the children (sticky, a screen tall); the intro is the empty stretch before them where only
// the form shows. The rest is the export's own host (mount) as a React effect with clean-up; three and the engine load
// as their own chunk once the page is idle and the stage is near. Decorative (aria-hidden); without WebGL the children
// render alone.
export function ParticleForm({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const container = boxRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !container || !canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cancelled = false;
    let studio: ParticleStudio | null = null;
    let raf = 0;
    let scrollRaf = 0;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;

    // zoomBy is relative to the engine's zoom goal, so keep a copy of that goal here.
    let goal = HOME;
    // Scene scale the zoom wants (above 1 only when flying closer than MIN_DISTANCE).
    let scaleGoal = 1;
    // Entrance progress the scroll asks for (0 = off to the side, 1 = in place), and the stage's width / height.
    let enterGoal = 1;
    let aspect = 1;
    let enterCss = '', blurCss = '';
    const applyScroll = () => {
      scrollRaf = 0;
      if (!studio) return;
      // Every layout read first, then the writes, so a scroll costs one style pass, not two. The stage is 100svh, so
      // its height (unlike innerHeight) does not jump when a phone's toolbar slides in or out mid-dive.
      const vh = Math.max(1, container.clientHeight);
      const top = wrap.getBoundingClientRect().top;
      const contentTop = introRef.current ? introRef.current.getBoundingClientRect().bottom : vh;
      const endScreens = Math.max(0, (wrap.offsetHeight - vh) / vh); // the wrapper runs to the end of the page
      aspect = container.clientWidth / vh;
      enterGoal = Math.min(1, Math.max(0, 1 - top / vh));
      const enter = (1 - (1 - enterGoal) ** 3).toFixed(3);
      const blur = Math.min(1, Math.max(0, (vh - contentTop) / (BLUR_FULL * vh))).toFixed(3);
      if (enter !== enterCss) container.style.setProperty('--pf-enter', (enterCss = enter));
      if (blur !== blurCss) container.style.setProperty('--pf-blur', (blurCss = blur));
      const screens = reduced ? 0 : Math.max(0, -top / vh);
      const fit = Math.max(1, FIT_ASPECT / aspect);
      const want = distanceAt(screens, endScreens) * fit;
      const d = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, want));
      scaleGoal = want < MIN_DISTANCE ? MIN_DISTANCE / want : 1;
      if (Math.abs(d - goal) < 1e-4) return;
      studio.zoomBy(d / goal);
      goal = d;
    };
    const onScroll = () => {
      scrollRaf ||= requestAnimationFrame(applyScroll);
    };

    // Where the mouse is over the stage, -1..1 on each axis (0, 0 when it is elsewhere). The page's content covers
    // the stage, so this listens on the window. Mouse only: touch has no hover.
    let aimX = 0, aimY = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = container.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      aimX = inside ? ((e.clientX - r.left) / r.width) * 2 - 1 : 0;
      aimY = inside ? ((e.clientY - r.top) / r.height) * 2 - 1 : 0;
    };
    const onPointerLeave = () => {
      aimX = 0;
      aimY = 0;
    };

    const mount = async () => {
      const { ParticleStudio } = await import('../lib/particle-field/engine');
      if (cancelled) return;
      // Reduced motion: the export's setSpeed(min(speed, 0.12)), given up front.
      const s = new ParticleStudio(canvas, { ...VORTEX.settings, speed: reduced ? Math.min(VORTEX.settings.speed, 0.12) : VORTEX.settings.speed });
      studio = s;
      // OrbitControls sets touch-action: none, which would stop the page scrolling under a finger on the canvas:
      // vertical swipes scroll the page and pinches zoom it, sideways drags still turn the form.
      canvas.style.touchAction = 'pan-y pinch-zoom';
      let dpr = Math.min(window.devicePixelRatio, 2); // the export's cap; lowered only on a slow device (SLOW_FRAME)
      const resize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        s.resize(w, h, dpr); // CSS px + dpr
      };
      resize();
      ro = new ResizeObserver(resize);
      ro.observe(container);
      // The engine has no parallax, entrance or fly-through API: move, turn and scale its private root scene (engine.ts
      // never sets the scene's own transform) along its private camera's axes (matrixWorld columns 0, 1 and 2).
      const { scene, camera: cam, qTo } = s as unknown as { scene: Object3D; camera: PerspectiveCamera; qTo: Quaternion };
      const axis = scene.up.clone(); // a Vector3 to reuse each frame without importing three here
      // First form: particles "gather" in from a wide sphere (scale 4), morph 2.6 s -- it plays when the stage is on screen.
      // Front view: the seed's own tilt (motion.tilt [0.935, 0, -0.277], which the morph turns the form to) leans the funnel
      // over; instead the morph turns it to face the camera (FRONT_TILT about x: the funnel's axis, its local +y, points
      // at the viewer), so the arms spiral round the middle of the screen and the scroll dive goes straight down the
      // throat. showForm sets the engine's target tilt (private qTo) just before it resolves; this runs before any frame
      // draws towards the old one.
      void s.showForm(VORTEX.form.kind, VORTEX.form.seed, 'gather').then(() => {
        qTo.setFromAxisAngle(axis.set(1, 0, 0), FRONT_TILT);
      });
      const tanHalfFov = Math.tan((cam.fov * Math.PI) / 360);
      // Reduced motion: no scroll zoom (progress stays 0), but narrow screens still get the further-back camera and
      // the particles still soften behind the text.
      applyScroll();
      window.addEventListener('resize', onScroll);
      window.addEventListener('scroll', onScroll, { passive: true });
      if (!reduced) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        document.documentElement.addEventListener('pointerleave', onPointerLeave);
      }
      // The eased state the scene follows: parallax turn (radians) and entrance progress; the page may load already
      // scrolled past the entrance, so that starts where the scroll is.
      const side = () => (document.documentElement.dir === 'rtl' ? -1 : 1);
      let turnY = 0, turnX = 0, enter = enterGoal, sideNow = side();
      let playing = true, last = performance.now(), slowFor = 0;
      // Drawing pauses until the stage shows past its faded top edge (the canvas mask fades its top 16%), so the
      // sliver that peeks under the hero on tall screens does not cost a full 250k-particle render every frame.
      io = new IntersectionObserver(([e]) => { playing = e.isIntersecting; last = performance.now(); }, { threshold: 0.01, rootMargin: '0px 0px -16% 0px' });
      io.observe(container);
      const tick = (now: number) => {
        const frame = (now - last) / 1000;
        const dt = Math.min(0.05, frame);
        last = now;
        if (playing) {
          if (dpr > 1 && frame > 0 && frame < 0.25) {
            slowFor = Math.max(0, slowFor + (frame > SLOW_FRAME ? frame : -frame));
            if (slowFor > SLOW_FOR) {
              dpr = dpr > 1.5 ? 1.5 : 1;
              slowFor = 0;
              resize();
            }
          }
          if (!reduced) {
            const k = 1 - Math.exp(-dt * PARALLAX_EASE);
            const kz = 1 - Math.exp(-dt * ZOOM_EASE);
            turnY += (aimX * PARALLAX_YAW - turnY) * k;
            turnX += (aimY * PARALLAX_PITCH - turnX) * k;
            enter += (enterGoal - enter) * kz;
            sideNow += (side() - sideNow) * kz; // a language switch mid-entrance glides across instead of jumping
            const away = (1 - enter) ** 2; // 1 - easeOutQuad(enter): still far back when its middle comes into view
            const m = cam.matrixWorld.elements; // 0-2: screen-right, 4-6: screen-up, 8-10: toward the viewer
            const back = away * ENTER_DEPTH;
            const off = sideNow * away * ENTER_SIDE * (goal + back) * tanHalfFov * aspect;
            scene.position.set(m[0] * off - m[8] * back, m[1] * off - m[9] * back, m[2] * off - m[10] * back);
            scene.quaternion.identity();
            scene.rotateOnWorldAxis(axis.set(m[4], m[5], m[6]), turnY - sideNow * ENTER_YAW * away);
            scene.rotateOnWorldAxis(axis.set(m[0], m[1], m[2]), turnX);
            const sc = scene.scale.x + (scaleGoal - scene.scale.x) * kz;
            scene.scale.setScalar(Math.abs(sc - scaleGoal) < 1e-4 ? scaleGoal : sc);
          }
          s.renderFrame(dt);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        mount().catch(() => {
          if (!cancelled) setFailed(true);
        });
      },
      { rootMargin: '50% 0px' }
    );
    // Not before the page is idle: loading three, compiling the shaders and seeding 250k particles would otherwise
    // compete with the hero and the opening scene on first load (the stage is close enough to fire the observer).
    const whenIdle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500));
    whenIdle(() => {
      if (!cancelled) near.observe(container);
    }, { timeout: 3000 });

    return () => {
      cancelled = true;
      near.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scrollRaf);
      ro?.disconnect();
      io?.disconnect();
      studio?.dispose();
    };
  }, []);

  return (
    <div className="landing-deep" ref={wrapRef}>
      {!failed && (
        <>
          <div className="landing-particles-stage" ref={boxRef} aria-hidden="true">
            <canvas ref={canvasRef} />
          </div>
          <div className="landing-particles-intro" ref={introRef} aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  );
}
