// textify.js (https://github.com/MAGGIx1404/Textify-js, MIT) ships no TypeScript types; these cover its v3.0.1 API as
// written in node_modules/textify.js/src (index.js, utils/Config.js). Use: import Textify from 'textify.js';
// import { gsap } from 'gsap'; new Textify({ el: '.my-text' }, gsap). Do not import its dist CSS: it sets transform on * .
// The constructor throws if nothing on the page matches `el` (default "[data-textify]"), so create it after mount.
declare module 'textify.js' {
  type Split = 'chars' | 'words' | 'lines';

  export interface TextifyOptions {
    /** CSS selector of the elements to animate. Default "[data-textify]". */
    el?: string;
    /** Which pieces to split the text into, space-separated. Default "lines words chars". */
    splitType?: string;
    /** Wrapper tag of each piece. Default "div". */
    tag?: 'span' | 'div';
    charsClass?: string;
    wordsClass?: string;
    linesClass?: string;
    position?: 'relative' | 'absolute';
    largeText?: boolean;
    observer?: {
      /** Animate again every time the text re-enters the screen. Default false. */
      repeat?: boolean;
      /** Visible fraction that starts the animation, 0..1. Default 0.5. */
      threshold?: number;
    };
    animation?: {
      by?: Split;
      /** Seconds. Default 0.5. */
      duration?: number;
      /** Seconds between pieces. Default 0.05. */
      stagger?: number;
      /** Seconds. Default 0. */
      delay?: number;
      /** Any GSAP ease. Default "ease". */
      ease?: string;
      customAnimation?: boolean;
      transformOrigin?: string;
      /** Where each piece starts from (it animates to its natural state). */
      animateProps?: {
        opacity?: number;
        x?: number | string;
        y?: number | string;
        scale?: number;
        rotate?: number;
        skewX?: number;
        skewY?: number;
      };
    };
  }

  export default class Textify {
    /** @param engine GSAP (`import { gsap } from 'gsap'`). Throws if no element matches `options.el`. */
    constructor(options: TextifyOptions, engine: object);
    /** Reveal every matched text. */
    animateIn(): void;
    /** Hide every matched text. */
    animateOut(): void;
    /** Re-measure lines and offsets (call after DOM changes or a resize). */
    reset(): void;
  }
}
