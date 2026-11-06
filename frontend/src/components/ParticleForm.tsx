import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Object3D, PerspectiveCamera } from 'three';
import { GYROSCOPE } from '../lib/particle-field/presets';

type ParticleStudio = import('../lib/particle-field/engine').ParticleStudio;

const DPR_CAP = 2;
/** The engine's camera distance at rest (engine.ts HOME_DISTANCE). */
const HOME = 4.8;
/** engine.ts MIN_DISTANCE / MAX_DISTANCE: zoomBy never goes past them. */
const MIN_DISTANCE = 1.8;
const MAX_DISTANCE = 12;
// The camera only ever flies in, starting when the top of the wrapper reaches the top of the screen: first a quick
// dive -- over FIRST_SCREENS of scrolling, fastest at the very first scroll (twice its average speed) and slowing to
// exactly the speed of what follows, so there is no stall where they meet -- from the designed framing (HOME) in among
// the rings (FIRST_DISTANCE; the form's 97th-percentile radius is 1.25), then on, steadily, to END_DISTANCE exactly
// when the page can scroll no further, however long the page is, until its particles have spread almost out of
// sight. Both stretches run in log space (equal scrolling, equal zoom factor). Scrolling up flies back out the same way. Closer than the engine's 1.8 limit, the camera stops at
// 1.8 and the scene is scaled up instead (scale = 1.8 / distance): the same view of the form, with the particles
// nearest the camera drawn smaller than a real dolly would, which keeps the cost of flying through them down.
const FIRST_SCREENS = 0.8;
const FIRST_DISTANCE = 1.1;
const END_DISTANCE = 0.12;
/** The engine's own zoom easing (engine.ts ZOOM_EASE, 1/s): the scene scale eases at the same rate as the dolly. */
const ZOOM_EASE = 9;
// Hover parallax: while the mouse moves over the stage the whole scene turns a little toward it (radians at the
// stage's edges), so the near rings follow the pointer and the dust behind the form drifts the other way; it
// eases there and back at PARALLAX_EASE per second.
const PARALLAX_YAW = 0.14;
const PARALLAX_PITCH = 0.09;
const PARALLAX_EASE = 4;
// The stage is a full screen tall; when it is narrower than this (width / height, i.e. a phone held upright) the
// camera stands further back by the same ratio, so the rings fit across it the way they do on a 4:5 box.
const FIT_ASPECT = 0.8;
// The particles behind the page's text soften (CSS blur on the canvas, --pf-blur 0..1 of the CSS radius) so the
// text reads clearly: sharp during the empty fly-in, blurring in while the first content rises from the bottom of
// the screen to BLUR_FULL of the way up, then staying soft behind everything after it.
const BLUR_FULL = 0.6;
// Entrance: while the top of the wrapper rises from the bottom of the screen to the top (the hero scrolling away)
// the form slides in from the page's inline-end side (the right in English, the left in Arabic), swinging round by
// ENTER_YAW as it comes, and fades in; it starts just past the edge of the view (its half-width at the origin plus
// ENTER_MARGIN, in world units) and eases out as it arrives. Tied to the scroll, so scrolling back up slides it out.
// Reduced motion: the fade only.
const ENTER_MARGIN = 1.4;
const ENTER_YAW = 0.6;
/** tan(fov / 2) of the engine's 40-degree camera. */
const TAN_HALF_FOV = Math.tan((20 * Math.PI) / 180);

/** screens: scrolled since the wrapper's top reached the screen's top; endScreens: the same at the bottom of the page. */
function distanceAt(screens: number, endScreens: number): number {
  if (screens <= FIRST_SCREENS || endScreens <= FIRST_SCREENS) {
    // The dive's log-space progress, a cubic with slope 2 at the start and, at the end, the steady stretch's slope
    // relative to the dive's average (a); a = 0 when there is no steady stretch.
    const a = endScreens <= FIRST_SCREENS ? 0 : Math.min(1, (Math.log(END_DISTANCE / FIRST_DISTANCE) / (endScreens - FIRST_SCREENS)) / (Math.log(FIRST_DISTANCE / HOME) / FIRST_SCREENS));
    const t = Math.min(1, Math.max(0, screens / FIRST_SCREENS));
    return HOME * Math.pow(FIRST_DISTANCE / HOME, t * (2 - (1 + a) * t + a * t * t));
  }
  const t = Math.min(1, (screens - FIRST_SCREENS) / (endScreens - FIRST_SCREENS));
  return FIRST_DISTANCE * Math.pow(END_DISTANCE / FIRST_DISTANCE, t);
}

