# Changelog

Human-readable log of changes to this project, newest first. Add an entry here whenever you commit — whether the change was made by Claude Code or by hand — so anyone picking up the project can see what happened without digging through `git log`.

## 2026-08-12

- **Redesign main menu with fantasy clock cathedral** (`b4ff1b8`) — new "clock cathedral" background art and a full visual rework of the main menu (sanctum card, moon sigil, kicker/divider text, restyled buttons with a primary "New Game" state). UI-only, no gameplay logic changed.
- **Tighten Heal scoring and action validation** (`d3ac061`) — Luna may Heal herself and restore HP normally, but self-healing does not award her `luna1` “heal a friend” score. Heal can only target someone alive at declaration time; if that legal target dies before the delayed Heal resolves, the action still fizzles and is wasted under §5.5. Mana spending is now validated at the engine boundary as a whole number from 0–3 that cannot exceed the caster's current mana, rejecting negative, fractional, `NaN`, and over-cap values.
- **Set Trap: roll before it does anything, not damage-then-roll-for-bonus** (`24304f8`) — fixed roll ordering so the trap's roll happens before its effects instead of after damage.
- **Fix 9 critical engine bugs** (`27695e0`) — party wipe, slot 0, turn order, Last Shot, validation, AoE+Counter.

## 2026-08-11

- **Add Dax and Mira: a 6-character roster makes the draft matter** (`f256026`)
- **Add synthesized sound effects** (`d17a794`) — clock tick, hits, deaths, victory/defeat.
- **Rebalance Luna's Heal condition; fix score-point duplication bug** (`82ba95c`)
- **Show where a skill will land before you declare it** (`a6637bd`)
- **Teach medium/hard bots to time weak point and Blessing together** (`fd8785d`)
- **Add end-game breakdown so a loss explains itself** (`6cbed8c`)
- **Enforce Set Trap's ⏱-window rule for human players** (`8ad94c7`)
- **Fix skipped boss-defeat screen on 0-EXP battle transitions** (`976f70b`)
- **Add win/lose backdrop art to end-game screens** (`b4af3ae`)

## 2026-08-10

- **Rename game to MoonRage Dungeon** (`131fefc`)
- **Allow dev server port to be overridden via PORT env var** (`df50177`)
- **Initial commit: Monster Colosseum v0.3.0 standalone extraction** (`a83db85`)
