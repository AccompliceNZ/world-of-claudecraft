// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { InteractPromptPainter } from '../src/ui/interact_prompt_painter';
import { makeWriterFacet } from '../src/ui/painter_host';

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
