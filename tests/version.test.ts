import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, LIVE_RULESET, RULESETS, SELECTABLE_RULESETS, STABLE_RULESET, hasBossSeries, hasFractures, type RulesetVersion } from '@content/rulesets';

// Why this file exists.
//
// `package.json` and the ruleset labels drifted apart for eleven commits, because they count
// different things: the app version moved on every release (eight of them UI-only) while a ruleset
// label moves only when the rules change. It was hand-synced once — at 1cad204, by walking
// package.json *backwards* from 0.4.6 to 0.4.2 — and had drifted again two commits later.
//
// Re-syncing by hand does not work, so rulesets.ts derives the live ruleset's label from
// package.json instead and nothing types a version twice. These tests are the half that makes it
// stay true: they fail the build on the day somebody hardcodes a label again, freezes the wrong
// ruleset, or ships one numbered ahead of the app.

/** Sorts "0.4.10" after "0.4.9" — a string compare would not. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
const ids = Object.keys(RULESETS) as RulesetVersion[];

describe('version policy', () => {
  it('reads APP_VERSION straight out of package.json', () => {
    // Guards the import itself: a bundler config change that stubbed the JSON import would leave
    // every label reading "vundefined" and nothing else here would notice.
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('labels the live ruleset with the app version, without anyone typing it', () => {
    expect(RULESETS[LIVE_RULESET].label).toBe(`v${APP_VERSION}`);
  });

  it('never lets a ruleset be numbered ahead of the app', () => {
    // A frozen label may lag — that is the point of freezing one — but a ruleset claiming a version
    // the app has not reached means somebody bumped the wrong file.
    for (const id of ids) {
      const label = RULESETS[id].label;
      expect(compareVersions(label.replace(/^v/, ''), APP_VERSION), `${id} (${label})`).toBeLessThanOrEqual(0);
    }
  });

  it('gives every ruleset its own label', () => {
    // 418bbfd had to renumber a whole release because two rulesets answered to "v0.4.1", which makes
    // every later reference to that label ambiguous — including the ones in BALANCE_NOTES.md.
    expect(new Set(ids.map((id) => RULESETS[id].label)).size).toBe(ids.length);
  });

  it('keeps each entry keyed by its own id', () => {
    for (const id of ids) expect(RULESETS[id].id).toBe(id);
  });

  it('offers a subset of the rulesets in the menu, and every offered one exists', () => {
    // The picker is allowed to be shorter than the record — a ruleset frozen out of the menu still
    // has to load the saves that name it. What it may never be is *longer*, or contain an id the
    // record has never heard of.
    for (const id of SELECTABLE_RULESETS) expect(ids).toContain(id);
    expect(new Set(SELECTABLE_RULESETS).size).toBe(SELECTABLE_RULESETS.length);
    // The two the player must always be able to reach: the tuned one and the one being worked on.
    expect(SELECTABLE_RULESETS).toContain(STABLE_RULESET);
    expect(SELECTABLE_RULESETS).toContain(LIVE_RULESET);
  });

  it('keeps v0.4 loadable but out of the menu', () => {
    // Frozen out rather than deleted: it is a permanent save key. Deleting it would make every game
    // saved under it unloadable, which is a far worse outcome than one fewer line in the picker.
    expect(ids).toContain('v0.4');
    expect(SELECTABLE_RULESETS).not.toContain('v0.4');
  });

  it('gates the boss series to its own ruleset, and carries the fractures into it', () => {
    // v0.4.10 is v0.4.9 plus the other nine bosses — so it must have everything v0.4.9 had, or the
    // two are not comparable and the split bought nothing.
    expect(hasBossSeries('bosses')).toBe(true);
    expect(hasFractures('bosses')).toBe(true);
    expect(hasFractures('fracture')).toBe(true);
    for (const id of ['v0.3', 'v0.4', 'fracture'] as RulesetVersion[]) expect(hasBossSeries(id)).toBe(false);
  });

  it('keeps the two legacy version-shaped ids and adds no more of them', () => {
    // Ids are permanent save keys, so a version-shaped one goes stale the moment its label moves —
    // which is the confusion this whole file exists to end. `v0.3` and `v0.4` are grandfathered
    // because saves in the wild contain them; anything new is named for what it is.
    const versionShaped = ids.filter((id) => /^v\d/.test(id));
    expect(versionShaped).toEqual(['v0.3', 'v0.4']);
    expect(/^v\d/.test(LIVE_RULESET)).toBe(false);
  });
});
