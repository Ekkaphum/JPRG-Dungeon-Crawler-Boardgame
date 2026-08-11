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
   the window (no strike on Matt's own next turn — the window just ends). Fires even on a lethal
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

The ⏱-window restriction from the v0.4.2 redesign was computed in two places. Bots read the correct
list (`options.trapSlots`), but the human decision panel offered `options.emptySlotsBelowMarker` —
*every* free slot below the marker — and `declareSkill` never validated what it was handed. Human
players could therefore arm traps anywhere on the clock, which is exactly the power v0.4.2 removed.

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
absolute terms (~1 in 135 games) — bots line up the timing correctly now, but Vera still has to
actually declare a high-mana Meteor into that window, which this change doesn't force.

**Still not a reason to touch boss HP/armor.** These numbers describe heuristic bots with full
information, not humans — a real table won't always have this much cross-player attention either.
Get human playtesting before changing content numbers off of any bot-sim run, per the M8 note above.

---

## Score condition rebalance — 2026-08-11 (Luna/Vera, one change kept, two reverted)

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
| Vera | 8.6 |
| Matt | 7.9 |
| Luna | 7.5 |

Spread 1.4 pts — tighter than the original code-reading diagnosis (written before any sim data
existed) assumed. Per-condition breakdown showed the real story:

| Condition | Char | Share of char total |
|---|---|---|
| kit1 (weak point) | Kit | 39% |
| kit3 (5+ attacks) | Kit | 35% |
| vera3 (never died) | Vera | 49% |
| luna3 (nobody died) | Luna | 49% |
| matt2 (Last Shot) | Matt | 36% |
| vera2 (Last Shot w/ Meteor) | Vera | 14% |
| luna1 (Heal ≥1hp) | Luna | 2% |

**Tried and reverted — vera1 (15→13 dmg threshold) and vera2 (Meteor-only → Fireball-or-Meteor):**
the original diagnosis read Vera's conditions as too narrow, but by the time this was tested
(post-item-3) she was already the *2nd-highest* scorer, not a weak one. Broadening vera2 alone (kept
at 4pts) pushed her fire rate from 0.31→0.73/win and her total to **9.93** — highest of all four,
worse spread than baseline. Cutting the point premium to 3 (matching matt2, since Fireball+Meteor
is *all* of Vera's attack options — no longer a rare subset once broadened) still left her at
**9.41**. vera1's threshold change had negligible effect either way (14–16% share regardless).
Reverted both to original values rather than force through a change the data said was wrong.

**Kept — luna1 (Heal ≥1hp), 1→3 points:** the actual outlier was Luna, not Vera, and her weakest
condition was luna1, contributing under 3% of her total. Bots don't pick Heal for its point value —
`estimateChoiceValue`'s heal case is purely HP-need-driven, and `scoreConditionBonus` (hard-bot-only)
doesn't touch luna1 at all — so its ~0.15/win fire rate is a fixed multiplier the AI won't chase no
matter the point value; only the payout scales. Tested 1→2 (+0.10 pts/win, too small to matter) then
1→3 before settling.

**Final result, 5000 games:**

| Character | pts/win | vs. baseline |
|---|---|---|
| Kit | 8.88 | ~unchanged |
| Vera | 8.53 | ~unchanged |
| Matt | 7.79 | ~unchanged |
| Luna | 7.70 | **+0.20** |

Spread 1.18 (down from 1.4), Matt and Luna now close to tied at the bottom instead of Luna alone.
Kit's lead (driven by kit1+kit3, both a direct result of item 3's comboSynergyBonus rewarding
QuickShot) is a separate question from what this pass was scoped to — not touched here.

Covered by `tests/scoreConditions.test.ts`, which had zero coverage of `onPlayerDealtDamage`,
`onWeakPointOpened`, `onTrapTriggered`, or `onHealResolved` before this pass — none of the 12 score
conditions' exact thresholds or point values were pinned by any test.
