// The settings object ParticleStudio (engine.ts) takes, and the one form the landing page shows.
// engine.ts, generators.ts and worker.ts are a verbatim port of the GetLayers "Particle Forms" export, which was
// written for three r158; the app runs three r185. engine.ts has three one-line edits:
//   - it imports this type from here instead of "@/data/particle-field-presets" (the app has no "@" alias);
//   - it passes the layout Float32Array to DataTexture without the r158 typings' `as unknown as BufferSource` cast;
//   - it imports UnrealBloomPass from ./r158 (three r158's own pass, copied) instead of three's, because r185's bloom
//     differs (Rec.709 high-pass weights, wider unnormalised blur kernels, weaker composite). Everything else on the
//     engine's render path renders the same on r185.
// The first two are type-only; the third keeps the bloom the form was designed with.

export interface ParticleFieldSettings {
  count: number;
  size: number;
  speed: number;
  opacity: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  colorA: string;
  colorB: string;
  autorotate: boolean;
}

/** "Gyroscope": orbiting rings around a living core. generate(kind, seed, count) is deterministic in all three. */
export const GYROSCOPE = {
  form: { kind: 'armillary', seed: 3389896822 },
  settings: {
    count: 260000,
    size: 2.4,
    speed: 1.5,
    opacity: 0.7,
    bloomStrength: 1.1,
    bloomRadius: 0.08,
    bloomThreshold: 0.21,
    colorA: '#6c4dff',
    colorB: '#ff3b30',
    autorotate: false,
  } satisfies ParticleFieldSettings,
};
