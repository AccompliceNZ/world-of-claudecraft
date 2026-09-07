import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cssTreeUnder } from './helpers/css_tree_under';
import { expectScansOnlyThroughSharedWalkers } from './helpers/scan_guard_self_audit';

// The raw-color ratchet for the game stylesheets (DESIGN.md 13.4, src/styles/CLAUDE.md).
//
// Color has one home: the tokens in src/styles/tokens.css and the derivations in
// src/ui/theme.ts. Component CSS composes those by name. The shipped sheets carry
// thousands of pre-existing literals, so this guard is a RATCHET, not a ban: every
// sheet has a pinned ceiling of raw color literals that may only come down, the
// library sheet is pinned at zero, and every section the redesign has tokenized is
// pinned at zero by its ten-dash banner name. A worker who adds a literal fails the
// ceiling; the integrator lowers a ceiling after a section is migrated and adds the
// section to the zero set so it cannot regress.
//
// What counts as a literal: a hex color (#rgb, #rgba, #rrggbb, #rrggbbaa) or an
// rgb()/rgba() call with a numeric first channel, inside a DECLARATION. Selectors
// are dropped first (an id like #deed-tracker would otherwise read as hex), and so
// are comments, quoted strings and url() bodies. color-mix(in srgb, var(--x) ...)
// does not count: it composes a token. tokens.css is exempt because it IS the home.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const stylesDir = join(repoRoot, 'src', 'styles');

const MARKER_RE = /\/\*\s*-{10,}\s*([^*]+?)\s*-{10,}\s*\*\//g;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /\brgba?\(\s*\d/g;

function declarationsOnly(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/url\([^)]*\)/g, 'url()')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/[^{};]+\{/g, '{');
}

/** Raw color literals in a stylesheet's declarations. */
function rawColorLiterals(css: string): number {
  const code = declarationsOnly(css);
  return (code.match(HEX_RE)?.length ?? 0) + (code.match(RGB_RE)?.length ?? 0);
}

/** Per ten-dash section: banner name to literal count (the text before the first banner is unnamed). */
function sectionLiterals(css: string): Map<string, number> {
  const parts = css.split(MARKER_RE);
  const out = new Map<string, number>();
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim();
    out.set(name, (out.get(name) ?? 0) + rawColorLiterals(parts[i + 1] ?? ''));
  }
  return out;
}

/** Every sheet under `root` (recursive) with its literal count, keyed by the walker's label. */
function literalCountsUnder(root: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const { file, full } of cssTreeUnder(root).files) {
    out.set(file, rawColorLiterals(readFileSync(full, 'utf8')));
  }
  return out;
}

// The home of every color value; exempt from the ratchet by definition.
const TOKEN_HOME = 'tokens.css';

// Ceilings: the literal count of each shipped sheet when the ratchet landed.
// A sheet may only go DOWN from here (lower the number in the same change); a
// sheet with no row fails until it gets one.
const CEILINGS: Record<string, number> = {
  'base.css': 23,
  'components.css': 593,
  'hud.css': 611,
  'hud.mobile.css': 262,
  'index.css': 0,
  'index.extra.css': 43,
  'layout.css': 0,
  'library.css': 0,
  'play.extra.css': 1,
  'shell.css': 719,
};

// How far under its ceiling a sheet may sit before the ceiling has to be lowered,
// so a migrated section cannot quietly regain its literals inside the old slack.
const MAX_SLACK = 12;

// Sections that compose tokens only. Every name must exist in the corpus (a
// renamed banner fails here, not silently) and must count zero. The integrator
// appends a section here when its migration lands.
const ZERO_LITERAL_SECTIONS = [
  'ui library (shared primitives)',
  'window shell',
  'interaction prompt',
];

const COUNTS = literalCountsUnder(stylesDir);

