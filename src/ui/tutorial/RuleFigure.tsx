// Illustration primitives for the rulebook (TutorialScreen).
//
// These deliberately re-draw the clock rather than rendering the real <TimelineBar/>: the real one
// takes a live GameState + BattleState, and faking one well enough to show "Eric declared Slash and
// walks 2" would mean constructing a whole battle per figure — and any engine refactor would then
// break the tutorial. What matters for teaching is that the *visual language* matches (same track,
// same countdown direction, same pawn discs, same marker), which is what these copy.

import type { ReactNode } from 'react';

const MAX_SLOT = 24;
const pctOf = (slot: number) => ((MAX_SLOT - slot) / MAX_SLOT) * 100;

/** A framed illustration with a numbered caption underneath. */
export function Figure({ label, caption, children }: { label?: string; caption?: string; children: ReactNode }) {
  return (
    <figure className="rule-figure">
      <div className="rule-figure__body">{children}</div>
      {(label || caption) && (
        <figcaption className="rule-figure__caption">
          {label && <b>{label}</b>}
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export interface StripPawn {
  /** 1–2 letters, same abbreviation the real timeline uses. */
  label: string;
  slot: number;
  color: string;
  /** Draw faded — a "where it used to be" or "where it will land" echo. */
  ghost?: boolean;
  /** Stack height when several pawns share a slot; 0 = nearest the track = resolves first. */
  stack?: number;
}

export interface StripSpan {
  from: number;
  to: number;
  text: string;
  color?: string;
}

/** The 24→0 countdown track, drawn with whatever pawns a given example needs. */
export function ClockStrip({
  marker,
  pawns = [],
  spans = [],
  flags = [],
}: {
  marker: number;
  pawns?: StripPawn[];
  spans?: StripSpan[];
  /** Slots to mark with a rune underneath the track (traps, revive points, deadlines). */
  flags?: { slot: number; text: string; color?: string }[];
}) {
  const tallest = pawns.reduce((n, p) => Math.max(n, p.stack ?? 0), 0);
  return (
    <div className="rule-strip" style={{ paddingTop: `${26 + tallest * 17}px` }}>
      {spans.map((s, i) => (
        <div
          key={`span${i}`}
          className="rule-strip__span"
          style={{
            left: `${pctOf(Math.max(s.from, s.to))}%`,
            width: `${Math.abs(pctOf(s.to) - pctOf(s.from))}%`,
            borderColor: s.color ?? 'var(--gold-dim)',
            color: s.color ?? 'var(--gold)',
          }}
        >
          <span>{s.text}</span>
        </div>
      ))}

      <div className="rule-strip__track">
        <div className="rule-strip__spent" style={{ width: `${pctOf(marker)}%` }} />
      </div>

      {Array.from({ length: MAX_SLOT + 1 }, (_, slot) => (
        <div key={slot} className="rule-strip__tick" style={{ left: `${pctOf(slot)}%` }}>
          <i style={{ background: slot > marker ? 'rgba(138,111,47,0.35)' : 'var(--gold-dim)' }} />
          {slot % 4 === 0 && <em>{slot}</em>}
        </div>
      ))}

      <div className="rule-strip__marker" style={{ left: `${pctOf(marker)}%` }}>
        <i />
        <u />
      </div>

      {pawns.map((p, i) => (
        <div
          key={`${p.label}${i}`}
          className="rule-strip__pawn"
          style={{ left: `${pctOf(p.slot)}%`, bottom: `${26 + (p.stack ?? 0) * 17}px`, opacity: p.ghost ? 0.35 : 1 }}
        >
          <span style={{ background: p.color, borderStyle: p.ghost ? 'dashed' : 'solid' }}>{p.label}</span>
        </div>
      ))}

      {flags.map((f, i) => (
        <div key={`f${i}`} className="rule-strip__flag" style={{ left: `${pctOf(f.slot)}%`, color: f.color ?? 'var(--gold)' }}>
          {f.text}
        </div>
      ))}
    </div>
  );
}

/** Numbered step chips — the "declare / walk / resolve" spine of a turn. */
export function StepFlow({ steps }: { steps: { n: string; title: string; body: string; tone?: 'act' | 'wait' }[] }) {
  return (
    <div className="rule-steps">
      {steps.map((s, i) => (
        <div key={s.n} className={`rule-step${s.tone === 'wait' ? ' is-wait' : ''}`}>
          <div className="rule-step__n">{s.n}</div>
          <div className="rule-step__title">{s.title}</div>
          <div className="rule-step__body">{s.body}</div>
          {i < steps.length - 1 && <div className="rule-step__arrow">▸</div>}
        </div>
      ))}
    </div>
  );
}

/** The escalating d6 ladder — one rung per failed attempt. */
export function DiceLadder({ targets, caption }: { targets: string[]; caption: string }) {
  return (
    <div className="rule-ladder">
      {targets.map((tgt, i) => (
        <div key={i} className={`rule-ladder__rung${i === targets.length - 1 ? ' is-auto' : ''}`}>
          <div className="rule-ladder__try">#{i + 1}</div>
          <div className="rule-ladder__die">{tgt}</div>
        </div>
      ))}
      <div className="rule-ladder__note">{caption}</div>
    </div>
  );
}

/** Schematic of the battle screen, so a first-time player can name every panel before they see it
 *  for real. Laid out with the same proportions as GameScreen's grid. */
export function ScreenMap({ zones }: { zones: { key: string; n: string; title: string; body: string }[] }) {
  const by = (k: string) => zones.find((z) => z.key === k);
  const cell = (k: string, cls: string) => {
    const z = by(k);
    if (!z) return null;
    return (
      <div className={`rule-map__zone ${cls}`}>
        <b>{z.n}</b>
        <span>{z.title}</span>
      </div>
    );
  };
  return (
    <div className="rule-map">
      <div className="rule-map__frame">
        <div className="rule-map__row rule-map__row--top">{cell('top', 'is-thin')}</div>
        <div className="rule-map__row rule-map__row--main">
          <div className="rule-map__col">
            {cell('stage', 'is-stage')}
            {cell('clock', 'is-thin')}
            {cell('banner', 'is-thin')}
            <div className="rule-map__row rule-map__row--console">
              {cell('command', 'is-command')}
              {cell('party', 'is-party')}
            </div>
          </div>
          {cell('log', 'is-log')}
        </div>
      </div>
      <ol className="rule-map__legend">
        {zones.map((z) => (
          <li key={z.key}>
            <b>{z.n}</b>
            <span>
              <strong>{z.title}</strong> — {z.body}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
