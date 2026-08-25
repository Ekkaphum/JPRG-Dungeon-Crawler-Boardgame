// Scratch measurement: what the camp's gem economy pays out, what it buys, and what it wastes.
import { createRNG, newGame, playGame, type NewGameSetup, type Choice, type PendingDecision } from '../src/engine';
import { createHardBot } from '../src/bots/hard';
import type { Agent } from '../src/bots/Agent';
import { ITEMS } from '../src/content/items';
import { GEMS_PER_UPGRADE, GEMS_PER_VP } from '../src/engine/clock/camp';

const GAMES = Number(process.argv[2] ?? 400);
type Rec = { camp: number; arrived: number; spentItems: number; nItems: number; nUp: number; spentVp: number; nVp: number; wasted: number };
const recs: Rec[] = [];
const pairs: Array<[number, number]> = [];

function setup(): NewGameSetup {
  return { players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'bot' as const, botLevel: 'hard' as const })), difficulty: 'standard', ruleset: 'v0.4' };
}

async function runOne(seed: number) {
  const arrivals = new Map<number, number[]>();
  const rng = createRNG(seed);
  const state = newGame(setup(), seed);
  const agents: Agent[] = state.players.map((_p, i) => createHardBot(i, createRNG(seed * 31 + i + 1).next));
  const gen = playGame(state, rng);
  const cur = new Map<number, Rec>();
  const campNo = new Map<number, number>();
  const flush = () => { for (const [, r] of cur) { r.wasted = r.arrived - r.spentItems - r.nUp * GEMS_PER_UPGRADE - r.spentVp; recs.push({ ...r }); } cur.clear(); };

  let res = gen.next();
  while (!res.done) {
    const d: PendingDecision = res.value;
    const agent = agents.find((a) => a.id === d.playerId)!;
    const choice: Choice = await agent.decide(state, d);
    const pid = d.playerId as number;
    const isCamp = d.kind === 'CAMP_BUY' || d.kind === 'CAMP_UPGRADE' || d.kind === 'CAMP_VP';
    if (!isCamp) flush();

    if (d.kind === 'CAMP_BUY') {
      if (!cur.has(pid)) {
        const c = campNo.get(pid) ?? 0; campNo.set(pid, c + 1);
        { const a = arrivals.get(pid) ?? []; a.push(d.gems); arrivals.set(pid, a); }
        cur.set(pid, { camp: c, arrived: d.gems, spentItems: 0, nItems: 0, nUp: 0, spentVp: 0, nVp: 0, wasted: 0 });
      }
      const r = cur.get(pid)!;
      if (choice.kind === 'CAMP_BUY' && choice.itemId) { r.spentItems += ITEMS[choice.itemId].cost; r.nItems += 1; }
    }
    if (d.kind === 'CAMP_UPGRADE' && choice.kind === 'CAMP_UPGRADE') { const r = cur.get(pid); if (r) r.nUp = (choice.skillIds ?? []).length; }
    if (d.kind === 'CAMP_VP' && choice.kind === 'CAMP_VP') {
      const r = cur.get(pid);
      if (r) { const sp = Math.min(Math.max(0, choice.gemsSpent ?? 0), d.gems); r.spentVp = sp; r.nVp = Math.floor(sp / GEMS_PER_VP); }
    }
    res = gen.next(choice);
  }
  flush();
  for (const a of arrivals.values()) if (a.length >= 2) pairs.push([a[0], a[1]]);
}

