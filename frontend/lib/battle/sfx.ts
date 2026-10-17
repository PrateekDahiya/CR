/**
 * frontend/lib/battle/sfx.ts — WebAudio oscillator SFX stub for the battle client.
 *
 * Per docs/UI_REFERENCE.md §7: sounds via WebAudio oscillator stub
 * (deploy pop, hit thud, win fanfare arpeggio); mute toggle persisted.
 * Original synthesized tones only — no Supercell audio assets.
 *
 * Pure TS: no socket, no React imports. Safe under SSR (guards `window`).
 */

const MUTE_STORAGE_KEY = "cr-clone-muted";

let ctx: AudioContext | null = null;
let mutedCache: boolean | null = null;

function canUseAudio(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
}

function getCtx(): AudioContext | null {
  if (!canUseAudio()) return null;
  if (ctx === null) {
    try {
      ctx = new window.AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

/** Persisted mute flag (localStorage `cr-clone-muted` = "1"/"0"). */
export function isMuted(): boolean {
  if (mutedCache !== null) return mutedCache;
  try {
    if (typeof window !== "undefined") {
      mutedCache = window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
      return mutedCache;
    }
  } catch {
    // storage unavailable — fall through to default
  }
  mutedCache = false;
  return false;
}

export function setMuted(muted: boolean): void {
  mutedCache = muted;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    }
  } catch {
    // non-fatal: mute still applies for this session via cache
  }
}

export function toggleMute(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

interface ToneOpts {
  freq: number;
  endFreq?: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
  delayMs?: number;
}

function tone(audio: AudioContext, opts: ToneOpts): void {
  const { freq, endFreq, durationMs, type = "sine", gain = 0.12, delayMs = 0 } = opts;
  const t0 = audio.currentTime + delayMs / 1000;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + durationMs / 1000);
  }
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.05);
}

/** Card deploy "pop": quick upward sine blip. */
export function playDeploy(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  tone(audio, { freq: 320, endFreq: 640, durationMs: 120, type: "sine", gain: 0.14 });
}

/** Damage "thud": short low triangle hit. */
export function playHit(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  tone(audio, { freq: 160, endFreq: 90, durationMs: 100, type: "triangle", gain: 0.12 });
}

/** Invalid-deploy "thud + shake" cue: low square buzz. */
export function playInvalid(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  tone(audio, { freq: 140, endFreq: 110, durationMs: 160, type: "square", gain: 0.06 });
}

/** Victory fanfare: C–E–G–C arpeggio stub. */
export function playWin(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    tone(audio, { freq, durationMs: 180, type: "triangle", gain: 0.13, delayMs: i * 140 });
  });
}

/** Defeat cue: descending two-tone stub. */
export function playLose(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  tone(audio, { freq: 392, endFreq: 330, durationMs: 200, type: "triangle", gain: 0.12 });
  tone(audio, { freq: 330, endFreq: 262, durationMs: 260, type: "triangle", gain: 0.12, delayMs: 180 });
}
