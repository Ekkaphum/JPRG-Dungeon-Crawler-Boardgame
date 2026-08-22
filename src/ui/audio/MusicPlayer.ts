/** Looping background music for the battle scene. A real audio file rather than the synthesized
 *  SFX in AudioEngine — a melodic loop isn't practical to generate from oscillators, so this owns
 *  one HTMLAudioElement instead of an AudioContext.
 *
 *  Created lazily, same reasoning as AudioEngine: `typeof Audio === 'undefined'` under the node
 *  test environment, so every method here is a silent no-op in tests. */
class MusicPlayer {
  enabled = true;
  volume = 0.4;
  private el: HTMLAudioElement | null = null;
  /** What the battle scene *wants* right now, independent of whether music is currently muted —
   *  so turning the toggle back on mid-battle resumes instead of staying silent until the next
   *  phase change. */
  private desiredPlaying = false;

  private element(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null;
    if (!this.el) {
      try {
        const el = new Audio('/assets/audio/battle-theme.mp3');
        el.loop = true;
        el.volume = this.volume;
        this.el = el;
      } catch {
        return null;
      }
    }
    return this.el;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.el) this.el.volume = v;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) this.el?.pause();
    else if (this.desiredPlaying) this.resume();
  }

  /** Call once from a real user gesture (Setup screen's Start button) — same reasoning as
   *  AudioEngine.unlock(): browsers refuse to start audio outside a click, and a bot's
   *  setTimeout-driven first move isn't one. Plays a beat then immediately pauses, purely to prime
   *  the element so the real play() call on entering battle isn't the one fighting the policy. */
  unlock() {
    const el = this.element();
    if (!el) return;
    el.play()
      .then(() => {
        if (!this.desiredPlaying) el.pause();
      })
      .catch(() => {});
  }

  /** Enter the battle scene. Idempotent — safe to call on every render while a battle phase is
   *  active, not just on the transition into one. */
  play() {
    this.desiredPlaying = true;
    if (this.enabled) this.resume();
  }

  private resume() {
    const el = this.element();
    if (!el || !el.paused) return;
    el.play().catch(() => {});
  }

  /** Leave the battle scene (camp, draft, menu, scoring, defeat). */
  stop() {
    this.desiredPlaying = false;
    this.el?.pause();
  }
}

export const musicPlayer = new MusicPlayer();

// Dev-only handle, mirroring AudioEngine's `window.__audio` — the element is created with
// `new Audio()` and never appended, so there is otherwise no way to inspect it from the console.
if (import.meta.env.DEV) (globalThis as unknown as { __music?: MusicPlayer }).__music = musicPlayer;
