// M8 balance simulator — v0.3.0 "clock" ruleset. Runs medium bots against each other (4 players,
// the only supported count) and reports the numbers PLAN_v0.3.0.md §10/§11 call for: per-boss
// clear rate, average slots remaining, score distribution per character, plus a per-skill usage
// and payoff breakdown.
//
// `state.battle` is replaced wholesale each battle, so the logs of earlier battles would be lost
// by the time the game ends — runOne archives each battle's log as the engine moves on, otherwise
// every stat here would silently describe only the last boss fought.
import { createRNG, newGame, playGame, FRACTURE_PCTS, type NewGameSetup, type BossId, type CharId, type ClockLogEvent, type Choice, type PendingDecision } from '../src/engine';
import { createMediumBot } from '../src/bots/medium';
import { createHardBot } from '../src/bots/hard';
import type { Agent } from '../src/bots/Agent';
import { ALL_CHAR_IDS, CHARACTERS, V040_CHAR_IDS } from '../src/content/characters';
import { AILMENTS, type AilmentId } from '../src/content/ailments';
import type { RulesetVersion } from '../src/content/rulesets';

// Bot tier matters enormously for score-condition measurement: only the HARD bot consults
// scoreConditionBonus(), so conditions that need deliberate setup (banking mana for Liora's charged
// cast) never fire under medium bots, which play purely for the party. Pass 'hard' as argv[3] to
// measure competitive play instead of altruistic play.
// Flags are matched by *value*, not by position. They used to be positional, and
// `balance 5000 v0.4` silently ran v0.3 with a bot tier named "v0.4" — printing a header that said
// v0.3 while the caller believed they had measured v0.4. A mislabelled balance number is worse than
// no number, so the parse is now order-independent and anything unrecognised is a hard error.
const ARGS = process.argv.slice(3);
const BOT_LEVEL = (ARGS.find((a) => a === 'medium' || a === 'hard') ?? 'medium') as 'medium' | 'hard';
const makeBot = (i: number, rand: () => number) => (BOT_LEVEL === 'hard' ? createHardBot(i, rand) : createMediumBot(i, rand));

// argv[4]: which ruleset to measure. Default stays v0.3 so every historical invocation in
// BALANCE_NOTES still means what it meant.
//
// ⚠️ What a v0.4 run does and does not measure. Bots can only ever draft the base four (the three
// v0.4.0 characters are gated to human seats — see draftPoolFor), so a v0.4 run is **not** a
// measurement of Chrono/Kage/Morvane. It measures exactly one thing: what the boss ailments do to a
// party that is otherwise identical to the v0.3 baseline. That is a clean, honest comparison
// precisely *because* the roster is held constant across the two runs.
// v0.4.6 adds the fracture lines on top of v0.4.5 and changes nothing else, so `v0.4` vs `v0.4.6` is a
// controlled A/B on exactly that rule — which is the entire reason it is a separate ruleset.
const RULESET = (ARGS.find((a) => a === 'v0.3' || a === 'v0.4' || a === 'v0.4.6') ?? 'v0.3') as RulesetVersion;

// `--roster=Chrono,Kit,Liora,Luna` pins every seat and skips the draft, so a single character can
// be swapped with the other three held constant. Without it a win-rate delta cannot be attributed
// to the character rather than to who happened to get drafted alongside them.
const ROSTER_ARG = ARGS.find((a) => a.startsWith('--roster='));
const FIXED_ROSTER = ROSTER_ARG ? (ROSTER_ARG.slice('--roster='.length).split(',') as CharId[]) : undefined;

for (const a of ARGS) {
  if (a.startsWith('--roster=')) continue;
  if (!['medium', 'hard', 'v0.3', 'v0.4', 'v0.4.6'].includes(a)) {
    throw new Error(`unknown balance flag "${a}" — expected: medium, hard, v0.3, v0.4, v0.4.6, --roster=A,B,C,D`);
  }
}
if (FIXED_ROSTER) {
  if (FIXED_ROSTER.length !== 4) throw new Error(`--roster needs exactly 4 characters, got ${FIXED_ROSTER.length}`);
  for (const c of FIXED_ROSTER) {
    if (!ALL_CHAR_IDS.includes(c)) throw new Error(`--roster: "${c}" is not a character`);
  }
  if (new Set(FIXED_ROSTER).size !== 4) throw new Error('--roster: characters must be distinct');
  if (FIXED_ROSTER.some((c) => V040_CHAR_IDS.includes(c)) && RULESET === 'v0.3') {
    throw new Error('--roster includes a v0.4.0 character — pass v0.4 as well, or they have no rules to play under');
  }
}

