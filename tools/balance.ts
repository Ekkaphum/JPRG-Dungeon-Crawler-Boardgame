// M8 balance simulator — v0.3.0 "clock" ruleset. Runs medium bots against each other (4 players,
// the only supported count) and reports the numbers PLAN_v0.3.0.md §10/§11 call for: per-boss
// clear rate, average slots remaining, score distribution per character, plus a per-skill usage
// and payoff breakdown.
//
// `state.battle` is replaced wholesale each battle, so the logs of earlier battles would be lost
// by the time the game ends — runOne archives each battle's log as the engine moves on, otherwise
// every stat here would silently describe only the last boss fought.
import { createRNG, newGame, playGame, type NewGameSetup, type BossId, type CharId, type ClockLogEvent, type Choice, type PendingDecision } from '../src/engine';
import { createMediumBot } from '../src/bots/medium';
import type { Agent } from '../src/bots/Agent';

function setup(): NewGameSetup {
  return {
    players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'bot' as const, botLevel: 'medium' as const })),
    difficulty: 'standard',
  };
}

async function runOne(seed: number) {
  const rng = createRNG(seed);
  const state = newGame(setup(), seed);
  const agents: Agent[] = state.players.map((p, i) => createMediumBot(i, createRNG(seed * 31 + i + 1).next));
  const gen = playGame(state, rng);

  const logs: ClockLogEvent[][] = [];
  let tracked: unknown = null;
  const archive = () => {
    if (state.battle && state.battle !== tracked) {
      if (tracked) logs.push((tracked as { log: ClockLogEvent[] }).log);
      tracked = state.battle;
    }
  };

  let res = gen.next();
  archive();
  while (!res.done) {
    const decision: PendingDecision = res.value;
    const agent = agents.find((a) => a.id === decision.playerId)!;
    const choice: Choice = await agent.decide(state, decision);
    res = gen.next(choice);
    archive();
  }
  if (tracked) logs.push((tracked as { log: ClockLogEvent[] }).log);
  return { state, logs };
}

