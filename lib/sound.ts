"use client";

/**
 * Tiny synthesised blips. No audio files to ship, and nothing is created until
 * the first deliberate tap — browsers block audio before a user gesture anyway.
 */

const MUTE_KEY = "hld:muted";

type Tone = { freq: number; to?: number; ms: number; gain?: number; type?: OscillatorType };

const TONES: Record<string, Tone[]> = {
  tap: [{ freq: 620, ms: 40, gain: 0.05 }],
  higher: [{ freq: 420, to: 700, ms: 150, gain: 0.09 }],
  lower: [{ freq: 620, to: 330, ms: 150, gain: 0.09 }],
  correct: [
    { freq: 523, ms: 110, gain: 0.1 },
    { freq: 784, ms: 110, gain: 0.1 },
    { freq: 1046, ms: 260, gain: 0.1 },
  ],
  lose: [{ freq: 300, to: 150, ms: 420, gain: 0.09, type: "triangle" }],
  join: [
    { freq: 660, ms: 90, gain: 0.08 },
    { freq: 990, ms: 140, gain: 0.08 },
  ],
};

export type SoundName = keyof typeof TONES;

let ctx: AudioContext | null = null;
let muted = false;

export function initSound() {
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
}

export function play(name: SoundName) {
  if (muted || typeof window === "undefined") return;
  const tones = TONES[name];
  if (!tones) return;

  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();

    let at = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const seconds = tone.ms / 1000;

      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.freq, at);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, at + seconds);

      // Short attack, exponential decay — a plain on/off would click.
      const peak = tone.gain ?? 0.08;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + seconds + 0.02);
      at += seconds * 0.85;
    }
  } catch {
    // Audio is a nicety; never let it break a turn.
  }
}
