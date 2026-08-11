import {
  createRNG,
  newGame,
  playGame,
  type BattleState,
  type BossId,
  type ClockLogEvent,
  type Choice,
  type GameState,
  type NewGameSetup,
  type PendingDecision,
  type PlayerId,
  type RNG,
} from '@engine/index';
import { createEasyBot } from '@bots/easy';
import { createMediumBot } from '@bots/medium';
import { createHardBot } from '@bots/hard';
import { createHumanAgent } from '@bots/human';
import type { Agent } from '@bots/Agent';
import { DEFAULT_SETTINGS } from './persistence';
import {
  actionFlashFor,
  applyEventToDisplay,
  cloneDisplay,
  eventDelay,
  initialDisplayBattle,
  popupFor,
  scoreEventCount,
  FLASH_MS,
  POPUP_MS,
  type ActionFlash,
  type ActionFlashBody,
  type DamagePopup,
} from './playback';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type SessionListener = () => void;

/**
 * Owns one running game: the engine generator, the RNG, and the Agent for every seat.
 *
 * The engine races ahead of the animation on purpose — it resolves a whole burst of events between
 * two decisions. `displayBattle` is the paced view the UI actually renders; see playback.ts.
 */
export class GameSession {
  state: GameState;
  rng: RNG;
  version = 0;
  humanAgents = new Map<PlayerId, ReturnType<typeof createHumanAgent>>();
  animSpeedMs: number;
  /** Battle as the player currently sees it — lags `state.battle` while a burst animates. */
  displayBattle: BattleState | null = null;
  /** The event whose result is on screen right now (drives the action banner). */
  currentEvent: ClockLogEvent | null = null;
  popups: DamagePopup[] = [];
  /** Large skill name flashed over the middle of the board as an action lands. */
  actionFlash: ActionFlash | null = null;
  /** Set when a battle finishes and held until the player acknowledges the result popup. Stays up
   *  afterwards so the level-up step can render inside the same popup. */
  battleResult: {
    outcome: 'boss_defeated' | 'clock_ran_out';
    bossId: BossId;
    finishedBy: PlayerId | null;
    markerLeft: number;
    isLastBoss: boolean;
    acknowledged: boolean;
  } | null = null;
  /** Fires with a resumable snapshot right after a battle fully commits (bossIndex advances) —
   *  mid-battle progress is intentionally not saved, same tradeoff v0.2.0 made (docs/07 §6). */
  onBattleBoundary: ((snapshot: GameState) => void) | null = null;

  private visibleLogCount = 0;
  private visibleScoreCount = 0;
  private trackedBattle: BattleState | null = null;
  private popupSeq = 0;
  private flashSeq = 0;
  private battleResultResolve: (() => void) | null = null;
  private listeners = new Set<SessionListener>();
  private agents: Agent[];

