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
