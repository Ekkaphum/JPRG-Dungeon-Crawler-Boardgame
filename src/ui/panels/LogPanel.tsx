import { useEffect, useRef } from 'react';
import type { ClockLogEvent } from '@engine/index';
import { describeEvent } from '@content/eventText';
import { useT } from '@content/i18n/useT';

export function LogPanel({ log }: { log: ClockLogEvent[] }) {
  const t = useT();
  const lines = log.map(describeEvent).filter((x): x is string => x != null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div ref={scrollRef} className="gold-frame rounded-lg p-2 h-full overflow-y-auto text-[11px] font-mono leading-relaxed">
      {lines.length === 0 && <div className="text-gold-dim">{t('log.empty')}</div>}
      {lines.slice(-300).map((l, i) => (
        <div key={i} className="text-gold-dim/90 border-b border-white/5 py-0.5">
          {l}
        </div>
      ))}
    </div>
  );
}
