# Changelog

Human-readable log of changes to this project, newest first. Add an entry here whenever you commit — whether the change was made by Claude Code or by hand — so anyone picking up the project can see what happened without digging through `git log`.

## 2026-08-12

- **Redesign main menu with fantasy clock cathedral** (`b4ff1b8`) — new "clock cathedral" background art and a full visual rework of the main menu (sanctum card, moon sigil, kicker/divider text, restyled buttons with a primary "New Game" state). UI-only, no gameplay logic changed.
- **Tighten Heal scoring and action validation** (`d3ac061`) — Luna may Heal herself and restore HP normally, but self-healing does not award her `luna1` “heal a friend” score. Heal can only target someone alive at declaration time; if that legal target dies before the delayed Heal resolves, the action still fizzles and is wasted under §5.5. Mana spending is now validated at the engine boundary as a whole number from 0–3 that cannot exceed the caster's current mana, rejecting negative, fractional, `NaN`, and over-cap values.
- **Set Trap: roll before it does anything, not damage-then-roll-for-bonus** (`24304f8`) — fixed roll ordering so the trap's roll happens before its effects instead of after damage.
- **Fix 9 critical engine bugs** (`27695e0`) — party wipe, slot 0, turn order, Last Shot, validation, AoE+Counter.

## 2026-08-11

- **Add Dax and Mira: a 6-character roster makes the draft matter** (`f256026`) — a 4-player table drafting from exactly 4 characters had no real choice, since the last picker just got whatever was left. `runDraft()` already iterated `CHAR_IDS` generically, so growing the pool to 6 needed zero engine changes; Dax (Duelist) and Mira (Elementalist) reuse only skill kinds the engine already handles.
- **Add synthesized sound effects** (`d17a794`) — clock tick, hits, deaths, victory/defeat.
- **Rebalance Luna's Heal condition; fix score-point duplication bug** (`82ba95c`) — extended `tools/balance.ts` to report each score condition's fire rate and points *per won game*, which surfaced a real bug: `scoring.ts` hardcoded point values separately from `CHARACTERS[charId].score[n].points` (what the UI displays), so a rebalance could silently make the UI lie about a condition's worth. Added `scorePoints(conditionId)` as the single source of truth.
- **Show where a skill will land before you declare it** (`a6637bd`) — a skill you were still choosing didn't show its landing slot the way declared actions already did. Skill buttons now show "⏱N → resolves at slot M" and flag in red when the clock would run out before it resolves.
- **Teach medium/hard bots to time weak point and Blessing together** (`fd8785d`) — Aurelius's armor only breaks above a >12-post-armor hit, which no single character can reach alone, but bots scored only their own pending action in isolation so the combo never happened (0 of 1500 sim games ever logged a ≥25 dmg hit). `comboSynergyBonus()` now reads teammates' declared pending actions and the boss's rolled next move to reward timing weak point + Blessing under a teammate's big attack.
- **Add end-game breakdown so a loss explains itself** (`6cbed8c`) — end screens stated only the outcome, not whether you were one hit short or nowhere close. Both screens now show the final battle's boss HP bar with a "short by N HP (P%)" line, plus per-player damage/healing/deaths, derived from the battle log with no engine or save-format change.
- **Enforce Set Trap's ⏱-window rule for human players** (`8ad94c7`) — the v0.4.2 redesign restricts Set Trap to slots inside its own ⏱ window, but the window was computed in two places: bots read the correct list, while the human decision panel offered every free slot below the marker, unvalidated. `legalTrapSlots()` is now the single source, consumed by both `buildDeclareOptions()` and the UI, and enforced in `declareSkill()`.
- **Fix skipped boss-defeat screen on 0-EXP battle transitions** (`976f70b`) — defeating a non-final boss with the clock at 0/1 remaining grants 0 EXP to everyone, so `runExpPlacement` had no one to ask and never yielded, and the engine fell straight through to the next boss within the same `gen.next()` call, skipping the outgoing battle's result popup. `GameSession.revealNewEvents()` now drains any leftover events on the outgoing battle before switching over.
- **Add win/lose backdrop art to end-game screens** (`b4af3ae`) — `ScoringScreen` now shows the arena at full bleed with a warm golden glow (victory feel); `AllLoseScreen` shows the boss that beat the party as a dark, vignetted backdrop (defeat feel), instead of both rendering on flat black.

## 2026-08-10

- **Rename game to MoonRage Dungeon** (`131fefc`) — renamed from "Monster Colosseum" across the README, GAME_DESIGN doc, `index.html`, `package.json`/`package-lock.json`, and the Thai/English i18n strings.
- **Allow dev server port to be overridden via PORT env var** (`df50177`) — lets the local dev server share ports cleanly when 5173 is already taken by another process.
- **Initial commit: Monster Colosseum v0.3.0 standalone extraction** (`a83db85`) — project baseline, extracted as a standalone repo.
