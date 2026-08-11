import type { SoundName } from '@session/playback';

/** 0 above slot 12 (flat, quiet), ramping linearly to 1 exactly at slot 0 — the "last 12 slots
 *  feel urgent" curve tick() plays through. Pure and exported so the curve itself is testable
 *  without a browser; the AudioContext math around it isn't. */
export function tickUrgency(marker: number): number {
  return Math.max(0, Math.min(1, (12 - marker) / 12));
}

/** Every sound effect in the game is synthesized with the Web Audio API — oscillators and short
 *  noise bursts shaped with gain envelopes — rather than sourced as audio files. That means there's
 *  nothing to license, nothing to ship as binary weight, and the whole palette lives in one place.
 *
 *  Lazily creates its AudioContext on first use, since browsers refuse to start audio before a
 *  user gesture. Call `unlock()` from a real click handler (the Setup screen's Start button) to
 *  get ahead of that — sounds triggered later from a bot's `setTimeout`-driven turn aren't
 *  gestures themselves and would otherwise silently fail on the very first game. */
class AudioEngine {
  enabled = true;
  volume = 0.5;
  private ctx: AudioContext | null = null;

  unlock() {
    this.ctx ??= this.createContext();
    this.ctx?.resume().catch(() => {});
  }

  private createContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }

  private activeCtx(): AudioContext | null {
    if (!this.enabled) return null;
    this.ctx ??= this.createContext();
    return this.ctx;
  }

  /** One oscillator with a short linear attack + exponential decay envelope. `sweepTo` glides the
   *  pitch across the note's duration, for rises/falls without needing a second oscillator. */
  private tone(freq: number, duration: number, opts: { type?: OscillatorType; gain?: number; delay?: number; sweepTo?: number } = {}) {
    const ctx = this.activeCtx();
    if (!ctx) return;
    const start = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (opts.sweepTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), start + duration);
    const gainNode = ctx.createGain();
    const peak = (opts.gain ?? 1) * this.volume;
    gainNode.gain.setValueAtTime(0, start);
    gainNode.gain.linearRampToValueAtTime(peak, start + Math.min(0.012, duration / 4));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** A burst of low-pass-filtered white noise, for percussive/impact sounds a pure tone can't do. */
  private noise(duration: number, opts: { gain?: number; delay?: number; filterFreq?: number } = {}) {
    const ctx = this.activeCtx();
    if (!ctx) return;
    const start = ctx.currentTime + (opts.delay ?? 0);
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.filterFreq ?? 2000;
    const gainNode = ctx.createGain();
    const peak = (opts.gain ?? 1) * this.volume;
    gainNode.gain.setValueAtTime(peak, start);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(gainNode).connect(ctx.destination);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  /** Clock tick — pitch and volume climb as the marker counts down toward 0, so the last stretch
   *  of a fight reads as urgent without a separate "danger" sound. Flat and quiet above slot 12. */
  tick(marker: number) {
    const urgency = tickUrgency(marker);
    this.tone(520 + urgency * 380, 0.05, { type: 'square', gain: 0.1 + urgency * 0.16 });
  }

  play(name: Exclude<SoundName, 'tick'>) {
    switch (name) {
      case 'hitBoss':
        this.noise(0.12, { gain: 0.5, filterFreq: 1400 });
        this.tone(140, 0.1, { type: 'triangle', gain: 0.3 });
        break;
      case 'hitPlayer':
        this.noise(0.1, { gain: 0.4, filterFreq: 900 });
        this.tone(110, 0.12, { type: 'sawtooth', gain: 0.25 });
        break;
      case 'heal':
        this.tone(660, 0.14, { type: 'sine', gain: 0.25, sweepTo: 880 });
        this.tone(880, 0.16, { type: 'sine', gain: 0.18, delay: 0.06 });
        break;
      case 'death':
        this.tone(220, 0.5, { type: 'sawtooth', gain: 0.3, sweepTo: 60 });
        break;
      case 'revive':
        this.tone(220, 0.12, { type: 'sine', gain: 0.2 });
        this.tone(440, 0.18, { type: 'sine', gain: 0.22, delay: 0.1 });
        break;
      case 'weakPoint':
        this.tone(900, 0.08, { type: 'sine', gain: 0.2 });
        this.tone(1400, 0.1, { type: 'sine', gain: 0.18, delay: 0.06 });
        break;
      case 'bossMove':
        this.tone(90, 0.3, { type: 'sawtooth', gain: 0.22, sweepTo: 70 });
        break;
      case 'victory':
        for (const [i, freq] of [523, 659, 784, 1046].entries()) {
          this.tone(freq, 0.28, { type: 'triangle', gain: 0.28, delay: i * 0.11 });
        }
        break;
      case 'defeat':
        this.tone(180, 0.9, { type: 'sawtooth', gain: 0.3, sweepTo: 50 });
        this.tone(140, 0.9, { type: 'sawtooth', gain: 0.22, sweepTo: 40, delay: 0.05 });
        break;
      case 'score':
        this.tone(1200, 0.09, { type: 'sine', gain: 0.16 });
        break;
    }
  }
}

export const audioEngine = new AudioEngine();

// Dev-only handle for poking at the engine from the console (stripped from prod builds) —
// mirrors GameSession's `window.__session`.
if (import.meta.env.DEV) (globalThis as unknown as { __audio?: AudioEngine }).__audio = audioEngine;
