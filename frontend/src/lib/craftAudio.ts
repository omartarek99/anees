// -------------------------------------------------------------------------------------------
// Sound for the Builder's Quarry, made on the fly with Web Audio (no files to download): short
// effects for digging, building, hits and splashes, and a soft wandering background tune.
// Volumes (master, music, effects, mute) are the player's settings, kept in localStorage.
// The AudioContext only starts after a click or key press (browsers refuse sound before that).
// -------------------------------------------------------------------------------------------
export type AudioSettings = { master: number; music: number; sfx: number; muted: boolean };
export type Sfx = 'dig' | 'break' | 'place' | 'hit' | 'hurt' | 'growl' | 'splash' | 'eat' | 'pop';

const KEY = 'anees_craft_audio';
const DEFAULTS: AudioSettings = { master: 0.7, music: 0.5, sfx: 0.8, muted: false };

let settings: AudioSettings = load();
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let noise: AudioBuffer | null = null;
let musicTimer: number | null = null;
let nextNoteAt = 0;
let lastNote = 0;

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* private mode: defaults */
  }
  return { ...DEFAULTS };
}

export const getAudioSettings = (): AudioSettings => ({ ...settings });

export function setAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* not saved, still applied */
  }
  applyGains();
  return getAudioSettings();
}

function applyGains() {
  if (!ctx || !masterGain || !musicGain || !sfxGain) return;
  const t = ctx.currentTime;
  masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.03);
  musicGain.gain.setTargetAtTime(settings.music * 0.35, t, 0.03);
  sfxGain.gain.setTargetAtTime(settings.sfx, t, 0.03);
}

/** Call from a click / key handler: creates (or wakes) the audio context. */
export function resumeAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyGains();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** a short tone with a quick attack and an exponential fade */
function tone(freq: number, dur: number, type: OscillatorType, vol: number, out: GainNode, at = 0, slideTo?: number) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** a burst of filtered noise (crunches, thuds, splashes) */
function burst(dur: number, filterHz: number, vol: number, q = 1, at = 0) {
  if (!ctx || !noise || !sfxGain) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterHz;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t, Math.random() * 0.3, dur + 0.05);
}

export function playSfx(name: Sfx): void {
  if (!ctx || !sfxGain || settings.muted) return;
  const out = sfxGain;
  switch (name) {
    case 'dig':
      burst(0.07, 900 + Math.random() * 600, 0.25, 1.4);
      break;
    case 'break':
      burst(0.18, 500, 0.5, 0.8);
      burst(0.12, 1400, 0.25, 1.2, 0.03);
      break;
    case 'place':
      burst(0.08, 300, 0.45, 1.5);
      tone(140, 0.08, 'sine', 0.2, out);
      break;
    case 'hit':
      burst(0.1, 700, 0.45, 1);
      tone(220, 0.1, 'square', 0.08, out, 0, 140);
      break;
    case 'hurt':
      tone(330, 0.22, 'sawtooth', 0.12, out, 0, 180);
      burst(0.15, 400, 0.3, 0.8);
      break;
    case 'growl':
      tone(90, 0.45, 'sawtooth', 0.12, out, 0, 60);
      tone(97, 0.45, 'sawtooth', 0.08, out, 0.02, 64);
      break;
    case 'splash':
      burst(0.35, 1200, 0.4, 0.6);
      burst(0.25, 2500, 0.2, 0.8, 0.05);
      break;
    case 'eat':
      for (let i = 0; i < 3; i++) burst(0.06, 1100, 0.3, 2, i * 0.11);
      break;
    case 'pop':
      tone(520, 0.12, 'triangle', 0.25, out, 0, 880);
      tone(880, 0.14, 'triangle', 0.15, out, 0.08, 1320);
      break;
  }
}

// ---- background tune: a slow pentatonic wander, scheduled a little ahead of time ----
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic over two octaves (semitones)
const ROOT = 220; // A3

function scheduleMusic() {
  if (!ctx || !musicGain) return;
  while (nextNoteAt < ctx.currentTime + 1.2) {
    // a gentle melody note, with a soft fifth under it now and then
    lastNote = Math.max(0, Math.min(SCALE.length - 1, lastNote + Math.round((Math.random() - 0.5) * 4)));
    const f = ROOT * Math.pow(2, SCALE[lastNote] / 12);
    const len = [0.6, 0.9, 1.2][(Math.random() * 3) | 0];
    const at = nextNoteAt - ctx.currentTime;
    tone(f, len * 1.6, 'triangle', 0.18, musicGain, Math.max(0, at));
    if (Math.random() < 0.3) tone(f / 2 * 1.5, len * 2.4, 'sine', 0.1, musicGain, Math.max(0, at));
    nextNoteAt += len + (Math.random() < 0.25 ? len : 0); // the odd rest
  }
}

export function startMusic(): void {
  if (!ctx || musicTimer !== null) return;
  nextNoteAt = ctx.currentTime + 0.3;
  musicTimer = window.setInterval(scheduleMusic, 400);
  scheduleMusic();
}

export function stopMusic(): void {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
}

/** leaving the game page: stop everything and let the browser release the audio device */
export function closeAudio(): void {
  stopMusic();
  void ctx?.close();
  ctx = masterGain = musicGain = sfxGain = null;
  noise = null;
}