function setup(): NewGameSetup {
  return {
    players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'bot' as const, botLevel: BOT_LEVEL })),
    difficulty: 'standard',
    ruleset: RULESET,
    fixedRoster: FIXED_ROSTER,
  };
}

async function runOne(seed: number) {
  const rng = createRNG(seed);
  const state = newGame(setup(), seed);
  const agents: Agent[] = state.players.map((_, i) => makeBot(i, createRNG(seed * 31 + i + 1).next));
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
  // v0.4.0 ailments. `warded` is Luna's Holy Water actually cancelling something — the passive that
  // did nothing at all for the whole of v0.3.
  const ailApplied: Partial<Record<AilmentId, number>> = {};
  const ailTickDmg: Partial<Record<AilmentId, number>> = {};
  const ailTicks: Partial<Record<AilmentId, number>> = {};
  let ailWarded = 0;
  let doomKills = 0;
  // v0.4.6 fractures. Keyed by character rather than by seat: the question the whole feature
  // hangs on is whether the bounty is pre-assigned to whoever swings biggest.
  const fracCrossedByChar: Record<string, number> = {};
  const fracCrossedByLine: number[] = [0, 0];
  const fracMarkerAt: number[][] = [[], []];
  let fracTakeItem = 0;
  let fracTakeGems = 0;
  let fracAuto = 0;
  let fracDoubles = 0;
  let fracGemsOnLastBoss = 0;
  let fracCrossedTotal = 0;
  // Damage put into the boss per character. The comparison that matters for the fracture rule:
  // a bounty share that merely tracks damage share is a damage tax with extra steps, while one
  // that diverges is doing something of its own (for better or worse).
  const bossDmgByChar: Record<string, number> = {};

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

    // Which seat is which character, needed to attribute fracture crossings while scanning.
    const charOfSeat: Record<number, CharId> = {};
    for (const p of state.players) charOfSeat[p.id] = p.charId;

    for (const log of logs) {
      // A single hit that clears both lines pushes its two FRACTURE_CROSSED events back to back
      // with nothing in between (crossFractures walks the array in one pass), so adjacency is an
      // exact test for "one swing took both" rather than an approximation.
      for (let i = 0; i + 1 < log.length; i++) {
        if (log[i].t === 'FRACTURE_CROSSED' && log[i + 1].t === 'FRACTURE_CROSSED') fracDoubles++;
      }
      let marker = 24;
      for (const ev of log) {
        if (ev.t === 'DECLARE' && ev.playerId !== 'boss') {
          declares[ev.skillId] = (declares[ev.skillId] ?? 0) + 1;
          if (ev.skillId === 'CounterAttack') {
            if (openWindow[ev.playerId] !== undefined) counterPerWindow.push(openWindow[ev.playerId]);
            openWindow[ev.playerId] = 0;
          }
        }
        if (ev.t === 'MARKER_TICK') marker = ev.marker;
        if (ev.t === 'FRACTURE_CROSSED') {
          fracCrossedTotal++;
          fracCrossedByLine[ev.index] = (fracCrossedByLine[ev.index] ?? 0) + 1;
          fracMarkerAt[ev.index]?.push(marker);
          const c = charOfSeat[ev.playerId];
          if (c) fracCrossedByChar[c] = (fracCrossedByChar[c] ?? 0) + 1;
        }
        if (ev.t === 'FRACTURE_CLAIMED') {
          if (ev.take === 'item') fracTakeItem++;
          else fracTakeGems++;
          if (ev.auto) fracAuto++;
        }
        if (ev.t === 'BOSS_MOVE') bossMoves++;
        if (ev.t === 'AILMENT_APPLIED') ailApplied[ev.ailment] = (ailApplied[ev.ailment] ?? 0) + 1;
        if (ev.t === 'AILMENT_TICK') {
          ailTicks[ev.ailment] = (ailTicks[ev.ailment] ?? 0) + 1;
          ailTickDmg[ev.ailment] = (ailTickDmg[ev.ailment] ?? 0) + ev.dmg;
          if (ev.ailment === 'doom') doomKills++;
        }
        if (ev.t === 'AILMENT_WARDED') ailWarded++;
        if (ev.t === 'RESOLVE_ATTACK' && !ev.wasted) {
          if (ev.playerId === 'boss') {
            bossDamageEvents++;
            bossDamage += ev.dmg;
          } else {
            dmgBySkill[ev.skillId] = (dmgBySkill[ev.skillId] ?? 0) + ev.dmg;
            if (ev.targetId === 'boss') {
              const c = charOfSeat[ev.playerId];
              if (c) bossDmgByChar[c] = (bossDmgByChar[c] ?? 0) + ev.dmg;
            }
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
    // Gems banked on the last boss can never be spent — there is no camp after it. Counted
    // separately because it is the one strictly-wrong claim the rule allows a player to make.
    const lastLog = logs.length === state.bossQueue.length ? logs[logs.length - 1] : null;
    if (lastLog) {
      for (const ev of lastLog) if (ev.t === 'FRACTURE_CLAIMED' && ev.take === 'gems') fracGemsOnLastBoss++;
    }

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

  console.log(`\n=== balance sim — ${games} games, 4 ${BOT_LEVEL} bots, ruleset ${RULESET}${FIXED_ROSTER ? `, roster ${FIXED_ROSTER.join('/')}` : ''} ===`);
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

  if (RULESET === 'v0.4.6') {
    console.log(`
fractures (lines at ${FRACTURE_PCTS.map((p) => `${p * 100}%`).join(' / ')} of boss HP):`);
    console.log(`  crossed: ${fracCrossedTotal} total, ${(fracCrossedTotal / games).toFixed(2)}/game (max possible 6)`);
    for (let i = 0; i < fracCrossedByLine.length; i++) {
      const at = fracMarkerAt[i] ?? [];
      console.log(
        `  line ${i + 1} (${FRACTURE_PCTS[i] * 100}%): crossed ${fracCrossedByLine[i]} times, ` +
          `avg clock slot ${mean(at).toFixed(1)}`
      );
    }
    console.log(`  taken as item ${fracTakeItem} (${pct(fracTakeItem, fracTakeItem + fracTakeGems)}%), as gems ${fracTakeGems}`);
    console.log(`  auto-settled (no visit to claim on): ${fracAuto} (${pct(fracAuto, fracTakeItem + fracTakeGems)}%)`);
    console.log(`  one hit took BOTH lines: ${fracDoubles} times (${pct(fracDoubles, games)}% of games)`);
    console.log(`  dead gems taken on the last boss: ${fracGemsOnLastBoss}`);
    const totalBossDmg = Object.values(bossDmgByChar).reduce((a, b) => a + b, 0);
    console.log(`  by character — crossings / share / share of all damage dealt to bosses:`);
    for (const [c, n] of Object.entries(fracCrossedByChar).sort((a, b) => b[1] - a[1])) {
      console.log(
        `    ${c.padEnd(9)} ${String(n).padStart(6)}  ${pct(n, fracCrossedTotal).padStart(5)}%  vs dmg ${pct(bossDmgByChar[c] ?? 0, totalBossDmg)}%`
      );
    }
  }

  if (RULESET !== 'v0.3') {
    console.log('\nailments (applied / ticks / total tick damage / per game):');
    const ailIds = Object.keys(AILMENTS) as AilmentId[];
    let totalAilDmg = 0;
    for (const id of ailIds) {
      const applied = ailApplied[id] ?? 0;
      if (applied === 0) continue;
      const dmg = ailTickDmg[id] ?? 0;
      totalAilDmg += dmg;
      console.log(
        `  ${AILMENTS[id].name.en.padEnd(8)} ${String(applied).padStart(6)}  ${String(ailTicks[id] ?? 0).padStart(6)}  ${String(dmg).padStart(7)}  ${(applied / games).toFixed(2)}/game`
      );
    }
    // The number that actually matters for difficulty: how much extra damage the party eats that
    // the v0.3 baseline never had to absorb.
    console.log(`  total ailment damage: ${totalAilDmg} (${(totalAilDmg / games).toFixed(2)} per game)`);
    console.log(`  doom countdowns that reached 0: ${doomKills}`);
    console.log(`  Holy Water wards (Luna cancelling a single-target debuff): ${ailWarded}`);
  }

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
