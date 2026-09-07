import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  PRESET_ORDER,
  resolveTheme,
  THEME_PRESETS,
  themeCssVars,
} from '../src/ui/theme';

// The interface primitive library contract (src/ui/library/CLAUDE.md): the
// selector manifest in the doc and the classes declared in src/styles/library.css
// agree both ways, the sheet sits in its own layer, the size and radius tokens it
// reads exist, the quality tokens mirror the classic anchor in icons.ts, and the
// theme derivations that back the library's text and surface tokens reproduce the
// static defaults for the classic preset and clear AA on every preset.
//
// Two explicit reads, no directory scan, so the shared-walker rule does not apply.

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8').replace(/\r\n/g, '\n');

const library = read('src/styles/library.css');
const tokens = read('src/styles/tokens.css');
const doc = read('src/ui/library/CLAUDE.md');
const icons = read('src/ui/icons.ts');

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Shared chrome classes the library composes but does not own (base.css glyph sizing
// and the .ui-dd dropdown family); they are not primitives and stay off the manifest.
const EXTERNAL_UI_CLASSES = new Set(['.ui-icon', '.ui-icon-art']);

/** Every `.ui-*` class selector token in the sheet, compound state forms included. */
function declaredSelectors(css: string): Set<string> {
  const out = new Set<string>();
  const code = stripComments(css).replace(/\{[^{}]*\}/g, '{}');
  // Compound states: the library's is-* names plus the action-bar painter classes the
  // socket family accepts as aliases (empty, used, proc, oor, unusable).
  for (const m of code.matchAll(
    /\.ui-[a-z0-9-]+(?:\.(?:is-[a-z0-9-]+|empty|used|proc|oor|unusable))?/g,
  )) {
    if (!EXTERNAL_UI_CLASSES.has(m[0])) out.add(m[0]);
  }
  return out;
}

function manifestSelectors(md: string): string[] {
  const block = md.match(/## Selector manifest[\s\S]*?```text\n([\s\S]*?)```/);
  if (!block) throw new Error('src/ui/library/CLAUDE.md has no selector manifest block');
  return block[1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

describe('ui library: sheet and manifest agree', () => {
  const declared = declaredSelectors(library);
  const manifest = manifestSelectors(doc);

  it('lists a real primitive set (anti-vacuity)', () => {
    expect(declared.size).toBeGreaterThanOrEqual(50);
    expect(manifest.length).toBeGreaterThanOrEqual(50);
    for (const sentinel of [
      '.ui-window',
      '.ui-socket',
      '.ui-aura',
      '.ui-tabs',
      '.ui-range',
      '.ui-btn',
    ]) {
      expect(declared.has(sentinel), `${sentinel} missing from library.css`).toBe(true);
    }
  });

  it('every manifest line is declared in library.css', () => {
    const missing = manifest.filter((s) => !declared.has(s));
    expect(missing, 'manifest names a class library.css does not declare').toEqual([]);
  });

  it('every declared ui-* class is in the manifest', () => {
    const set = new Set(manifest);
    const undocumented = [...declared].filter((s) => !set.has(s)).sort();
    expect(undocumented, 'library.css declares a class the manifest does not name').toEqual([]);
  });

  it('keeps the manifest sorted and duplicate-free', () => {
    expect(manifest).toEqual([...new Set(manifest)].sort());
  });
});

describe('ui library: the sheet', () => {
  it('sits inside @layer library under its banner', () => {
    expect(stripComments(library).trimStart().startsWith('@layer library {')).toBe(true);
    expect(library).toContain('/* ---------- ui library (shared primitives) ---------- */');
  });

  it('is imported by the barrel between layout and components', () => {
    const barrel = read('src/styles/index.css');
    expect(barrel).toContain(
      '@layer tokens, base, layout, library, components, hud, shell, hud-mobile, index-extra, play-extra;',
    );
    const at = (m: string) => barrel.indexOf(`@import "./${m}";`);
    expect(at('library.css')).toBeGreaterThan(at('layout.css'));
    // The claim in the title is layout < library < components; hud.css sits between
    // the last two, so it is pinned as well rather than standing in for components.
    expect(at('library.css')).toBeLessThan(at('hud.css'));
    expect(at('library.css')).toBeLessThan(at('components.css'));
  });

  it('declares every size, radius and duration token the primitives read', () => {
    const code = stripComments(tokens);
    for (const name of [
      '--socket-size',
      '--socket-size-bag',
      '--socket-size-bank',
      '--socket-size-stance',
      // The coarse-pointer arm of the stance disc: the board's 30px on a
      // mouse, the 40px touch floor under @media (pointer: coarse).
      '--socket-size-stance-coarse',
      '--socket-gap',
      '--socket-row-gap',
      '--action-rail-w',
      '--aura-size',
      '--aura-size-own',
      '--portrait-size',
      '--level-chip-size',
      '--bar-h',
      '--bar-h-hp',
      '--bar-h-res',
      '--bar-h-res-empty',
      '--bar-notch',
      '--castbar-w',
      '--castbar-h',
      '--xp-rail-h',
      '--win-head-h',
      '--btn-h',
      '--tab-h',
      '--input-h',
      '--radius-2xs',
      '--radius-xs',
      '--radius-card',
      '--radius-panel',
      '--radius-socket',
      '--radius-cell',
      '--radius-window',
      '--radius-pill',
      '--dur-fast',
      '--dur-press',
      '--dur-panel',
      '--dur-frame',
    ]) {
      expect(code, `${name} missing from tokens.css`).toContain(`${name}:`);
    }
  });

  it('lifts the stance disc to the touch floor on a coarse pointer', () => {
    // The stance disc is the one socket species drawn under 40px. The shipped
    // .stance-btn was 40x40, so a touch device must keep that box even though
    // the board draws a 30px disc for a mouse. Playwright's context is always
    // fine-pointer, so this media arm can only be pinned from the source.
    const coarse = stripComments(library).match(
      /@media \(pointer: coarse\) \{\s*\.ui-socket--stance \{([^}]*)\}/,
    );
    expect(coarse, 'library.css is missing the coarse-pointer stance arm').not.toBeNull();
    expect(coarse?.[1]).toContain('--ui-socket-size: var(--socket-size-stance-coarse);');
    expect(stripComments(tokens)).toContain('--socket-size-stance-coarse: 40px;');
  });

  it('keeps the action rail exactly twelve sockets wide', () => {
    expect(stripComments(tokens)).toContain(
      '--action-rail-w: calc(12 * var(--socket-size) + 11 * var(--socket-gap));',
    );
  });

  it('mirrors QUALITY_COLOR in the quality tokens (icons.ts stays the anchor)', () => {
    const block = icons.match(/export const QUALITY_COLOR[^{]*\{([\s\S]*?)\};/);
    if (!block) throw new Error('QUALITY_COLOR not found in icons.ts');
    const anchor = new Map<string, string>();
    for (const m of block[1].matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g))
      anchor.set(m[1], m[2].toLowerCase());
    expect(anchor.size).toBe(6);
    for (const [quality, hex] of anchor) {
      expect(stripComments(tokens)).toContain(`--color-quality-${quality}: ${hex};`);
    }
  });
});

describe('ui library: theme derivations back the text and surface tokens', () => {
  const classic = themeCssVars(THEME_PRESETS.classic);
  const staticDefault = (name: string) => {
    const m = stripComments(tokens).match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!m) throw new Error(`${name} missing from tokens.css`);
    // Biome wraps long values across lines; compare the single-line form.
    return m[1].replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  };

  it('the classic preset reproduces the static defaults exactly (one value, two homes agree)', () => {
    expect(classic['--color-text-secondary']).toBe(staticDefault('--color-text-secondary'));
    expect(classic['--color-text-faint']).toBe(staticDefault('--color-text-faint'));
    expect(classic['--panel-bg-soft']).toBe(staticDefault('--panel-bg-soft'));
    expect(classic['--panel-bg-strong']).toBe(staticDefault('--panel-bg-strong'));
    for (const name of [
      '--color-info',
      '--color-warning',
      '--color-socket-hi',
      '--color-panel-hi',
      '--color-glint',
      '--color-control-border',
    ]) {
      expect(classic[name], name).toBe(staticDefault(name));
    }
  });

  it('secondary, faint, info and warning text clear the text tier on every preset', () => {
    for (const id of PRESET_ORDER) {
      const vars = themeCssVars(resolveTheme({ preset: id, custom: {} }));
      for (const bg of [vars['--panel-base'], vars['--panel-edge']]) {
        expect(
          contrastRatio(vars['--color-text-secondary'], bg),
          `${id} secondary on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(vars['--color-text-faint'], bg),
          `${id} faint on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(vars['--color-info'], bg),
          `${id} info on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(vars['--color-warning'], bg),
          `${id} warning on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the soft and strong panel fills keep the panel gradient shape at their alphas', () => {
    for (const id of PRESET_ORDER) {
      const vars = themeCssVars(resolveTheme({ preset: id, custom: {} }));
      expect(vars['--panel-bg-soft']).toMatch(
        /^linear-gradient\(170deg, rgba\(\d+, \d+, \d+, 0\.74\) 0%/,
      );
      expect(vars['--panel-bg-strong']).toMatch(
        /^linear-gradient\(170deg, rgba\(\d+, \d+, \d+, 0\.97\) 0%/,
      );
    }
  });
});