async function main() {
  for (let s = 1; s <= GAMES; s++) await runOne(s);
  const n = recs.length;
  const avg = (f: (r: Rec) => number) => (recs.reduce((a, r) => a + f(r), 0) / n).toFixed(2);
  const pct = (f: (r: Rec) => boolean) => ((recs.filter(f).length / n) * 100).toFixed(1);
  const hist: Record<number, number> = {};
  for (const r of recs) hist[r.arrived] = (hist[r.arrived] ?? 0) + 1;
  console.log(`camps sampled: ${n}`);
  {
    const tot = pairs.length;
    const saved = pairs.map(([a, b]) => a + b);
    const mean = (saved.reduce((x, y) => x + y, 0) / tot);
    const over = (cap: number) => ((saved.filter((v) => v > cap).length / tot) * 100).toFixed(1);
    const lost = (cap: number) => (saved.reduce((x, v) => x + Math.max(0, v - cap), 0) / tot).toFixed(2);
    console.log(`PAIRS n=${tot}  ถ้าเก็บทุกเจมไม่ใช้เลย ค่าย2 จะมี avg ${mean.toFixed(2)}  max ${Math.max(...saved)}`);
    for (const cap of [14, 16, 18, 20, 24]) console.log(`   เพดาน ${cap}: ชนเพดาน ${over(cap)}% ของผู้เล่น, เจมหายเฉลี่ย ${lost(cap)}`);
    const h: Record<number, number> = {}; for (const v of saved) h[v] = (h[v] ?? 0) + 1;
    console.log('   การกระจายยอดรวม: ' + Object.keys(h).map(Number).sort((a, b) => a - b).map((k) => `${k}:${((h[k] / tot) * 100).toFixed(0)}%`).join(' '));
  }
  console.log(`gems arriving: avg ${avg((r) => r.arrived)}  min ${Math.min(...recs.map((r) => r.arrived))}  max ${Math.max(...recs.map((r) => r.arrived))}`);
  console.log('  distribution: ' + Object.keys(hist).map(Number).sort((a, b) => a - b).map((k) => `${k}g:${((hist[k] / n) * 100).toFixed(0)}%`).join('  '));
  console.log(`  items:    avg ${avg((r) => r.nItems)}  (spend ${avg((r) => r.spentItems)})`);
  console.log(`  upgrades: avg ${avg((r) => r.nUp)}  (spend ${avg((r) => r.nUp * GEMS_PER_UPGRADE)})`);
  console.log(`  VP:       avg ${avg((r) => r.nVp)}  (spend ${avg((r) => r.spentVp)})`);
  console.log(`  WASTED:   avg ${avg((r) => r.wasted)}  — camps wasting >=1 gem: ${pct((r) => r.wasted >= 1)}%`);
  console.log('');
  console.log('levers pulled in one camp (item / upgrade / VP):');
  for (const k of [0, 1, 2, 3]) console.log(`  ${k}: ${pct((r) => [r.nItems > 0, r.nUp > 0, r.nVp > 0].filter(Boolean).length === k)}%`);
  console.log('');
  console.log(`could afford an upgrade on arrival (>=${GEMS_PER_UPGRADE}): ${pct((r) => r.arrived >= GEMS_PER_UPGRADE)}%`);
  console.log(`bought item AND upgrade:  ${pct((r) => r.nItems > 0 && r.nUp > 0)}%`);
  console.log(`bought 2+ items:          ${pct((r) => r.nItems >= 2)}%`);
  console.log(`bought 2+ upgrades:       ${pct((r) => r.nUp >= 2)}%`);
  console.log(`bought nothing but items: ${pct((r) => r.nItems > 0 && r.nUp === 0 && r.nVp === 0)}%`);
  const a = (rs: Rec[], f: (r: Rec) => number) => (rs.reduce((x, r) => x + f(r), 0) / (rs.length || 1)).toFixed(2);
  const h0: Record<number, number> = {}, h1: Record<number, number> = {};
  for (const r of recs) { const h = r.camp === 0 ? h0 : h1; h[r.arrived] = (h[r.arrived] ?? 0) + 1; }
  console.log('');
  console.log('ARRIVAL_JSON ' + JSON.stringify({ camp1: h0, camp2: h1 }));
  for (const c of [0, 1]) {
    const rs = recs.filter((r) => r.camp === c);
    console.log(`camp ${c + 1}: n=${rs.length}  arrived ${a(rs, (r) => r.arrived)}  items ${a(rs, (r) => r.nItems)}  up ${a(rs, (r) => r.nUp)}  vp ${a(rs, (r) => r.nVp)}  wasted ${a(rs, (r) => r.wasted)}`);
  }
}
main();