describe('raw color literals stay in tokens.css (the ratchet)', () => {
  it('walks the real sheet set (anti-vacuity)', () => {
    expect(COUNTS.size).toBeGreaterThanOrEqual(11);
    expect([...COUNTS.keys()]).toEqual(
      expect.arrayContaining(['hud.css', 'components.css', 'library.css', TOKEN_HOME]),
    );
    let total = 0;
    for (const [file, n] of COUNTS) if (file !== TOKEN_HOME) total += n;
    expect(
      total,
      'the shipped sheets carry a real literal debt the ratchet models',
    ).toBeGreaterThan(0);
  });

  it('pins a ceiling for every sheet and only for sheets that exist', () => {
    const sheets = [...COUNTS.keys()].filter((f) => f !== TOKEN_HOME).sort();
    expect(sheets).toEqual(Object.keys(CEILINGS).sort());
  });

  it.each(Object.entries(CEILINGS))('%s carries at most %i raw color literals', (file, ceiling) => {
    const n = COUNTS.get(file);
    expect(n, `${file} was not walked`).toBeDefined();
    expect(
      n,
      `${file} gained raw color literals (${n} > ${ceiling}): move the value to a token in src/styles/tokens.css and read it with var()`,
    ).toBeLessThanOrEqual(ceiling);
  });

  it('ceilings stay honest: a migrated sheet lowers its ceiling in the same change', () => {
    const slack: string[] = [];
    for (const [file, ceiling] of Object.entries(CEILINGS)) {
      const n = COUNTS.get(file) ?? 0;
      if (ceiling - n > MAX_SLACK)
        slack.push(`${file}: ${n} literals under a ceiling of ${ceiling}`);
    }
    expect(slack, 'lower these ceilings to the live count').toEqual([]);
  });

  it('the library sheet composes tokens only', () => {
    expect(COUNTS.get('library.css')).toBe(0);
  });

  it('every tokenized section stays at zero and still exists under its banner name', () => {
    const seen = new Map<string, number>();
    for (const { full } of cssTreeUnder(stylesDir).files) {
      for (const [name, n] of sectionLiterals(readFileSync(full, 'utf8'))) {
        seen.set(name, (seen.get(name) ?? 0) + n);
      }
    }
    expect(ZERO_LITERAL_SECTIONS.length).toBeGreaterThan(0);
    for (const name of ZERO_LITERAL_SECTIONS) {
      expect(seen.has(name), `section banner "${name}" no longer exists`).toBe(true);
      expect(seen.get(name), `section "${name}" regained raw color literals`).toBe(0);
    }
  });

  it('the token home is exempt on purpose and is where the literals live', () => {
    expect(COUNTS.get(TOKEN_HOME)).toBeGreaterThan(100);
  });
});

describe('raw color ratchet: the counter has teeth', () => {
  it('counts hex and numeric rgb() in declarations, not selectors, comments, strings or tokens', () => {
    const css = [
      '#deed-tracker, #bags { color: #fff; }',
      '/* #123456 in a comment */',
      '.a { background: url(#fade.png); content: "#abc"; }',
      '.b { border: 1px solid rgba(0, 0, 0, 0.5); outline: 1px solid rgb(1 2 3 / 50%); }',
      '.c { color: color-mix(in srgb, var(--gold) 50%, transparent); background: var(--panel-bg); }',
      '.d { box-shadow: 0 0 0 1px #000c, inset 0 1px 0 #ffffff14; }',
    ].join('\n');
    expect(rawColorLiterals(css)).toBe(5);
  });

  it('splits sections on the ten-dash banner only', () => {
    const css = [
      '/* ---- prose ---- */ .p { color: #000; }',
      '/* ---------- alpha ---------- */ .a { color: #111; } .b { color: #222; }',
      '/* ---------- beta ---------- */ .c { color: var(--x); }',
    ].join('\n');
    const secs = sectionLiterals(css);
    expect([...secs.entries()]).toEqual([
      ['alpha', 2],
      ['beta', 0],
    ]);
  });
});

describe('raw color ratchet: recursion', () => {
  let tmp = '';
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'css-ratchet-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reaches a sheet parked in a nested directory through the shared walker', () => {
    writeFileSync(join(tmp, 'top.css'), '.a { color: #fff; }');
    mkdirSync(join(tmp, 'nested', 'deeper'), { recursive: true });
    writeFileSync(
      join(tmp, 'nested', 'deeper', 'sunk.css'),
      '.b { color: rgb(1, 2, 3); color: #abc; }',
    );
    const counts = literalCountsUnder(tmp);
    expect([...counts.entries()].sort()).toEqual([
      ['nested/deeper/sunk.css', 2],
      ['top.css', 1],
    ]);
  });

  it('scans only through the shared walker', () => {
    expectScansOnlyThroughSharedWalkers(import.meta.url, ['css_tree_under']);
  });
});
