import type { BattleState, CharId, Fighter, GameState } from '@engine/index';
import { SKILLS } from '@content/characters';
import { landSlotDisplay } from '@content/eventText';
import { charImageUrl } from '@ui/common/assets';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import { CLASS_COLOR } from '@content/charColors';

/** FF4-style stat readout — one aligned row per hero (portrait · name · HP bar · numbers), the
 *  right-hand panel of the bottom battle bar in the reference screenshot. Reads the paced display
 *  battle, not live engine state, so bars move in step with the action banner. */
/** The one personal-resource counter each character carries, if any. Mana was the only one until
 *  v0.4.0 added three more; keeping them in a single helper means the row stays one column wide no
 *  matter how many characters own a resource. */
function resourcePip(charId: CharId, f: Fighter): string {
  switch (charId) {
    case 'Liora':
      return `💧${f.mana}`;
    case 'Chronos':
      return `⏳${f.sand}`;
    case 'Kage':
      return `🌑${f.shadow}`;
    case 'Morvane':
      return `💀${f.souls}`;
    default:
      return '';
  }
}

export function PartyStatBar({
  state,
  battle,
  scoreOf,
  onSelect,
}: {
  state: GameState;
  battle: BattleState;
  scoreOf: (id: number) => number;
  onSelect?: (playerId: number) => void;
}) {
  return (
    <div className="party-player-board gold-frame rounded-lg px-3 py-1.5 h-full flex flex-col justify-center">
      {state.players.map((p) => (
        <HeroRow key={p.id} state={state} battle={battle} playerId={p.id} scoreOf={scoreOf} onSelect={onSelect} />
      ))}
    </div>
  );
}

function HeroRow({
  state,
  battle,
  playerId,
  scoreOf,
  onSelect,
}: {
  state: GameState;
  battle: BattleState;
  playerId: number;
  scoreOf: (id: number) => number;
  onSelect?: (playerId: number) => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const p = state.players.find((x) => x.id === playerId)!;
  const f = battle.fighters.find((x) => x.playerId === playerId)!;
  const hpPct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
  const score = scoreOf(p.id);
  const pending = f.pending ? SKILLS[f.pending.skillId] : null;

  return (
    <button
      onClick={() => onSelect?.(playerId)}
      className={`party-player-row w-full text-left flex items-center gap-2 py-1 border-b border-gold-dim/15 last:border-0 hover:bg-gold/10 rounded transition-colors ${
        f.alive ? '' : 'opacity-45'
      }`}
    >
      <img
        src={charImageUrl(p.charId)}
        alt={p.charId}
        className="party-mini-card w-7 h-7 object-cover object-top rounded flex-shrink-0"
        style={{ boxShadow: `0 0 0 1.5px ${CLASS_COLOR[p.charId]}` }}
        draggable={false}
      />
      <span className="text-xs font-display gold-text w-16 truncate flex-shrink-0">{p.name}</span>
      <div className="flex-1 h-2 bg-black/40 rounded overflow-hidden min-w-[40px]">
        <div className="h-full bg-front transition-all" style={{ width: `${hpPct}%` }} />
      </div>
      <span className="text-xs font-mono text-gold-bright w-14 text-right flex-shrink-0">
        {f.hp}/{f.maxHp}
      </span>
      <span className="text-[10px] font-mono text-gold-dim w-8 text-right flex-shrink-0">{resourcePip(p.charId, f)}</span>
      <span className="text-xs font-mono text-gold-bright w-7 text-right flex-shrink-0">{score}p</span>
      <span className="text-[9px] text-gold-dim w-24 truncate hidden sm:block">
        {!f.alive
          ? f.reviveAtSlot != null
            ? t('game.dead', { n: f.reviveAtSlot })
            : t('game.deadForever')
          : pending
          ? `${pending.immediate ? '⚡' : '→'} ${pending.name[lang]} @${landSlotDisplay(f.pending!.landedAtSlot)}`
          : f.shield
          ? `🛡 ${f.shield.kind === 'counter' ? 'Counter' : 'Mana'}`
          : ''}
      </span>
    </button>
  );
}
