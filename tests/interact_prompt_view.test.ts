import { describe, expect, it } from 'vitest';
import { labelForGamepadAction } from '../src/game/gamepad_bindings';
import { DEFAULT_GAMEPAD_BINDINGS } from '../src/game/gamepad_map';
import { createInteractPromptView } from '../src/ui/interact_prompt_view';
import { assertAllocationStable } from './util/alloc_probe';

const npcCandidate = {
  verb: 'talk' as const,
  targetKind: 'npc' as const,
  targetId: 'apothecary_lin',
  targetName: 'Wrong fallback',
  holdProgress: null,
};

describe('interaction prompt view', () => {
  it('localizes the action and entity while resolving the live keyboard binding', () => {
    const view = createInteractPromptView(
      (label) => `key:${label}`,
      (bindings, action, kind) =>
        `${kind}:${bindings.find((entry) => entry.action === action)?.button}`,
    );

    expect(view.tick(npcCandidate, false, 'Shift+KeyE', null, 'generic')).toEqual({
      visible: true,
      padActive: false,
      padTone: null,
      verb: 'Speak with',
      targetName: 'Apothecary Lin',
      keycap: 'key:Shift+KeyE',
      holdProgress: 0,
      holding: false,
    });
  });

  it('uses the default confirm glyph, falls back to interact, and clamps hold progress', () => {
    const view = createInteractPromptView(
      (label) => label,
      (bindings, action, kind) =>
        `${kind}:${bindings.find((entry) => entry.action === action)?.button}`,
    );
    const candidate = { ...npcCandidate, holdProgress: 1.4 };

    expect(
      view.tick(candidate, true, 'KeyE', [{ button: 0, action: 'confirm' }], 'nintendo'),
    ).toMatchObject({
      padActive: true,
      padTone: 'a',
      keycap: 'nintendo:0',
      holdProgress: 1,
      holding: true,
    });

    expect(
      view.tick(candidate, true, 'KeyE', [{ button: 2, action: 'interact' }], 'xbox'),
    ).toMatchObject({ padTone: 'x', keycap: 'xbox:2' });
  });

  it('shows the live default gamepad face glyph', () => {
    const view = createInteractPromptView((binding) => binding, labelForGamepadAction);
    const bindings = Object.entries(DEFAULT_GAMEPAD_BINDINGS).map(([button, action]) => ({
      button: Number(button),
      action,
    }));

    expect(view.tick(npcCandidate, true, 'KeyE', bindings, 'xbox')).toMatchObject({
      padTone: 'a',
      keycap: 'A',
    });
  });

  it.each([
    ['talk', 'Speak with'],
    ['loot', 'Loot'],
    ['open', 'Open'],
    ['gather', 'Gather'],
    ['mail', 'Check mail'],
    ['bank', 'Use bank'],
    ['use', 'Use'],
    ['harvest', 'Harvest'],
  ] as const)('localizes the %s action', (verb, label) => {
    const view = createInteractPromptView(
      (binding) => binding,
      () => null,
    );

    expect(view.tick({ ...npcCandidate, verb }, false, 'KeyE', null, 'generic').verb).toBe(label);
  });

  it('hides non-actions and reuses its output object', () => {
    const view = createInteractPromptView(
      (label) => label,
      () => 'A',
    );
    expect(view.tick(null, false, 'KeyE', null, 'generic').visible).toBe(false);
    assertAllocationStable(() => view.tick(null, false, 'KeyE', null, 'generic'));
  });
});