  constructor(setup: NewGameSetup, seed: number, resumeFrom?: GameState, animDelayMs: number = DEFAULT_SETTINGS.animDelayMs) {
    this.animSpeedMs = animDelayMs;
    if (resumeFrom) {
      this.rng = createRNG(resumeFrom.rngState);
      this.state = resumeFrom;
    } else {
      this.rng = createRNG(seed);
      this.state = newGame(setup, seed);
    }
    this.agents = setup.players.map((p, i) => {
      if (p.kind === 'human') {
        const human = createHumanAgent(i, () => this.notify());
        this.humanAgents.set(i, human);
        return human;
      }
      const seatSeed = (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
      const rand = createRNG(seatSeed).next;
      const bot = p.botLevel === 'hard' ? createHardBot(i, rand) : p.botLevel === 'easy' ? createEasyBot(i, rand) : createMediumBot(i, rand);
      return this.withDelay(bot);
    });
    // Dev-only handle for poking at a live game from the console (stripped from prod builds).
    if (import.meta.env.DEV) (globalThis as unknown as { __session?: GameSession }).__session = this;
  }

  /** Bots get a short "thinking" beat only — the per-event pacing below carries the real rhythm,
   *  so a full animSpeed delay here on top of it would make turns drag. */
  private withDelay(agent: Agent): Agent {
    return {
      id: agent.id,
      decide: async (state, decision) => {
        const [choice] = await Promise.all([agent.decide(state, decision), sleep(Math.min(300, this.animSpeedMs))]);
        return choice;
      },
    };
  }

  subscribe(fn: SessionListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.version++;
    for (const l of this.listeners) l();
  }

  submitHumanChoice(playerId: PlayerId, choice: Choice) {
    const human = this.humanAgents.get(playerId);
    if (!human) throw new Error(`player ${playerId} is not human`);
    human.submit(choice);
  }

  setAnimSpeed(delayMs: number) {
    this.animSpeedMs = delayMs;
  }

  /** Log lines revealed so far, for the scrolling battle log. */
  get visibleLog(): ClockLogEvent[] {
    return this.state.battle ? this.state.battle.log.slice(0, this.visibleLogCount) : [];
  }

  /** Score totals as revealed by the paced SCORE events, so the number on screen never jumps ahead
   *  of the "⭐ got N points" line that explains it. */
  displayScoreFor(playerId: PlayerId): number {
    let total = 0;
    for (let i = 0; i < this.visibleScoreCount && i < this.state.scoreLog.length; i++) {
      const e = this.state.scoreLog[i];
      if (e.playerId === playerId) total += e.points;
    }
    return total;
  }

  private pushPopup(p: Omit<DamagePopup, 'id'>) {
    const popup: DamagePopup = { ...p, id: this.popupSeq++ };
    this.popups = [...this.popups, popup];
    setTimeout(() => {
      this.popups = this.popups.filter((x) => x.id !== popup.id);
      this.notify();
    }, POPUP_MS);
  }

  /** Called by the result popup's continue button. The engine is parked inside revealNewEvents()
   *  until this fires, so the player always sees how the battle ended before the next one starts. */
  acknowledgeBattleResult() {
    if (this.battleResult) this.battleResult.acknowledged = true;
    const r = this.battleResultResolve;
    this.battleResultResolve = null;
    this.notify();
    r?.();
  }

  private waitForBattleAck(): Promise<void> {
    // An all-bot table has nobody to click continue — hold just long enough to read it.
    if (!this.state.players.some((p) => p.kind === 'human')) {
      return sleep(Math.max(this.animSpeedMs, 900)).then(() => {
        if (this.battleResult) this.battleResult.acknowledged = true;
        this.notify();
      });
    }
    return new Promise((resolve) => {
      this.battleResultResolve = resolve;
    });
  }

  private pushFlash(f: ActionFlashBody) {
    const flash: ActionFlash = { ...f, id: this.flashSeq++ };
    this.actionFlash = flash;
    setTimeout(() => {
      if (this.actionFlash?.id === flash.id) {
        this.actionFlash = null;
        this.notify();
      }
    }, FLASH_MS);
  }

  /** Advances `displayBattle` through every event the engine has produced since the last call,
   *  pausing between them, then hard-resyncs to the true state.
   *
   *  When a boss dies with the clock already at 0/1, `floor(remaining/2)` EXP is 0 for everyone, so
   *  runExpPlacement (game.ts) has nobody to ask and never yields — the engine falls straight
   *  through into prepareBattle() for the *next* boss within the same gen.next() call. By the time
   *  we get here, `this.state.battle` already points at the new battle and the old one's tail
   *  (including its BATTLE_END) would be skipped entirely. Drain the outgoing battle first so its
   *  result is always shown before the next fight appears. */
  private async revealNewEvents() {
    const battle = this.state.battle;

    if (battle !== this.trackedBattle) {
      if (this.trackedBattle && this.visibleLogCount < this.trackedBattle.log.length) {
        // The battle we were tracking never got fully revealed — it was superseded mid-burst.
        // It can only be a non-final boss (the last boss ending the game leaves `state.battle`
        // untouched, so this branch never fires for it), hence isLastBoss is always false here.
        await this.drainBattle(this.trackedBattle, false);
      }

      // New battle: rewind to its opening position and replay its log from the top.
      this.trackedBattle = battle;
      this.displayBattle = battle ? initialDisplayBattle(battle) : null;
      this.visibleLogCount = 0;
      this.visibleScoreCount = battle ? Math.max(0, this.state.scoreLog.length - scoreEventCount(battle)) : this.state.scoreLog.length;
      this.currentEvent = null;
      this.battleResult = null;
    }

    if (!battle) return;
    await this.drainBattle(battle, this.state.bossIndex === this.state.bossQueue.length - 1);
  }

  /** Plays every not-yet-revealed event in `battle`'s log into `displayBattle`, pausing between
   *  them, showing (and waiting on) the result popup if the log ends in BATTLE_END. Only hard-syncs
   *  `displayBattle` to the live state when `battle` is still the one the engine is currently on —
   *  an outgoing battle drained late has already been superseded and must not stomp on the new
   *  battle's in-progress reveal. */
  private async drainBattle(battle: BattleState, isLastBoss: boolean) {
    while (this.visibleLogCount < battle.log.length) {
      const ev = battle.log[this.visibleLogCount];
      const flash = actionFlashFor(this.state, ev);
      applyEventToDisplay(this.displayBattle!, ev);
      if (ev.t === 'SCORE') this.visibleScoreCount++;
      if (flash) this.pushFlash(flash);
      const p = popupFor(ev);
      if (p) this.pushPopup(p);
      if (ev.t !== 'MARKER_TICK') this.currentEvent = ev;
      this.visibleLogCount++;
      this.notify();
      const d = eventDelay(ev, this.animSpeedMs);
      if (d > 0) await sleep(d);

      if (ev.t === 'BATTLE_END') {
        this.battleResult = {
          outcome: ev.outcome,
          bossId: battle.bossId,
          finishedBy: ev.finishedBy,
          markerLeft: this.displayBattle!.marker,
          isLastBoss,
          acknowledged: false,
        };
        this.notify();
        await this.waitForBattleAck();
      }
    }

    if (battle === this.state.battle) {
      this.displayBattle = cloneDisplay(battle);
      this.visibleScoreCount = this.state.scoreLog.length;
      this.notify();
    }
  }

  /** Drives the whole game. Resolves when the game is over. Safe to call once. */
  async run(): Promise<GameState> {
    const gen = playGame(this.state, this.rng);
    let res = gen.next();
    await this.revealNewEvents();
    while (!res.done) {
      const decision: PendingDecision = res.value;
      this.state.pending = decision;
      this.notify();
      const agent = this.agents.find((a) => a.id === decision.playerId)!;
      const choice = await agent.decide(this.state, decision);
      this.state.pending = null;
      const bossIndexBefore = this.state.bossIndex;
      res = gen.next(choice);
      await this.revealNewEvents();
      if (this.state.bossIndex !== bossIndexBefore && this.onBattleBoundary) {
        this.onBattleBoundary(structuredClone(this.state));
      }
      this.notify();
    }
    this.notify();
    return res.value;
  }
}