async function main() {
  const games = Number(process.argv[2] ?? 2000);
  let wins = 0;
  const bossCleared: Partial<Record<BossId, number>> = {};
  const bossAttempts: Partial<Record<BossId, number>> = {};
  const scoreByChar: Record<CharId, number[]> = { Matt: [], Kit: [], Vera: [], Luna: [] };
  let bigHits = 0;
  let armorBrokeGames = 0;

  const declares: Record<string, number> = {};
  const dmgBySkill: Record<string, number> = {};
  const hitsBySkill: Record<string, number> = {};
  let trapTriggers = 0;
  let trapExpires = 0;
  const rolls: Record<string, { tries: number; ok: number }> = {};
  let bossMoves = 0;
  let bossDamageEvents = 0;
  let bossDamage = 0;
  const counterPerWindow: number[] = [];

  for (let seed = 0; seed < games; seed++) {
    const { state, logs } = await runOne(seed);

    for (const boss of state.bossQueue) bossAttempts[boss] = (bossAttempts[boss] ?? 0) + 1;
    const cleared = state.gameOver?.outcome === 'win' ? state.bossQueue.length : state.bossIndex;
    for (let i = 0; i < cleared; i++) {
      const boss = state.bossQueue[i];
      bossCleared[boss] = (bossCleared[boss] ?? 0) + 1;
    }
    if (state.bossIndex >= 2 && state.battle?.bossId === 'Aurelius' && state.battle.armor < 2) armorBrokeGames++;

    // Ripostes per Counter window, counted per player: a window opens on declare and closes at
    // that player's next Counter declare or the end of the battle.
    const openWindow: Record<number, number> = {};

    for (const log of logs) {
      for (const ev of log) {
        if (ev.t === 'DECLARE' && ev.playerId !== 'boss') {
          declares[ev.skillId] = (declares[ev.skillId] ?? 0) + 1;
          if (ev.skillId === 'CounterAttack') {
            if (openWindow[ev.playerId] !== undefined) counterPerWindow.push(openWindow[ev.playerId]);
            openWindow[ev.playerId] = 0;
          }
        }
        if (ev.t === 'BOSS_MOVE') bossMoves++;
        if (ev.t === 'RESOLVE_ATTACK' && !ev.wasted) {
          if (ev.playerId === 'boss') {
            bossDamageEvents++;
            bossDamage += ev.dmg;
          } else {
            dmgBySkill[ev.skillId] = (dmgBySkill[ev.skillId] ?? 0) + ev.dmg;
            hitsBySkill[ev.skillId] = (hitsBySkill[ev.skillId] ?? 0) + 1;
            if (ev.dmg >= 25) bigHits++;
            if (ev.skillId === 'CounterAttack' && openWindow[ev.playerId] !== undefined) openWindow[ev.playerId]++;
          }
        }
        if (ev.t === 'RESOLVE_TRAP_TRIGGER') {
          trapTriggers++;
          dmgBySkill.SetTrap = (dmgBySkill.SetTrap ?? 0) + ev.dmg;
        }
        if (ev.t === 'RESOLVE_TRAP_EXPIRE') trapExpires++;
        if (ev.t === 'ROLL' && ev.playerId !== 'boss') {
          const r = (rolls[ev.purpose] ??= { tries: 0, ok: 0 });
          r.tries++;
          if (ev.success) r.ok++;
        }
      }
    }
    for (const n of Object.values(openWindow)) counterPerWindow.push(n);

    if (state.gameOver?.outcome === 'win') {
      wins++;
      for (const p of state.players) scoreByChar[p.charId].push(state.gameOver.totals[p.id] ?? 0);
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : '0.0');

  console.log(`\n=== v0.3.0 balance sim — ${games} games, 4 medium bots ===`);
  console.log(`win rate: ${pct(wins, games)}%`);
  console.log('per-boss clear rate:');
  for (const boss of Object.keys(bossAttempts) as BossId[]) {
    console.log(`  ${boss}: ${pct(bossCleared[boss] ?? 0, bossAttempts[boss] ?? 1)}%`);
  }
  console.log(`Aurelius armor broke at least once: ${pct(armorBrokeGames, games)}% of games`);
  console.log(`hits >=25 dmg (proxy for the §8 stacked-buff combo): ${bigHits} total`);

  console.log('\nskill usage (declares / total damage / dmg per declare):');
  for (const id of Object.keys(declares).sort((a, b) => (dmgBySkill[b] ?? 0) - (dmgBySkill[a] ?? 0))) {
    const d = declares[id];
    const dmg = dmgBySkill[id] ?? 0;
    console.log(`  ${id.padEnd(14)} ${String(d).padStart(6)}  ${String(dmg).padStart(7)}  ${(dmg / d).toFixed(2)}`);
  }

  console.log('\ndice ladders (attempts / success rate):');
  for (const [purpose, r] of Object.entries(rolls)) {
    console.log(`  ${purpose.padEnd(22)} ${String(r.tries).padStart(6)}  ${pct(r.ok, r.tries)}%`);
  }

  const trapArmed = declares.SetTrap ?? 0;
  console.log(`\ntrap: armed ${trapArmed}, triggered ${trapTriggers} (${pct(trapTriggers, trapArmed)}%), wasted ${trapExpires}`);
  console.log(`counter windows: ${counterPerWindow.length}, avg ripostes each ${mean(counterPerWindow).toFixed(2)}`);
  const multi = counterPerWindow.filter((n) => n >= 2).length;
  const zero = counterPerWindow.filter((n) => n === 0).length;
  console.log(`  never hit: ${pct(zero, counterPerWindow.length)}%   |   2+ ripostes: ${pct(multi, counterPerWindow.length)}%`);
  console.log(`boss: ${bossMoves} moves resolved, ${bossDamageEvents} damage events, ${bossDamage} total damage dealt`);

  console.log('\navg total score by character (won games only):');
  for (const charId of Object.keys(scoreByChar) as CharId[]) {
    console.log(`  ${charId}: ${mean(scoreByChar[charId]).toFixed(1)}`);
  }
}

main();
