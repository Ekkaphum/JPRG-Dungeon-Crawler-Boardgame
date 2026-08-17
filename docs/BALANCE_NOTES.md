# Balance Notes — v0.3.0 "clock" ruleset

> Numbers from `npm run balance -- <games>` (see `tools/balance.ts`), 4 medium bots playing
> each other. Re-run and update this file whenever content numbers change.

## v0.3.0 "clock" ruleset — M8 balance sim (`npm run balance -- 1500`)

Fresh engine, fresh simulator (`tools/balance.ts` rewritten for the 24-slot clock model — the
old per-player-count loop is gone since v0.3.0 is 4-players-only, see PLAN_v0.3.0.md §3.3/§12).
4 medium bots playing each other, no human, no hard-bot coordination logic:

| Boss | Clear rate |
|---|---|
| Ragorath | 70.6% |
| Somnivar | 47.9% |
| Aurelius | 15.0% |

Overall win rate (clear all 3): **15.0%**. Aurelius armor broke at least once in only 9.9% of
games, and the log never recorded a single hit ≥25 dmg (a rough proxy for the §8 "weak point +
Blessing + 3-mana Meteor = 29 dmg" stacked combo) across 1500 games.

**Reading these numbers:** this tracks the design doc's own intent for the difficulty *curve*
(Ragorath = easy teaching boss, Somnivar = a real check, Aurelius = "ผ่านไม่ได้ถ้าไม่ร่วมมือ" — cannot
be cleared without real cooperation) but the *absolute* numbers are almost certainly a bot-skill
ceiling, not a ruleset problem: `src/bots/medium.ts`/`hard.ts` have no explicit "queue three players'
actions to land on the same clock slot" planning (see docs/10-v0.3.0-rulings.md and PLAN_v0.3.0.md
M7's own scope note) — the combo is the entire reason Aurelius's armor is designed to be hard to
break, and heuristic bots that only optimize their own next declare will rarely stumble into it by
chance. **Do not tune boss HP/armor down based on this run** — get real human playtesting first
(the design doc's own §11/§12 flag exactly this as an open risk, not a settled number). If a future
session adds real multi-turn combo planning to the bots, re-run and compare before touching content.

Lv2 skill numbers (`src/content/characters.ts`) are **not from the source document at all** — see
docs/10-v0.3.0-rulings.md §1. They're a first-pass extrapolation (~35–50% power over Lv1) purely so
the EXP system isn't dead weight; they have not been balance-tested independently of the above run.

---

## v0.3.0 follow-up tuning — 2026-08-10 (Counter/Trap redesign + armor-break threshold)

Two user-directed rule changes, each verified with `npm run balance -- 2000` (the simulator was
also fixed this round — it previously only archived the *last* battle's log, so every per-skill
stat silently described boss 3 only; all numbers below are from the fixed tool):

1. **Counter Attack** ⏱3→5, and the riposte now fires **immediately on every hit taken** during
   the window (no strike on Eric's own next turn — the window just ends). Fires even on a lethal
   hit, and rides `computeOutgoingPlayerDamage`, so Blessing/weak-point turn 12 into up to 19.
2. **Set Trap** redesigned: armed on one slot **inside the skill's own ⏱ window**, and a hit deals
   its damage plus a **dice-ladder roll** (same escalation as Quick Shot's weak point, separate
   ladder) to cancel the boss's declared move — no longer an automatic cancel.
3. Follow-up numbers pass: Set Trap damage now **ignores armor**, ⏱5→**4**, and Aurelius's
   armor-break threshold dropped from >15 to **>12** post-armor damage.

| Metric (2000 games, 4 medium bots) | before redesign | after redesign | after numbers pass |
|---|---|---|---|
| Overall win rate | 11.8% | 14.6% | **17.9%** |
| Ragorath clear | 69.2% | 69.6% | 71.4% |
| Somnivar clear | 48.4% | 50.5% | 55.5% |
| Aurelius clear | 11.8% | 14.6% | **17.9%** |
| Aurelius armor broke ≥1× | 7.2% | 8.6% | **13.6%** |
| Set Trap declares | — | 701 | **2,771** |
| Set Trap dmg/declare | — | 2.52 | 3.96 |
| Trap trigger rate when armed | — | 97.4% | 97.7% |
| Trap-cancel roll success | — | 34.8% | 37.6% |
| Counter windows / avg ripostes | — | 2084 / 0.47 | 2148 / 0.44 |

The medium bot's heuristic was also taught to aim traps at the boss's current slot and to skip
arming when nothing is declared yet (`src/bots/heuristics.ts`) — before that, bots armed traps
blind and 0 of them ever triggered, which would have made every trap number above meaningless.

---

## Set Trap slot validation — 2026-08-11 (bug fix, no content change)

The ⏱-window restriction from the v0.3.0.2 redesign was computed in two places. Bots read the correct
list (`options.trapSlots`), but the human decision panel offered `options.emptySlotsBelowMarker` —
*every* free slot below the marker — and `declareSkill` never validated what it was handed. Human
players could therefore arm traps anywhere on the clock, which is exactly the power v0.3.0.2 removed.

The window is now computed once in `legalTrapSlots()` (`src/engine/clock/skills.ts`), consumed by
both `buildDeclareOptions()` and the UI, and enforced in `declareSkill()`, which throws on anything
outside it. Covered by `tests/trapSlots.test.ts`.

**No re-tuning needed:** re-running `npm run balance -- 2000` after the fix reproduces the numbers
in the table above exactly (win 17.9% · Ragorath 71.4% · Somnivar 55.5% · Aurelius 17.9% · armor
broke 13.6% · Set Trap 2,771 declares at 3.96 dmg · trigger 97.7% · cancel 37.6%). Bots were always
playing legally, so the sim never exercised the bug — it only ever affected human play.

---

## Combo-timing awareness for medium/hard bots — 2026-08-11 (bot AI, no content change)

The M8 run above flagged the real cause of Aurelius's near-0% armor-break rate: bots scored only
their *own* pending action's immediate value, with no awareness of what a teammate had already
declared. Kit and Luna each top out well under Aurelius's >12-post-armor break threshold alone
(GAME_DESIGN_v0_3_0.md §9's own table) — the armor was *designed* to require timing weak point +
Blessing under a teammate's big hit, and heuristic bots that only look at their own turn will
essentially never stumble into that by chance (0 of 1500 games ever logged a ≥25 dmg hit).

Added `comboSynergyBonus()` (`src/bots/heuristics.ts`), applied to both medium and hard bots: reads
teammates' *already-declared* pending actions and the boss's *already-rolled* next move — all public
information per §4.4 ("เปิดเผยหมด") — and rewards Kit's QuickShot when it would open the weak point in
time for a pending Fireball/Meteor to land under it (and the boss's known next move won't clear it
first), and rewards Luna's Blessing when either the weak point is coming or a teammate's big hit is
about to land within Blessing's active window. Deliberately reads only what's already declared, never
plans a multi-turn setup that assumes a teammate will follow up — see the function's own doc comment.

Caught by its own test (`tests/comboSynergy.test.ts`) before this shipped: the Blessing timing
condition initially had the comparison direction backwards (Blessing turns on *at declare* and off
*at Luna's own resolve*, the opposite lifecycle from weak point, which turns on *at Kit's resolve*) —
the first balance run below is from the buggy version, the second from the fix.

| Metric (3000 games, 4 medium bots) | before (M8 baseline, scaled) | after — buggy Blessing direction | after — fixed |
|---|---|---|---|
| Overall win rate | 17.9% | 40.0% | **45.5%** |
| Ragorath clear | 71.4% | 88.5% | 90.5% |
| Somnivar clear | 55.5% | 82.3% | 86.2% |
| Aurelius clear | 17.9% | 40.0% | **45.5%** |
| Aurelius armor broke ≥1× | 13.6% | 28.4% | **31.0%** |
| ≥25 dmg hits (combo proxy) | 0 / 1500 games | 20 / 3000 | 22 / 3000 |
| Blessing declares | 2,771/2000 games (~1.4/game) | — | 32,073/3000 (~10.7/game) |

**Reading this:** the jump isn't just Aurelius — weak point and Blessing both buff *every* hit
during their window, not only the "big" one, so more purposeful timing raises damage output against
all three bosses, not only the armored one. Aurelius still clears less than half the time and is
still clearly the hardest fight, which matches the design doc's intent ("cannot be cleared without
real cooperation") better than a near-0% wall did. The combo proxy (≥25 dmg hits) is still rare in
absolute terms (~1 in 135 games) — bots line up the timing correctly now, but Liora still has to
actually declare a high-mana Meteor into that window, which this change doesn't force.

**Still not a reason to touch boss HP/armor.** These numbers describe heuristic bots with full
information, not humans — a real table won't always have this much cross-player attention either.
Get human playtesting before changing content numbers off of any bot-sim run, per the M8 note above.

---

## Score condition rebalance — 2026-08-11 (Luna/Liora, one change kept, two reverted)

`tools/balance.ts` previously only reported each character's *total* score, which can't tell a
weak condition apart from a strong one landing at the same average. Extended it to report every
condition's fire rate and points **per won game** specifically (`scoreLog` after `state.gameOver`),
since scoring only ever decides a winner in a game the party actually wins — an all-games figure
gets diluted by the ~55% of games that end in a loss at Aurelius. Also caught and fixed a real bug
while building this: `scoring.ts` hardcoded point values as literals separate from
`CHARACTERS[charId].score[n].points` (what the UI actually displays), so the two could drift.
Added `scorePoints(conditionId)` in `@content/characters` as the one source of truth; `scoring.ts`
now reads through it everywhere.

**Baseline (post-item-3 cooperation fix, before any score changes), 4000 games:**

| Character | pts/win |
|---|---|
| Kit | 8.9 |
| Liora | 8.6 |
| Eric | 7.9 |
| Luna | 7.5 |

Spread 1.4 pts — tighter than the original code-reading diagnosis (written before any sim data
existed) assumed. Per-condition breakdown showed the real story:

| Condition | Char | Share of char total |
|---|---|---|
| kit1 (weak point) | Kit | 39% |
| kit3 (5+ attacks) | Kit | 35% |
| vera3 (never died) | Liora | 49% |
| luna3 (nobody died) | Luna | 49% |
| matt2 (Last Shot) | Eric | 36% |
| vera2 (Last Shot w/ Meteor) | Liora | 14% |
| luna1 (Heal ≥1hp) | Luna | 2% |

**Tried and reverted — vera1 (15→13 dmg threshold) and vera2 (Meteor-only → Fireball-or-Meteor):**
the original diagnosis read Liora's conditions as too narrow, but by the time this was tested
(post-item-3) she was already the *2nd-highest* scorer, not a weak one. Broadening vera2 alone (kept
at 4pts) pushed her fire rate from 0.31→0.73/win and her total to **9.93** — highest of all four,
worse spread than baseline. Cutting the point premium to 3 (matching matt2, since Fireball+Meteor
is *all* of Liora's attack options — no longer a rare subset once broadened) still left her at
**9.41**. vera1's threshold change had negligible effect either way (14–16% share regardless).
Reverted both to original values rather than force through a change the data said was wrong.

**Kept — luna1 (Heal ≥1hp), 1→3 points:** the actual outlier was Luna, not Liora, and her weakest
condition was luna1, contributing under 3% of her total. Bots don't pick Heal for its point value —
`estimateChoiceValue`'s heal case is purely HP-need-driven, and `scoreConditionBonus` (hard-bot-only)
doesn't touch luna1 at all — so its ~0.15/win fire rate is a fixed multiplier the AI won't chase no
matter the point value; only the payout scales. Tested 1→2 (+0.10 pts/win, too small to matter) then
1→3 before settling.

**Final result, 5000 games:**

| Character | pts/win | vs. baseline |
|---|---|---|
| Kit | 8.88 | ~unchanged |
| Liora | 8.53 | ~unchanged |
| Eric | 7.79 | ~unchanged |
| Luna | 7.70 | **+0.20** |

Spread 1.18 (down from 1.4), Eric and Luna now close to tied at the bottom instead of Luna alone.
Kit's lead (driven by kit1+kit3, both a direct result of item 3's comboSynergyBonus rewarding
QuickShot) is a separate question from what this pass was scoped to — not touched here.

Covered by `tests/scoreConditions.test.ts`, which had zero coverage of `onPlayerDealtDamage`,
`onWeakPointOpened`, `onTrapTriggered`, or `onHealResolved` before this pass — none of the 12 score
conditions' exact thresholds or point values were pinned by any test.

---

## Dax + Mira — a 6-character roster for 4 players (2026-08-11)

A 4-player table drafting from exactly 4 characters has no real choice: whoever picks last just
gets whatever's left, and GAME_DESIGN_v0_3_0.md §3.1 itself frames pick order as "สิ่งที่มีค่าจริง" (the
thing that actually matters) — a framing that only holds if there's something to actually choose
between. `runDraft()` (setup.ts) already iterates `CHAR_IDS` generically, so making the pool bigger
than the table needed zero engine changes — every pick, including the last, is now a real decision
among 3 remaining options.

**Design constraint:** both new characters use only skill kinds the engine already treats
generically (attack, attackRoll, attackMana, heal, buffParty, buffMana, buffCounter) — no new
mechanic, no engine rule change. `attackGated`'s exact trigger (HP<=5) is hardcoded to Berserk
specifically and wasn't reused.

- **Dax (Duelist, 11 HP)** — Flurry (attack, 3-hit), Riposte (buffCounter, a lighter/cheaper parry
  than Eric's Counter), Focus (attackRoll, a second weak-point opener alongside Kit's Quick Shot so
  the party isn't dead in the water without Kit at the table).
- **Mira (Elementalist, 9 HP)** — FrostBolt (attackMana, cheaper/lower-scaling than Liora's
  Fireball), ArcaneWard (buffMana, matches Liora's ManaCharge numbers), MendingWind (heal, a notch
  weaker/slower than Luna's Heal) — a "battle medic" that can cover for a missing healer or mage
  without being strictly better than either specialist.

**Portrait art:** no way to source painted portraits matching the original 4. `charSigils.ts`
generates an SVG "sigil card" instead — a gradient panel in the class color with a simple geometric
emblem (crossed blades for Dax, a frost shard for Mira), at the exact 480x720 aspect ratio of the
real cards, encoded as a `data:` URI so every existing `charImageUrl()` call site works unchanged.
Deliberately reads as its own design choice rather than a broken attempt at the painted style.

### Real bugs this surfaced (not just new-character plumbing)

Adding a second character that shares a skill *kind* with an existing one exposed three latent
attribution bugs — each would have silently misattributed or dropped a real player's score/log
entry, not just for Dax/Mira:

1. **`onWeakPointOpened`** hardcoded `conditionId: 'kit1'` regardless of who opened it. Dax's Focus
   resolves through the same generic attackRoll-success path as Kit's Quick Shot — his weak-point
   opens would have scored as `kit1` (or, worse, been silently invisible to Dax's own UI, which
   filters by character). Now looks up the condition by the opener's actual character.
2. **`onHealResolved`** had the identical bug with `'luna1'` — Mira's Mending Wind vs Luna's Heal.
3. **The counter-riposte code** (`dealDamageToFighterFromBoss`, skills.ts) always logged
   `skillId: 'CounterAttack'`, regardless of which buffCounter skill actually fired. Dax's ripostes
   would have shown as "Counter Attack" in the log/UI, and a Riposte-specific score condition
   (dax2) would have been permanently unreachable. Now derived from the fighter's own kit.
4. **`playerByChar(state, 'Luna')!.id`** in `onBattleEndScoring` assumed a player with charId
   'Luna' always exists — true when the roster was fixed at exactly 4, false the instant Luna can
   go undrafted. This one **would have crashed a real game** the moment the party won a battle
   without Luna at the table and nobody died. Caught by a dedicated test before it shipped, then
   confirmed safe by 3000 random-draft balance-sim games (which naturally exercise "Luna not
   drafted" constantly) completing without a single exception.
5. **Multi-hit attacks were hardcoded to `skillId === 'TwinShot'`** in both the engine
   (`resolveFighterPending`, skills.ts) and the bot's value estimate (`estimateChoiceValue`,
   heuristics.ts) — Dax's Flurry (also multi-hit) would have resolved as a single hit for 1/3 its
   intended damage, and bots would have valued it the same way, never picking it over worse
   alternatives. Both now key off whether `secondary` (hit count) is set at all, not the skill name.

None of these were "new character" bugs in the sense of needing new code paths — they were always
latent in the original 4-character implementation, just unreachable because there was only ever one
character per skill kind. Worth remembering next time any skill kind gets a second user.

### Balance: three tuning attempts on Mira, one kept

3000-game sim, random draft (so not every character is in every game), score conditions/win only:

| Metric | Eric | Kit | Liora | Luna | Dax | Mira |
|---|---|---|---|---|---|---|
| pts/win (first pass, original mira3) | 5.31 | 7.82 | 5.39 | 6.61 | 5.33 | **0.46** |

Dax landed in a reasonable range immediately (his kit is structurally close to existing patterns).
Mira did not — three things were tried, in order:

1. **mira3 `>=2 mana banked` → `>=1`.** No real effect (0.01 → 0.05 fires/win). Root cause:
   attackMana's value estimate always rewards spending *more* mana with nothing modeling a reason
   to hold back, so bots almost never end a battle with any mana banked regardless of the bar —
   this isn't Mira-specific, it's inherent to how any mana-spender bot behaves under the current
   heuristic.
2. **mira3 replaced entirely**, `>=N mana` → `never died this battle` (same shape as vera3, which
   already performs well at ~49% of Liora's total). Fires 0.24/win — much better, but still far
   below vera3's 1.30/win despite Mira having comparable HP (9 vs Liora's 8), pointing at a
   defensive gap elsewhere in her kit.
3. **ArcaneWard's damage reduction raised to match Liora's ManaCharge** (2/4 → 3/5), and
   **MendingWind sped up to Luna's Heal's ⏱4** (from ⏱5, keeping a lower heal amount for
   differentiation) since its slower speed was compounding with a smaller heal to make it
   strictly worse in every comparison (0.06 fires/win).

| Metric (after all three) | Eric | Kit | Liora | Luna | Dax | Mira |
|---|---|---|---|---|---|---|
| pts/win | 5.20 | 7.92 | 5.40 | 6.59 | 5.42 | **0.99** |

Better (0.46 → 0.99) but still a clear outlier next to everyone else's 5-8 range. **Stopping here
rather than continuing to chase numbers**: further gains would need either character-specific bot
heuristics (comboSynergyBonus/scoreConditionBonus have dedicated logic for Eric/Kit/Liora/Luna, none
for Dax/Mira — a meaningfully larger task than a content pass) or actual human playtesting, which
is what this whole ruleset has been waiting on since M8. Flagging honestly rather than declaring
Mira "balanced" when the data clearly says otherwise.

---

## Equal-start rebalance — 2026-08-13 (v0.3.1: action-count fix, ⏱ realignment, Liora durability, score conditions)

Starting problem: staggered hero start slots (Eric/Liora 20, Luna 22, Kit 23) meant each pawn got a
different number of real (resolved) actions per battle, and the total was low across the board —
measured at **~3.3 real actions/player/battle** (declares − 1, since a battle's first declare never
resolves — §4.3), with **25% of player-battles getting ≤2 real actions**. Too little to feel the
dice ladder (§5.2) or cross-player combos (§4.4) land more than once, if at all.

### False starts, ruled out by sim before landing on the final approach

- **Lowering ⏱ across the board** (all skill times ×0.7 or −1) makes it *worse*, not better: a
  stronger party kills the boss faster, shortening the battle and cutting actions further (3.3 →
  2.6-2.7 real actions). Action count is capped by battle *duration*, not by per-skill cost alone.
- **Boss HP alone** (⏱ unchanged) plateaus at ~4.4 real actions no matter how high — the 24-slot
  clock is a hard ceiling regardless of how tanky the boss is.
- **An initial equal-start sim run showed a spurious 100% win rate at unchanged boss HP** — traced
  to a bug in the *scratch test script*, not the game: it placed the boss pawn on slot 24, but
  `runClockBattle()` in `src/engine/clock/walk.ts` decrements the marker as its first statement
  (`battle.marker -= 1`), so slot 24 is never visited and the boss never acted. The real engine
  behavior (all pawns including the boss at slot 23, ties resolve player-before-boss per §4.1) needs
  much less HP compensation than that broken run suggested.
- **Boss declaring one tick before the party** (players at 22, boss at 23) was tried on the theory
  that it preserves §4.4's "read the boss, then decide" pattern. Sim showed it's *much* harder (win
  17.5% vs. 42.8% for equal placement) — not adopted.

### Final change set (v0.3.1), verified with `npm run balance -- 2000`

| | before | after |
|---|---|---|
| Win rate | 43.8% | **57.3%** |
| Ragorath / Somnivar / Aurelius clear | 89% / 76% / 44% | **89% / 83% / 57%** |
| Real actions/player/battle | 3.3 | **~3.9** (measured in scratch sim; `balance.ts` doesn't report this directly) |
| Liora deaths/battle | 0.50 | **~0.37-0.42** (scratch sim; boss-HP% sweep) |
| Score spread (max − min avg total, won games) | 0.6-0.7 | **~2.9** ⚠️ regression, see Known Issues |

Changes, each layered and re-verified in combination (not just standalone):

1. **All 4 heroes start at slot 23** (`src/content/characters.ts`), boss also starts at slot 23
   (`src/content/bosses3.ts`) — was Eric/Liora 20, Kit 23, Luna 22, boss 22. No engine change needed:
   §4.1's existing player-before-boss tiebreak (`resolveOrderCompare` in `walk.ts`) already does the
   right thing once everyone shares a slot.
2. **Boss HP +20%** on all three bosses (Ragorath 76→91, Somnivar 80→96, Aurelius 88→106) —
   compensates for the stronger, more synchronized party the equal start produces. +15% and +25%
   were also swept; +20% was chosen over +15% because it still measurably grew the action count
   (+15% landed back at baseline's 3.3, no net gain) and over +25% because win rate dropped too far
   (43%, no better than the pre-change baseline the user wanted to move away from).
3. **⏱ realignment** to match the stated character concept (Kit fastest, Eric/Luna medium, Liora
   slowest) — measured by declares/battle *excluding* non-attacking skills (ManaCharge/ArcaneWard),
   per the user's framing that a skill producing no effect of its own shouldn't count as "acting":
   - Eric: Counter Attack ⏱5→4 (undoes v0.3.0.2's ⏱3→5 bump, which had made Eric the *slowest* of the
     four — the opposite of "medium speed, attack-leaning" per concept).
   - Kit: Twin Shot ⏱5→4. **Quick Shot was NOT changed** — an earlier attempt at ⏱3→2 was tested and
     reverted (see "Rejected" below).
   - Luna: Smite ⏱3→4, damage 4→6 (lv2 6→8) — raised alongside the ⏱ bump so it stays worth casting.
   - Liora: **left untouched** (Fireball ⏱3, Meteor ⏱7, ManaCharge ⏱2) — see rationale below.
   - Result (⏱ avg excluding ManaCharge): Kit 3.67 < Luna 4.00 < Eric 4.33 < Liora 5.00 (Fireball+Meteor
     only) — matches the concept order without touching a single Liora number.
4. **Hero HP**: Liora 8→11 (revive 4→6), Kit 12→13 (revive 6→7), Luna 12→13 (revive 6→7). Eric
   untouched — his HP is load-bearing for Berserk's `HP≤5` gate and matt3's `HP<5` score condition.
   Targeted at Liora specifically: at 8 HP she died to nearly every boss's single hardest hit even
   with ManaCharge's −3 reduction active (Ragorath Frenzy 10+Rage, Somnivar Nightmare 11, Aurelius
   Procession 12 — all lethal from full HP regardless of the shield). At 11 HP, ManaCharge's
   reduction actually matters for the first time. Measured death rate 0.50 → 0.37-0.42/battle
   (varies with the final boss-HP%; see the two-step process below).
5. **vera1 threshold 15 → 14 damage.** A fully-charged 3-mana Fireball (5 base + 3×3 = 14, unchanged)
   now qualifies on its own instead of needing Meteor or an ally buff. Confirmed near-zero balance
   impact — this exact threshold change (15→13, more aggressive than 15→14) was tried standalone on
   2026-08-11 and reverted for being negligible either way (14-16% share regardless); re-confirmed
   on today's code before relying on it again.
6. **vera2 broadened from "Last Shot with Meteor" to "Last Shot with any skill," points cut 4→3.**
   This exact broadening (Meteor-only → Fireball-or-Meteor, since those are Liora's only two attack
   skills) was tried standalone on 2026-08-11 and reverted for overshooting Liora to the highest
   scorer even after halving the point premium (9.4-9.9 vs. baseline 8.6). **Re-tested on today's
   code before landing it this time — the standalone result reproduces exactly**: fire rate
   0.30→0.71/win, Liora 8.6→9.8, spread 0.6→2.0, even at 4 points. Points 4→3 helps some (Liora 9.8→
   ~9.4 in isolated testing) but the real driver of the overshoot turned out to be something else —
   see Known Issues below. Landed anyway as part of this larger pass per explicit user direction;
   **flagged as still-open, not resolved**.

### Rejected during this pass

- **Quick Shot ⏱3→2, damage 4→3** (attempted to make Kit unambiguously fastest by his numbers, not
  just by the "acting only" framing). Sim showed this makes Kit's score run away: kit1 ("weak point
  opened") and kit3 ("attacked 5+ times") both scale directly with attack frequency, so firing twice
  as often nearly doubled both — Kit's total went from in-range (~8.5) to **11.6 pts/win, clear
  outlier**. Lowering vera2's points (tested down to 1) did not fix this, because Kit was the actual
  outlier, not Liora — see Known Issues. **Quick Shot reverted to its shipped ⏱3/dmg4.**
- **Boss made easier on purpose** (bossHP as low as −15% of the *already +20%'d* baseline, i.e. well
  below the original numbers), on the theory that a near-guaranteed win would shift the table's
  focus from "beat the boss" to "beat each other." Measured the opposite: at 98.9% win rate, **Liora
  won 64% of games and Kit won 2%** — worse fairness than at any harder setting tested. Cause: Kit's
  and Eric's score conditions are attack-count-gated (kit3 needs 5+ hits; matt2/vera2 are one-shot
  Last-Shot bonuses that don't care how short the battle was), so a fast kill starves the
  count-gated conditions while leaving the length-independent ones untouched. **Do not make bosses
  easier without first decoupling score conditions from battle length** — see Known Issues.
- **ManaCharge ⏱2→4** (an earlier attempt to slow Liora down structurally). Reverted per user
  feedback: ManaCharge produces no effect of its own (no damage, no heal, no party buff — just mana
  + a self-shield), so its low ⏱ cost is thematically correct and shouldn't be read as "Liora acts
  fast." The "acting only" declare count (excluding ManaCharge/ArcaneWard) already ranks her
  slowest without touching this number.
- **Fireball ⏱3→4 with a damage buff** (5→7 base). Would have let Fireball's fully-charged hit (16
  dmg at the proposed numbers) both exceed the old vera1 threshold on its own *and* out-efficiency
  Meteor per-⏱ (16/⏱4 = 4.0 vs. Meteor's 22/⏱7 = 3.14) — undermining Meteor's reason to exist.
  Reverted before landing; vera1's threshold was lowered to 14 instead, which lets the *unbuffed*
  Fireball reach the same design goal (a fully-charged basic attack means something) without the
  side effect.

### Known issues — explicitly not resolved this pass

1. **Liora still wins too often.** Win-share sim (bossHP+20%, the shipped config): Eric 20%, Kit 17%,
   **Liora 43%**, Luna 20% — should be ~25% each if fair. Score spread 0.6-0.7 → **2.9-3.3** across
   every boss-HP level tested (+15/20/25%), meaning the equal-start change itself (not boss HP) is
   the driver — Liora benefited most from moving to slot 23 since she started furthest back (20)
   before. Lowering vera2's points (tested 4→3→2→1) barely moves her total and **never closes the
   spread**, confirming vera2 isn't the real cause; vera3 ("never died," now firing more often
   thanks to her HP buff) is the more likely candidate but wasn't isolated and tested this pass.
   > ✅ **Resolved in v0.3.7-v0.3.8.** The diagnosis above was right on both counts: `vera3` was
   > the culprit and `vera2`'s point value was not. `vera3` now additionally requires her to have
   > landed a Meteor, `vera2` became a charged-cast condition, and Last Shot was lifted out of her
   > sheet into a bonus every character shares. Measured after: **Liora 20.1%** win share (hard
   > bots), spread 32.1pp → 9.9pp.
2. **Somnivar's ⏱5+ tax lost half its reach.** The tax (`applySomnivarTax()`,
   `src/engine/clock/skills.ts`) used to catch Berserk, Twin Shot, Counter Attack, and Meteor.
   Twin Shot and Counter Attack both moved to ⏱4 in this pass (see change #3 above) and now dodge
   it — only Berserk and Meteor still get taxed. Somnivar's "forces you into small actions" identity
   (§9) is measurably weaker. Fix would be lowering the tax threshold to ⏱4+ in
   `applySomnivarTax()`, not yet tested.
   > ✅ **Resolved in v0.3.11** — though not the way this note guessed. A flat "+2 at ⏱4+" was
   > tried first and was catastrophic: hard win rate 65.9% → **29.3%**. What shipped is a *scaled*
   > tax (+1 at ⏱4-5, +2 at ⏱6+) reaching 8 of 16 skills (~46% of declares, up from 7.8%), with
   > **Somnivar HP 96 → 76** compensating so his clear rate lands within 1.1pp of where it was.
3. **Luna's three skills are now all ⏱4** (Heal/Blessing already were; Smite moved 3→4 this pass) —
   no internal fast/slow choice within her own kit anymore. Bot-play damage output stays very low
   (~2/battle vs. everyone else's 20-38) because Blessing dominates her declares; unclear whether
   this is a real design gap or just medium-bot heuristics not modeling Smite's payoff — needs human
   playtesting to distinguish (same caveat as every bot-only number in this file).
   > 🟡 **Half resolved.** The ⏱ complaint is gone — the v0.3.3 kit rebuild gave Luna a ⏱2 common
   > attack and moved Heal to ⏱3, so she now reads ⏱2/3/4/4. **The low-damage half is still true:**
   > Blessing continues to dominate her declares under bot play, and it is still unresolved whether
   > that is a design gap or a bot artefact. Carried forward as BACKLOG §10.
4. **Easier bosses make the score race *less* fair, not more**, because half the score conditions
   are attack-count-gated and half are length-independent (see "Rejected" above). If boss difficulty
   is revisited in either direction, re-run the win-share-by-character check, not just win rate.

### Process note for future sim work in this repo

Two of this session's sim runs produced actively misleading numbers before the real result was
found: a scratch script placing a pawn on a clock slot that `runClockBattle()`'s decrement-first
loop never visits (silently makes that pawn never act — no error, just wrong data), and reusing a
"tried and reverted" change without re-testing on current code (the codebase had moved since
2026-08-11; re-running confirmed the old finding still held, but that had to be checked, not
assumed). Sanity-check scratch harnesses against a known invariant (e.g., "the boss should declare
at least once per battle") before trusting their output, and re-verify old BALANCE_NOTES.md findings
on current code rather than citing them cold.

---

## Role template + Eric rework — 2026-08-13 (v0.3.2: ①②③ skill structure, Berserk folded into Slash, new Guard)

User-directed structural pass. The premise (GAME_DESIGN.md §8.0): every character's three skills
should fill the same three roles — ① attack, ② support (never a direct attack), ③ signature — so a
player can read any other player's sheet by position instead of by reading nine cards. Checking the
existing roster against it found the template already described **3 of the 4 characters exactly**,
with zero number changes: Kit (TwinShot/QuickShot/SetTrap), Liora (Fireball/ManaCharge/Meteor), Luna
(Smite/Blessing/Heal). Only Eric broke it — Slash *and* Berserk both sit in slot ①, leaving slot ②
empty. So the whole content change is one character.

### What shipped

1. **Berserk folded into Slash** as a damage tier (`attackGated` re-defined: `primary` = normal
   damage, `secondary` = damage while HP ≤ 5, still checked at *resolve*). The declare-time gate is
   gone — Slash is always legal. A Luna heal arriving mid-flight now *downgrades* the hit 11 → 6
   instead of wasting the action outright. Rationale and the §5.5 knock-on in docs/RULINGS.md §7.1.
   - Supporting datum: pre-change sim had Berserk declared **425 times out of ~20,000 Eric turns**,
     for **2.22 damage per declare** against a printed 11 — roughly **80% of declared Berserks were
     being wasted**. It was very nearly a dead card already.
   - Slash's `secondary` must stay > 10 forever: `matt1` scores "more than 10 damage in one hit".
     Pinned by a test.
2. **Guard** — new skill, new `SkillKind`, Eric's slot ②. ⏱5. Redirects all damage aimed at one ally
   onto Eric, reduced by 4, and gives that ally +3 attack, until Eric's next turn. State lives on
   `battle.guard` (same shape as `partyBuff`: read from the ward's side, lifetime owned by the
   guardian). Full edge-case rulings in docs/RULINGS.md §7.2.
3. **`skills` arrays reordered** to ①②③ on all six characters. This is cosmetic to the engine but
   does shift bot tie-breaks slightly, so a small sim delta is expected independent of the content.
4. **`bossMoveTargets()` extracted** (`bossAI.ts`) — the boss's target selection is now one function
   that both the boss resolvers and the bots' Guard heuristic read. Deliberately *not* duplicated
   into the bot: the Set Trap slot bug (see 2026-08-11 above) came from exactly that pattern.

### The two findings that forced Guard's final shape

Guard v1 was a pure redirect — no mitigation, no buff. It dropped win rate **57.3% → 16.7%**. Fixing
it exposed two things worth keeping written down, because both generalize past this one card:

**1. Redirecting damage is not reducing damage.** It concentrates the same total onto one 16 HP body
instead of spreading it across four pools, so it *killed Eric more often than it saved anyone*:
`luna3` ("nobody died") fell 0.94 → 0.54 fires/game and total boss damage dealt went **up**
(165,402 → 169,498 over 2000 games). A redirect has to carry mitigation or it is a net loss.

**2. A slot-② skill that produces no damage cannot pay its own ⏱ in this ruleset.** §10's budget
gives the party ~105-110 usable damage against 91-106 HP bosses — there is no slack for pure
mitigation. Every *other* character's slot ② feeds the damage economy (Quick Shot attacks while
opening the weak point, Blessing multiplies the party, ManaCharge banks damage for later). Eric's
was the only one producing nothing, which cost the party ~11 damage/battle it does not have. The
+3 ward buff is what makes the card viable, and it states the Knight fantasy mechanically: the ally
you are covering can swing freely.

### Measured, layer by layer (`npm run balance`, 2000 games each unless noted)

| Guard version | Win rate | Note |
|---|---|---|
| v0.3.1 baseline (no Guard) | **57.3%** | Eric = Slash + Berserk + Counter |
| pure redirect | 16.7% | luna3 0.94→0.54, boss damage *rose*, Guard declared on 45% of Eric's turns |
| + bot valuation lowered | 25.1% | still 32% usage |
| + damage reduction 4 | 28.8% | luna3 back to 0.74, boss damage −11% |
| + ward attack buff 3 | 44.8% | Guard now pays its ⏱ — but crowds out Counter Attack (3,332 → 699 declares) |
| + bot guards only to prevent a **death**, not a hit | **53.9%** | usage down to a situational 17% |
| **final, 3000 games** | **54.4%** | shipped |

Also tried and rejected: **ward buff 2 instead of 3** — moved Liora only 12.3 → 11.9 pts/win while
costing 2.4pp of win rate. Not worth it; Liora's dominance is not a Guard problem (see below).

### Final vs. v0.3.1

| | v0.3.1 | v0.3.2 |
|---|---|---|
| Win rate | 57.3% | **54.4%** |
| Ragorath / Somnivar / Aurelius | 89 / 83 / 57% | **92 / 77 / 54%** |
| Aurelius armor broke ≥1× | 39.6% | **60.4%** |
| Hits ≥25 dmg (combo proxy) | 20 | **263** |
| Eric / Kit / Liora / Luna pts/win | 7.5 / 8.7 / 10.4 / 9.0 | 6.9 / 9.6 / 12.3 / 9.9 |

**Reading this.** The ~3pp win-rate drop is the *price of the design*, not a regression to fix: Eric
traded an attack card for a support card, so the party has less raw damage on purpose. It is still
well above the pre-v0.3.1 baseline of 43.8%. The numbers that improved are the ones §8/§9 have been
asking about since M8 — armor breaks and stacked-combo hits both jumped sharply, because Guard's
ward buff pushes hits over Aurelius's >12-post-armor threshold that previously only Liora and a fully
buffed Eric could clear.

**Somnivar's 83 → 77% is intended.** Guard at ⏱5 lands in the ⏱≥5 bracket Somnivar taxes — exactly
the bracket Berserk vacated by being folded into Slash's ⏱4. The tax still catches two cards, and it
now catches a card Eric wants to use *reactively*, which is a sharper version of Somnivar's
"forces you into small actions" identity than taxing a card he rarely declared. Known Issue #2 from
the v0.3.1 pass is partially addressed by this, not worsened.

### Known issues — explicitly not resolved this pass

1. **Liora's lead got worse, and Guard is not the cause.** Score spread (won games) 2.9 → **5.4**:
   Liora 10.4 → 12.3, Eric 7.5 → 6.9. Guard's +3 lands hardest on her because her hits are the
   biggest and `vera1` is a *threshold* condition (">= 14"), so +3 tips more Fireballs over the bar.
   But lowering the buff barely moved her (tested above), which points back at the same root the
   v0.3.1 pass flagged and did not isolate: `vera3` and her threshold conditions, not any one buff.
   **Fix Liora's score conditions, not Guard.**
   > ✅ **Resolved in v0.3.7-v0.3.8**, and the instruction in bold turned out to be exactly right:
   > Guard was never touched for balance, her score conditions were rebuilt instead. **Liora 20.1%.**
2. **Eric's score conditions were written for a two-attack Eric.** `matt1` (>10 damage) and `matt2`
   (Last Shot) both measure attacking, and he now has one attack card — `matt2` fell 0.75 → 0.61
   fires/game. Every other character has a condition rewarding their slot-② role (kit1 weak point,
   luna1/luna2 heal and Blessing); Eric has none for Guard. By §8.0's own logic he should. Left
   alone deliberately — that is a scoring-system change, not a skill change, and it should be
   designed against human playtest data rather than bot data.
   > ✅ **Resolved in v0.3.7.** `matt2` is now "Guard absorbs a hit aimed at an ally" (2 pts, per
   > occurrence), scored on the redirect itself. Eric finally has a condition paying for his slot-②
   > role, exactly as §8.0's logic demanded — worth **26%** of his score in competitive play.
3. **Counter Attack is used far less** (3,332 → 1,720 declares) now that Eric has a second defensive
   option. Damage per declare is unchanged (5.38 → 5.05), so the card is as good as it was; it is
   simply sharing the defensive slot. Worth watching that slot ② does not permanently overshadow
   slot ③ — if it does, that is the template failing on its own terms.
4. **Guard may blunt Aurelius's catch-up mechanic.** "Procession" targets the score leader; Eric can
   now stand in front of them every time, which is the opposite of §9's "the better you help, the
   more you become the target". Not observed as a problem in sim, but sim bots do not play the
   score race the way a real table does. Logged as §11 risk #9 with two prepared levers (1 use per
   battle, or a cap on absorbed damage).
   > 🟡 **Half addressed in v0.3.11.** Procession now pierces Blessing, so party-wide mitigation no
   > longer blunts the catch-up hit (6.9 → 9.1 damage landed). **Guard still redirects it** — that
   > was deliberate, since Guard and personal shields are meant to stay real answers to it. The
   > original concern therefore stands, still logged as §11 risk #9.

All of these are bot numbers. Nothing here has been in front of a human table yet — the same caveat
that applies to every figure in this file.