// The GPU particle form (lib/particle-field) as the background of everything inside this wrapper (className): its
// first child is the stage (stageClassName), which CSS keeps on screen (sticky, a screen tall) behind the children
// while they scroll over it. Scrolling down flies the camera ever deeper into the form (distanceAt); the engine eases
// the camera toward each new distance the way its own zoom buttons do (zoomBy), so it glides however fast the page
// moves, and scrolling up reverses it. The mouse turns it slightly (parallax) and dragging where the page leaves it
// uncovered rotates it. The intro (introClassName) is the empty stretch before the children where only the form
// shows; the particles soften once the children scroll over them.
// The rest is the export's own host (mount) as a React effect with clean-up: three and the engine load as their own
// chunk once the page is idle and the stage nears the screen; the canvas follows the stage's size; drawing pauses
// while it is off screen. The entrance slide and the parallax move in the camera's own frame, so they still slide in
// from the side and tilt toward the mouse after the form has been dragged round.
// Reduced motion: no zoom, no parallax, and the form moves at 0.12x. The stage is decorative (aria-hidden). If WebGL
// is unavailable the children render without it.
export function ParticleForm({
  className,
  stageClassName,
  introClassName,
  children,
}: {
  className?: string;
  stageClassName?: string;
  introClassName?: string;
  children?: ReactNode;
}) {
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
    const applyScroll = () => {
      scrollRaf = 0;
      if (!studio) return;
      const vh = Math.max(1, window.innerHeight);
      aspect = container.clientWidth / Math.max(1, container.clientHeight);
      enterGoal = Math.min(1, Math.max(0, 1 - wrap.getBoundingClientRect().top / vh));
      container.style.setProperty('--pf-enter', (1 - (1 - enterGoal) ** 3).toFixed(3));
      const contentTop = introRef.current ? introRef.current.getBoundingClientRect().bottom : vh;
      const blur = Math.min(1, Math.max(0, (vh - contentTop) / (BLUR_FULL * vh)));
      container.style.setProperty('--pf-blur', blur.toFixed(3));
      const screens = reduced ? 0 : Math.max(0, -wrap.getBoundingClientRect().top / vh);
      const endScreens = Math.max(0, (wrap.offsetHeight - vh) / vh); // the wrapper runs to the end of the page
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
      const s = new ParticleStudio(canvas, { ...GYROSCOPE.settings });
      studio = s;
      // OrbitControls sets touch-action: none, which would stop the page scrolling under a finger on the canvas:
      // vertical swipes scroll the page and pinches zoom it, sideways drags still turn the form.
      canvas.style.touchAction = 'pan-y pinch-zoom';
      if (reduced) s.setSpeed(Math.min(GYROSCOPE.settings.speed, 0.12));
      const resize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        s.resize(w, h, Math.min(window.devicePixelRatio || 1, DPR_CAP)); // CSS px + dpr
      };
      resize();
      ro = new ResizeObserver(resize);
      ro.observe(container);
      // First form: particles "gather" in from a wide sphere (scale 4), morph 2.6 s -- it plays when the stage is on screen.
      void s.showForm(GYROSCOPE.form.kind, GYROSCOPE.form.seed, 'gather');
      // The engine has no parallax, entrance or fly-through API: move, turn and scale its root THREE.Scene (a private
      // field; engine.ts stays verbatim and never sets the scene's own position, rotation or scale -- it only turns
      // the groups inside it and orbits the camera).
      const scene = reduced ? undefined : (s as unknown as { scene?: Object3D }).scene;
      // ...and its private camera, whose screen-right and screen-up axes (matrixWorld columns 0 and 1, as of the last
      // frame) the slide and the parallax use. An axis to reuse each frame (scene.up is a THREE.Vector3; cloning it
      // keeps three out of this file's chunk).
      const cam = (s as unknown as { camera?: PerspectiveCamera }).camera;
      const axis = scene?.up.clone();
      // Reduced motion: no scroll zoom (progress stays 0), but narrow screens still get the further-back camera and
      // the particles still soften behind the text.
      applyScroll();
      window.addEventListener('resize', onScroll);
      window.addEventListener('scroll', onScroll, { passive: true });
      if (scene) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        document.documentElement.addEventListener('pointerleave', onPointerLeave);
      }
      // The eased state the scene follows: parallax turn (radians) and entrance progress; the page may load already
      // scrolled past the entrance, so that starts where the scroll is.
      const side = () => (document.documentElement.dir === 'rtl' ? -1 : 1);
      let turnY = 0, turnX = 0, enter = enterGoal, sideNow = side();
      let playing = true, last = performance.now();
      // Drawing pauses until the stage shows past its faded top edge (the canvas mask fades its top 16%), so the
      // sliver that peeks under the hero on tall screens does not cost a full 260k-particle render every frame.
      io = new IntersectionObserver(([e]) => { playing = e.isIntersecting; last = performance.now(); }, { threshold: 0.01, rootMargin: '0px 0px -16% 0px' });
      io.observe(container);
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (playing) {
          if (scene && cam && axis) {
            const k = 1 - Math.exp(-dt * PARALLAX_EASE);
            const kz = 1 - Math.exp(-dt * ZOOM_EASE);
            turnY += (aimX * PARALLAX_YAW - turnY) * k;
            turnX += (aimY * PARALLAX_PITCH - turnX) * k;
            enter += (enterGoal - enter) * kz;
            sideNow += (side() - sideNow) * kz; // a language switch mid-entrance glides across instead of jumping
            const away = (1 - enter) ** 3; // 1 - easeOutCubic(enter)
            const m = cam.matrixWorld.elements; // 0-2: screen-right, 4-6: screen-up
            const off = sideNow * away * (goal * TAN_HALF_FOV * aspect + ENTER_MARGIN);
            scene.position.set(m[0] * off, m[1] * off, m[2] * off);
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
    // Not before the page is idle: loading three, compiling the shaders and seeding 260k particles would otherwise
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
    <div className={className} ref={wrapRef}>
      {!failed && (
        <>
          <div className={stageClassName} ref={boxRef} aria-hidden="true">
            <canvas ref={canvasRef} />
          </div>
          <div className={introClassName} ref={introRef} aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  );
}
