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
import { createHardBot } from '../src/bots/hard';
import type { Agent } from '../src/bots/Agent';
import { CHARACTERS } from '../src/content/characters';

// Bot tier matters enormously for score-condition measurement: only the HARD bot consults
// scoreConditionBonus(), so conditions that need deliberate setup (banking mana for Liora's charged
// cast) never fire under medium bots, which play purely for the party. Pass 'hard' as argv[3] to
// measure competitive play instead of altruistic play.
const BOT_LEVEL = (process.argv[3] ?? 'medium') as 'medium' | 'hard';
const makeBot = (i: number, rand: () => number) => (BOT_LEVEL === 'hard' ? createHardBot(i, rand) : createMediumBot(i, rand));

function setup(): NewGameSetup {
  return {
    players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'bot' as const, botLevel: BOT_LEVEL })),
    difficulty: 'standard',
  };
}

async function runOne(seed: number) {
  const rng = createRNG(seed);
  const state = newGame(setup(), seed);
  const agents: Agent[] = state.players.map((p, i) => makeBot(i, createRNG(seed * 31 + i + 1).next));
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
  const scoreByChar: Record<CharId, number[]> = { Eric: [], Kit: [], Liora: [], Luna: [], Chrono: [], Kage: [], Morvane: [] };
  // Who actually took the individual win, not just who scored well. These two can disagree: a
  // character with a high average can still lose most head-to-heads if their points arrive in
  // games the party was going to lose anyway, or if another character's floor is higher.
  const winsByChar: Record<string, number> = {};
  // Per-condition breakdown (all games, not just wins) — how often each of the 12 score
  // conditions actually fires and how many points it hands out in total, which the per-character
  // total above can't distinguish (e.g. a per-occurrence condition firing often vs. a rare
  // high-value one landing at the same average).
  const conditionHits: Record<string, number> = {};
  const conditionPoints: Record<string, number> = {};
  const wonConditionHits: Record<string, number> = {};
  const wonConditionPoints: Record<string, number> = {};
  // conditionId -> charId -> points, for the payouts that belong to no single character
  // ('timeBonus', and 'lastShot' since v0.3.7).
  const sharedByChar: Record<string, Record<string, number>> = {};
  let bigHits = 0;
  let armorBrokeGames = 0;

  const declares: Record<string, number> = {};
  const dmgBySkill: Record<string, number> = {};
  const hitsBySkill: Record<string, number> = {};
  let trapSprung = 0; // boss stood on it, roll attempted (hit or miss)
  let trapHits = 0; // roll succeeded — actually dealt damage
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
        if (ev.t === 'SCORE') {
          conditionHits[ev.entry.conditionId] = (conditionHits[ev.entry.conditionId] ?? 0) + 1;
          conditionPoints[ev.entry.conditionId] = (conditionPoints[ev.entry.conditionId] ?? 0) + ev.entry.points;
        }
        if (ev.t === 'RESOLVE_TRAP_TRIGGER') {
          trapSprung++;
          if (ev.dmg > 0) trapHits++;
          dmgBySkill.Trap = (dmgBySkill.Trap ?? 0) + ev.dmg;
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

    const gameOver = state.gameOver;
    if (gameOver?.outcome === 'win') {
      wins++;
      for (const p of state.players) scoreByChar[p.charId].push(gameOver.totals[p.id] ?? 0);
      // The party has to survive all 3 bosses before anyone wins individually, so this only ever
      // counts won games — which is the same denominator the score figures below use.
      const champion = state.players.find((p) => p.id === gameOver.winnerId);
      if (champion) winsByChar[champion.charId] = (winsByChar[champion.charId] ?? 0) + 1;
      // Won-games-only condition breakdown: scoring only ever decides a winner in a game the party
      // actually wins, so this — not the all-games figures above — is what determines who tends to
      // come out ahead. state.scoreLog accumulates across all 3 battles, same source
      // currentTotalScore() reads for the final tally. 'timeBonus' (Aurelius's leftover-clock
      // payout) is the one condition every player earns under the *same* id regardless of
      // character, so it can't be attributed via conditionId alone the way the 12 personal
      // conditions can — route it through the player's actual character instead.
      const charOf: Record<number, CharId> = {};
      for (const p of state.players) charOf[p.id] = p.charId;
      for (const entry of state.scoreLog) {
        wonConditionHits[entry.conditionId] = (wonConditionHits[entry.conditionId] ?? 0) + 1;
        wonConditionPoints[entry.conditionId] = (wonConditionPoints[entry.conditionId] ?? 0) + entry.points;
        // 'timeBonus' and (since v0.3.7) 'lastShot' are the two payouts that aren't personal
        // conditions, so conditionId alone can't attribute them — route both through the player's
        // actual character or they vanish from the per-character totals below.
        if (entry.conditionId === 'timeBonus' || entry.conditionId === 'lastShot') {
          const c = charOf[entry.playerId];
          sharedByChar[entry.conditionId] ??= {};
          sharedByChar[entry.conditionId][c] = (sharedByChar[entry.conditionId][c] ?? 0) + entry.points;
        }
      }
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : '0.0');

  console.log(`\n=== balance sim — ${games} games, 4 ${BOT_LEVEL} bots ===`);
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

  const trapArmed = declares.Trap ?? 0;
  console.log(
    `\ntrap: armed ${trapArmed}, sprung ${trapSprung} (${pct(trapSprung, trapArmed)}%), ` +
      `hit ${trapHits} (${pct(trapHits, trapSprung)}% of sprung), expired unsprung ${trapExpires}`
  );
  console.log(`counter windows: ${counterPerWindow.length}, avg ripostes each ${mean(counterPerWindow).toFixed(2)}`);
  const multi = counterPerWindow.filter((n) => n >= 2).length;
  const zero = counterPerWindow.filter((n) => n === 0).length;
  console.log(`  never hit: ${pct(zero, counterPerWindow.length)}%   |   2+ ripostes: ${pct(multi, counterPerWindow.length)}%`);
  console.log(`boss: ${bossMoves} moves resolved, ${bossDamageEvents} damage events, ${bossDamage} total damage dealt`);

  console.log('\nindividual win share (who took the win in each won game):');
  for (const charId of Object.keys(scoreByChar) as CharId[]) {
    const w = winsByChar[charId] ?? 0;
    if (w === 0 && !scoreByChar[charId].length) continue;
    console.log(`  ${charId.padEnd(6)} ${String(w).padStart(5)} wins   ${pct(w, wins).padStart(5)}% of won games`);
  }

  console.log('\navg total score by character (won games only):');
  for (const charId of Object.keys(scoreByChar) as CharId[]) {
    console.log(`  ${charId}: ${mean(scoreByChar[charId]).toFixed(1)}`);
  }

  const conditionChar: Record<string, string> = {};
  for (const charId of Object.keys(CHARACTERS) as CharId[]) {
    for (const c of CHARACTERS[charId].score) conditionChar[c.id] = charId;
  }
  console.log('\nscore conditions, all games (id / char / fires per game / avg pts per game):');
  for (const id of Object.keys(conditionChar).sort()) {
    const hits = conditionHits[id] ?? 0;
    const pts = conditionPoints[id] ?? 0;
    console.log(`  ${id.padEnd(6)} ${(conditionChar[id] ?? '?').padEnd(6)} ${(hits / games).toFixed(2).padStart(6)}/game   ${(pts / games).toFixed(2).padStart(6)} pts/game`);
  }

  // The figures that actually decide winners: only games the party won, normalized per winning
  // game rather than per game overall, plus each condition's share of its own character's *true*
  // total (personal conditions + this character's slice of the shared timeBonus payout) — the
  // number that answers "is any one of Luna's/Liora's three conditions carrying her score, or is
  // one of them dead weight next to how much timeBonus alone hands out?"
  const charTotalWon: Record<string, number> = {};
  for (const byChar of Object.values(sharedByChar)) {
    for (const [c, pts] of Object.entries(byChar)) charTotalWon[c] = (charTotalWon[c] ?? 0) + pts;
  }
  for (const [id, pts] of Object.entries(wonConditionPoints)) {
    const c = conditionChar[id];
    if (c) charTotalWon[c] = (charTotalWon[c] ?? 0) + pts;
  }
  console.log('\nscore conditions, won games only (id / char / fires per win / avg pts per win / share of char total):');
  for (const id of [...Object.keys(conditionChar).sort(), 'lastShot', 'timeBonus']) {
    const hits = wonConditionHits[id] ?? 0;
    const isShared = id === 'timeBonus' || id === 'lastShot';
    const pts = wonConditionPoints[id] ?? 0;
    const c = isShared ? 'ALL' : conditionChar[id] ?? '?';
    const share = isShared ? null : charTotalWon[c] ? (pts / charTotalWon[c]) * 100 : 0;
    console.log(
      `  ${id.padEnd(6)} ${c.padEnd(6)} ${(hits / Math.max(1, wins)).toFixed(2).padStart(6)}/win   ${(pts / Math.max(1, wins)).toFixed(2).padStart(6)} pts/win   ${share === null ? '  —' : share.toFixed(0).padStart(3) + '%'}`
    );
  }
  console.log('\nshared payouts per character (pts/win) — these belong to no single condition slot:');
  for (const id of Object.keys(sharedByChar)) {
    const row = (Object.keys(scoreByChar) as CharId[])
      .filter((c) => sharedByChar[id][c])
      .map((c) => `${c} ${(sharedByChar[id][c] / Math.max(1, wins)).toFixed(2)}`)
      .join('   ');
    console.log(`  ${id.padEnd(10)} ${row}`);
  }
  console.log('\ntrue total per character in won games (personal conditions + shared payouts):');
  for (const charId of Object.keys(scoreByChar) as CharId[]) {
    console.log(`  ${charId}: ${((charTotalWon[charId] ?? 0) / Math.max(1, wins)).toFixed(2)} pts/win`);
  }
}

main();
