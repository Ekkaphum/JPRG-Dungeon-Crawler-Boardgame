// English mirror of tutorialTh.ts. The Record type binds it to the Thai key set, so a key added on
// one side and forgotten on the other is a compile error rather than a silently missing paragraph.

import type { tutorialTh } from './tutorialTh';

export const tutorialEn: Record<keyof typeof tutorialTh, string> = {
  'tut.nav.goal': 'The Goal',
  'tut.nav.clock': 'The Clock',
  'tut.nav.turn': 'Your Turn',
  'tut.nav.screen': 'The Screen',
  'tut.nav.combat': 'Combat',
  'tut.nav.death': 'Down & Back',
  'tut.nav.score': 'Scoring',
  'tut.nav.camp': 'The Camp',
  'tut.nav.ref': 'Reference',

  'tut.chapterOf': 'Chapter {n}',
  'tut.next': 'Next: {name} ▸',
  'tut.prev': '◂ {name}',
  'tut.example': 'Worked example',
  'tut.watchOut': 'Where people trip up',
  'tut.figure': 'Fig. {n}',

  // ── 1. The Goal ───────────────────────────────────────────────────────────────────────────
  'tut.goal.h': 'What you are playing for',
  'tut.goal.lede':
    'A semi-cooperative game for four seats. You control one character, and the party fights three bosses in a fixed order. Everyone has to bring each boss down before the clock strikes midnight — but only one person wins at the end.',
  'tut.goal.win.title': '🏆 The game ends',
  'tut.goal.win.body': 'All three bosses defeated → count points. The highest score wins, alone.',
  'tut.goal.lose.title': '☠ Everyone loses',
  'tut.goal.lose.body':
    'The marker reaches slot 0 with the boss still alive, or all four players are down at the same moment → the game ends immediately and nobody wins, including whoever was leading.',
  'tut.goal.tie.title': 'Breaking ties',
  'tut.goal.tie.body': 'Equal points → most Last Shots (killing blows on a boss) → still equal → most HP remaining at the end.',
  'tut.goal.bosses.title': 'Three bosses, always this order',
  'tut.goal.bosses.body': 'The clock resets for every new boss, and everyone comes back to full HP.',
  'tut.goal.tension':
    'That is the tension the whole game runs on: points are private, survival is shared. Sit on your hands waiting to steal the killing blow and the boss may wipe the party first — at which point every point anyone banked all game becomes zero at once.',

  // ── 2. The Clock ──────────────────────────────────────────────────────────────────────────
  'tut.clock.h': 'The 24-slot clock is the whole board',
  'tut.clock.lede':
    'There are no player turns in this game, only a 24-slot time track. The marker starts at slot 24 and steps down one slot at a time toward 0. Whenever it reaches a pawn, that pawn acts — so how often you get to play is decided entirely by how much time (⏱) the actions you pick cost.',
  'tut.clock.fig1': 'The start of every battle — all four players and the boss stacked on slot 23, marker on 24, nobody has declared anything yet.',
  'tut.clock.fig2':
    'A few steps later the pawns have spread out according to the ⏱ each player spent. Kit took a cheap action and sits close to the marker, so she acts soon; Liora took a heavy one and dropped far down the track.',
  'tut.clock.r1.title': 'It only ever counts down',
  'tut.clock.r1.body':
    'The marker never moves back. Slot 0 is midnight and the party loses there. (Only Rewind, in the experimental ruleset, gives time back — and it can never push past slot 24.)',
  'tut.clock.r2.title': 'Nothing goes above the marker',
  'tut.clock.r2.body':
    'A skill that moves a pawn up the clock can move it at most to the slot the marker is currently on — which means "you act next", never "you skip ahead of time".',
  'tut.clock.r3.title': 'Pawns share slots',
  'tut.clock.r3.body':
    'Several pawns can sit on one slot. Whoever was placed there first sits at the bottom of the stack and acts first, and if a player and the boss share a stack, the player always goes before the boss.',
  'tut.clock.r4.title': 'Reset every boss',
  'tut.clock.r4.body':
    'New boss → marker back to 24, every pawn back to slot 23, players back to full HP. Skill levels and items you earned carry over.',
  'tut.clock.time.title': 'Leftover time is next round’s power',
  'tut.clock.time.body':
    'Killing a boss fast is not just safer. The slots left on the clock convert into a reward everyone shares equally — EXP in the standard ruleset, gems in the experimental one — and in the third battle they convert straight into points. Stalling for a prettier moment always cuts your own power in the round after it.',

  // ── 3. Your Turn ──────────────────────────────────────────────────────────────────────────
  'tut.turn.h': 'Every turn is the same three steps',
  'tut.turn.lede':
    'Here is the heart of the game: what you order now does not happen now. You declare an action when the marker reaches you, and it actually resolves the next time the marker comes back around to you. So you are not playing the board in front of you — you are playing the board as it will look ⏱ slots from now.',
  'tut.turn.s1.title': 'Resolve last time’s action',
  'tut.turn.s1.body':
    'Whatever you declared on your previous visit happens now: roll the dice, work out damage, claim points. (The very first visit of a battle has nothing pending — skip it.)',
  'tut.turn.s2.title': 'Declare a new action',
  'tut.turn.s2.body':
    'Pick one thing from your kit and declare it openly for everyone to see. Skills marked ⚡ take effect right here, in this step, with no wait.',
  'tut.turn.s3.title': 'Walk your pawn down by ⏱',
  'tut.turn.s3.body':
    'Your pawn moves down the track by the ⏱ of the action you just declared. That slot is where you will act again. Then the marker carries on to whoever is next.',
  'tut.turn.fig1':
    'The marker reaches slot 23. Eric declares Power Strike (⏱4), so his pawn moves from 23 down to 19 (the dashed disc is where it was). Nothing has been damaged yet.',
  'tut.turn.fig2':
    'The marker walks down to slot 19. Only now does Power Strike land, and it is measured against the boss as it stands at this moment — not as it stood when Eric declared. Eric then declares his next action immediately.',
  'tut.turn.ex1':
    'Eric declares Power Strike while the boss sits at 40 HP with no armor. During the four slots he waits, the boss declares a move that gives itself 3 armor. So when his fist finally lands, 3 damage is shaved off it. Eric did nothing wrong — he declared before that information existed. That is the game you are playing.',
  'tut.turn.instant.title': '⚡ Immediate skills',
  'tut.turn.instant.body':
    'A skill marked ⚡ does not wait: it resolves in step 2, the instant it is declared. The pawn still walks its full ⏱ afterwards. For these cards ⏱ is not "how long until it works" but "how long until you may act again" — and because the effect already happened, you may declare a ⚡ skill even when its ⏱ would carry your pawn past slot 0. That is deliberate, not a wasted action.',
  'tut.turn.waste.title': 'A declared action that cannot happen is lost entirely',
  'tut.turn.waste.body':
    'If the conditions are no longer met when it comes time to resolve — the target is dead, the card’s condition has stopped being true — the whole action is wasted. No effect, no damage, no points, no ⏱ refunded, no mana refunded. The single most common case: Luna declares Heal on Eric and Eric dies before her turn comes around. The Heal simply vanishes.',
  'tut.turn.open.title': 'Everything is open, and that is the point',
  'tut.turn.open.body':
    'Every declared action, the boss’s included, is visible at all times along with the slot it will land on. That is what makes cross-player combos possible (open the weak point exactly when Liora’s big spell lands) and what makes stealing possible (fire a cheap action to jump the queue and take the killing blow). Hiding your plan is not an option here.',

  // ── 4. The Screen ─────────────────────────────────────────────────────────────────────────
  'tut.screen.h': 'Reading the battle screen',
  'tut.screen.lede': 'The map below is the battle screen. Every panel keeps its position for the whole game — learn it once and you never hunt for anything again.',
  'tut.screen.z1.t': 'Top bar',
  'tut.screen.z1.b': 'Which of the three bosses you are on. Settings and quit sit at the right.',
  'tut.screen.z2.t': 'The stage',
  'tut.screen.z2.b':
    'Boss on the left, party on the right. Click any figure to open its full sheet — HP, mana, armor, ailments, and the action it has declared but not yet resolved.',
  'tut.screen.z3.t': 'The clock',
  'tut.screen.z3.b':
    'The 24 → 0 track with every pawn and the marker on it. One glance tells you both how much time is left and who acts next.',
  'tut.screen.z4.t': 'Action banner',
  'tut.screen.z4.b': 'One sentence describing what just happened, so you can follow the story without reading the log.',
  'tut.screen.z5.t': 'Command panel',
  'tut.screen.z5.b':
    'Where you choose your action — four skill cards (one row on desktop, a 2×2 grid on mobile), each showing its ⏱ and a compact row of effect icons. Hover or tab onto any card to open the full-size version with its description and every number spelled out, so nothing about your own kit has to be memorised. Items are used from here as a free action that costs no ⏱.',
  'tut.screen.z6.t': 'Party bar',
  'tut.screen.z6.b': 'HP and points for all four seats side by side — who is leading on score, and who is one hit from going down.',
  'tut.screen.z7.t': 'Battle log',
  'tut.screen.z7.b': 'Every event, every die roll, every point claimed, in order. Always there to check where a number came from.',
  'tut.screen.tip':
    'Tip: click the boss to open its full move table with the die results that trigger each move. It is readable at any point during the game — nothing here needs memorising.',

  // ── 5. Combat ─────────────────────────────────────────────────────────────────────────────
  'tut.combat.h': 'Damage, dice, and weak points',
  'tut.combat.lede': 'The damage formula is one layer deep. No multipliers, no special ordering to remember. Buffs and armor stack without limit.',
  'tut.combat.formula': 'damage = action’s attack value + all buffs − all armor',
  'tut.combat.formulaNote': 'Minimum 0 · a buff that reads "everyone’s attacks +N" means players only, never the boss.',
  'tut.combat.weak.title': 'Weak point open — the strongest buff in the game',
  'tut.combat.weak.body':
    'Some skills open the boss’s weak point. While it is open, everyone’s attacks hit for +4, and it stays open for exactly 4 clock slots. This is why reading your allies’ plans matters: opening it when nobody has an action pending throws it away, while lining it up with two heavy hits about to land can decide the whole battle.',
  'tut.combat.dice.title': 'The escalating ladder — a failed roll is never wasted',
  'tut.combat.dice.body': 'Some skills need a d6 to succeed, but the target drops by one every time you fail. The more you try, the easier it gets.',
  'tut.combat.dice.auto': 'auto success',
  'tut.combat.dice.note':
    'A success resets that skill’s ladder to the top · each skill counts separately · everything resets each battle · a skill upgraded to Lv2 starts its ladder at 4+ instead.',
  'tut.combat.boss.title': 'How the boss plays',
  'tut.combat.boss.body':
    'The boss has a pawn on the clock and follows every rule you do. The only difference is how it declares: it rolls a d6 and reads its own move table. The move it gets is shown to everyone, along with the slot it will land on, so you always have time to prepare. What you do not know is the next roll — never the current move.',
  'tut.combat.ex':
    'Kit opens the weak point with the marker on slot 16, so it closes at slot 12. Liora is waiting at slot 14 with Meteor and Eric at 13. Both land inside the window and both get +4 — 8 free damage off a single skill of Kit’s. Two slots later and Eric falls outside the window, and the combo pays half.',

  // ── 6. Down & Back ────────────────────────────────────────────────────────────────────────
  'tut.death.h': 'Dying is not the end',
  'tut.death.lede':
    'The moment your HP hits 0 your pawn leaves the clock and any action you had declared is cancelled outright. But you are not sidelined for the rest of the battle — the game places your revival point the instant you go down.',
  'tut.death.fig':
    'Liora goes down with the marker on slot 14. Her pawn is immediately placed on slot 8 (14 − 6), where it doubles as the timer for her return — so everyone can see exactly when she is coming back.',
  'tut.death.r1.title': 'Back after 6 slots',
  'tut.death.r1.body': 'Place the pawn on (marker position when you died − 6) right away. When the marker walks down to it, you are back.',
  'tut.death.r2.title': 'You return at half HP',
  'tut.death.r2.body':
    'Rounded up, and you declare a new action that same turn (there is nothing pending to resolve — death cleared it).',
  'tut.death.r3.title': 'If fewer than 6 slots remain',
  'tut.death.r3.body': 'You do not come back this battle; the pawn leaves the board. You return at full HP for the next boss as normal.',
  'tut.death.r4.title': 'All four down at once = immediate loss',
  'tut.death.r4.body': 'If every player is down at the same moment the game ends right there, no matter whose revival timer was about to fire.',
  'tut.death.ex':
    'Death genuinely hurts — you lose roughly one or two actions and come back on half blood against a boss that is not — but it is not an exit. And it does not clear scoring conditions tied to dying: going down and coming back still counts as having died.',

  // ── 7. Scoring ────────────────────────────────────────────────────────────────────────────
  'tut.score.h': 'Scoring is personal',
  'tut.score.lede':
    'There is no shared score. Each character has three scoring conditions of their own, printed on their sheet, claimed the instant they trigger. All four characters use the same three-slot shape, so you learn it once and can then read anyone’s sheet at a glance.',
  'tut.score.s1.title': '① Something you can repeat all battle',
  'tut.score.s1.body': 'Roughly 1 point a time, uncapped. This is the base you should be planning around every round.',
  'tut.score.s2.title': '② A decisive moment, once only',
  'tut.score.s2.body': 'Roughly 1–4 points. Usually tied to the killing blow or to a moment you have to deliberately engineer.',
  'tut.score.s3.title': '③ The state you or the party end in',
  'tut.score.s3.body':
    'Roughly 2–3 points, checked when the boss dies. This is the slot that makes you care whether your allies survived, not just yourself.',
  'tut.score.time.title': 'Time bonus — third battle only',
  'tut.score.time.body':
    'Slots left on the clock when Aurelius falls convert to points at 1 per 2 slots, equally for everyone. The first two battles convert leftover time into power for the next round instead.',
  'tut.score.open.title': 'Every point is claimed face up',
  'tut.score.open.body':
    'Everyone can always see who is ahead. That is not just convenience — Aurelius has a move that targets whoever is leading on score, so pulling ahead early in the third battle has a price.',

  // ── 8. The Camp ───────────────────────────────────────────────────────────────────────────
  'tut.camp.h': 'The camp between bosses',
  'tut.camp.lede':
    'Beat a boss and everyone receives the same number of gems: the boss’s printed reward plus the leftover clock divided by 3. Then comes the camp, three phases always in this order, where each phase’s budget is whatever the last one left behind. That sequencing is the entire decision.',
  'tut.camp.p1.title': 'Ⅰ · Shop',
  'tut.camp.p1.body':
    'Four items face up. Players buy one seat at a time, fewest points first (character speed breaks ties). One seat may clear the whole row if it can afford to, and the next card in line is shown so you can see what is coming.',
  'tut.camp.p2.title': 'Ⅱ · Upgrade',
  'tut.camp.p2.body': 'Everyone at once. 8 gems flips one skill card to Lv2, permanently — it cannot be flipped back, and it lasts the rest of the game.',
  'tut.camp.p3.title': 'Ⅲ · Points',
  'tut.camp.p3.body': 'Everyone at once. 4 gems per point, deliberately the worst rate on offer: it is where leftovers go, not a plan.',
  'tut.camp.rule1': 'Gems never carry over — anything unspent at the end of phase Ⅲ is gone.',
  'tut.camp.rule2': 'Items are used on your own turn as a free action: they cost no ⏱ and do not replace the action you declare.',
  'tut.camp.rule3':
    'The camp only exists in the experimental ruleset (v0.4). Standard v0.3 uses EXP instead: beating a boss gives everyone equal EXP tokens, and 3 tokens on a skill card flips it to Lv2.',
  'tut.camp.ex':
    'You hold 20 gems. You can buy two strong items for the next battle; or upgrade two core skills and turn the leftover 4 gems into 1 point; or, if you are well behind, dump the lot into 5 points and fight the final boss with the kit you already have. The game does not tell you which is right — but you only choose once per camp.',

  // ── 9. Reference ──────────────────────────────────────────────────────────────────────────
  'tut.score.fig': 'A real sheet — Eric’s three conditions read straight off the ①②③ shape above, and the other three characters line up exactly the same way.',

  'tut.ref.h': 'Reference tables',
  'tut.ref.lede':
    'Everything below is read from the ruleset your next game will actually use. Change the ruleset in game setup and these tables change with it.',
};
