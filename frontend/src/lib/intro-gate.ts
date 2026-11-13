// Lets heavy start-up work (the landing page's particle form: loading three, compiling shaders, seeding 250,000 particles) wait until the
// opening scene is over, so the scene's animation is not competing with it on the main thread and the GPU. IntroSplash tells this
// when it starts and when it is gone.

let active = false;
const waiting = new Set<() => void>();

export function introStarted(): void {
  active = true;
}

export function introFinished(): void {
  active = false;
  const run = [...waiting];
  waiting.clear();
  run.forEach((f) => f());
}

/** Runs `cb` now if no opening scene is playing, otherwise as soon as it is gone. Returns a function that cancels. */
export function afterIntro(cb: () => void): () => void {
  if (!active) {
    cb();
    return () => {};
  }
  waiting.add(cb);
  return () => {
    waiting.delete(cb);
  };
}
