// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InteractPromptPainter } from '../src/ui/interact_prompt_painter';
import { makeWriterFacet } from '../src/ui/painter_host';

// resolve(process.cwd()), not import.meta.url: this suite runs under happy-dom,
// where import.meta.url is an http URL that readFileSync refuses.
const hudCss = readFileSync(resolve(process.cwd(), 'src/styles/hud.css'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

/** The declarations of one rule block, by its exact selector line. */
function ruleBody(selector: string): string {
  const start = hudCss.indexOf(`\n  ${selector} {`);
  expect(start, `no \`${selector}\` rule in hud.css`).toBeGreaterThan(-1);
  const end = hudCss.indexOf('\n  }', start);
  return hudCss.slice(start, end);
}

describe('InteractPromptPainter', () => {
  it('performs zero DOM writes when asked to paint identical state twice', () => {
    const root = document.createElement('div');
    const keycap = document.createElement('span');
    const verb = document.createElement('span');
    const name = document.createElement('span');
    let writes = 0;
    let skips = 0;
    const writers = makeWriterFacet(
      new WeakMap(),
      new WeakMap(),
      new WeakMap(),
      new WeakMap(),
      () => writes++,
      () => skips++,
    );
    const painter = new InteractPromptPainter(writers, { root, keycap, verb, name });
    const state = {
      visible: true,
      padActive: false,
      padTone: null,
      verb: 'Speak with',
      targetName: 'Elder Maren',
      keycap: 'e',
      holdProgress: 0,
      holding: false,
    };

    painter.paint(state);
    expect(writes).toBeGreaterThan(0);
    writes = 0;
    skips = 0;
    painter.paint(state);

    expect(writes).toBe(0);
    expect(skips).toBeGreaterThan(0);
  });

  it('paints the active face-button tone through facet writers', () => {
    const root = document.createElement('div');
    const keycap = document.createElement('span');
    const painter = new InteractPromptPainter(
      makeWriterFacet(
        new WeakMap(),
        new WeakMap(),
        new WeakMap(),
        new WeakMap(),
        () => undefined,
        () => undefined,
      ),
      { root, keycap, verb: document.createElement('span'), name: document.createElement('span') },
    );

    // NOTE: holdProgress / holding are a PAINTER CONTRACT, not shipped
    // behaviour. resolveNearbyInteractionCandidate returns holdProgress: null on
    // every path and no hold-to-interact timer exists anywhere (gamepad
    // long-press included), so the values below are fabricated to pin the
    // custom-property write, never evidence that a hold ring is reachable.
    painter.paint({
      visible: true,
      padActive: true,
      padTone: 'a',
      verb: 'Speak with',
      targetName: 'Apothecary Lin',
      keycap: 'A',
      holdProgress: 0.25,
      holding: true,
    });

    expect(root.classList.contains('is-pad-a')).toBe(true);
    expect(keycap.style.getPropertyValue('--interact-hold-progress')).toBe('0.250');
  });
});

// The prompt is a hint pill that lives over the world, and the painter shows it by
// adding `.is-visible` rather than by detaching it. So the HIDDEN state has to be
// hidden to the pointer as well: an invisible pill left in the hit test would eat
// clicks aimed at whatever is under it (the interaction prompt sits above the
// action bars). Both halves are pinned: `visibility: hidden` keeps it out of the
// hit test and out of the accessibility tree, and `pointer-events: none` on the
// base rule is the belt for the fade window, where visibility is still visible
// while opacity runs to 0.
describe('#interact-prompt hidden state (hud.css)', () => {
  const base = ruleBody('#interact-prompt');
  const visible = ruleBody('#interact-prompt.is-visible');

  it('never intercepts a pointer while hidden', () => {
    expect(base).toMatch(/pointer-events:\s*none;/);
    expect(base).toMatch(/visibility:\s*hidden;/);
  });

  it('does not hand the pointer back on the visible arm either', () => {
    expect(visible).toMatch(/visibility:\s*visible;/);
    expect(visible).not.toMatch(/pointer-events:/);
  });
});
