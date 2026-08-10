import { STATUS_DEF, type ActiveStatus } from '@content/statuses';
import { useAppStore } from '@session/store';

const TONE_CLASS = {
  good: 'bg-emerald-900/80 text-emerald-200 border-emerald-400/50',
  bad: 'bg-red-950/85 text-red-200 border-red-400/50',
  neutral: 'bg-black/75 text-gold-dim border-gold-dim/50',
};

/** The row of status pills that floats over a character's head on the board. Tap-through — the
 *  figure underneath owns the click that opens the detail panel. */
export function StatusBadges({ statuses }: { statuses: ActiveStatus[] }) {
  if (statuses.length === 0) return null;
  return (
    <div className="flex gap-0.5 flex-shrink-0 pointer-events-none">
      {statuses.map((s) => {
        const def = STATUS_DEF[s.id];
        return (
          <span
            key={s.id}
            className={`text-[9px] leading-none px-1 py-[2px] rounded border ${TONE_CLASS[def.tone]} whitespace-nowrap`}
            title={def.label.th}
          >
            {def.icon}
            {s.value ? <span className="ml-0.5 font-mono">{s.value}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/** Same statuses, expanded with their full explanation — used inside the detail modals. */
export function StatusList({ statuses }: { statuses: ActiveStatus[] }) {
  const lang = useAppStore((s) => s.settings.lang);
  if (statuses.length === 0) return <div className="text-xs text-gold-dim">—</div>;
  return (
    <div className="flex flex-col gap-2">
      {statuses.map((s) => {
        const def = STATUS_DEF[s.id];
        return (
          <div key={s.id} className="flex gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded border h-fit flex-shrink-0 ${TONE_CLASS[def.tone]}`}>
              {def.icon}
              {s.value ? <span className="ml-1 font-mono">{s.value}</span> : null}
            </span>
            <div className="min-w-0">
              <div className="text-xs gold-text">{def.label[lang]}</div>
              <div className="text-[11px] text-gold-dim leading-snug">{def.desc[lang]}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
