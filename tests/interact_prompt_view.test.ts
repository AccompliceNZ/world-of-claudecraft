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

  // The two arms intentional gathering left the generic press: a placed feast
  // is an entity and prints its own name, a garden bed is CONTENT and has no
  // wire name at all, so the family's own word stands in for it.
  it('names the feast from the entity and the bed from its own family word', () => {
    const view = createInteractPromptView(
      (label) => label,
      () => null,
    );

    expect(
      view.tick(
        {
          verb: 'use',
          targetKind: 'raw',
          targetId: 'harvest_feast_placed',
          targetName: 'Harvest Feast',
          holdProgress: null,
        },
        false,
        'KeyE',
        null,
        'generic',
      ),
    ).toMatchObject({ visible: true, verb: 'Use', targetName: 'Harvest Feast' });

    expect(
      view.tick(
        {
          verb: 'open',
          targetKind: 'bed',
          targetId: 'bed_eastbrook_1',
          targetName: '',
          holdProgress: null,
        },
        false,
        'KeyE',
        null,
        'generic',
      ),
    ).toMatchObject({ visible: true, verb: 'Open', targetName: 'Garden Bed' });
  });

  it('uses the default confirm glyph, falls back to interact, and clamps hold progress', () => {
    const view = createInteractPromptView(
      (label) => label,
      (bindings, action, kind) =>
        `${kind}:${bindings.find((entry) => entry.action === action)?.button}`,
    );
    // NOTE: holdProgress is a VIEW CONTRACT, not shipped behaviour. Nothing in
    // production produces a non-null one today: resolveNearbyInteractionCandidate
    // returns holdProgress: null on every path and there is no hold-to-interact
    // timer anywhere, gamepad long-press included. The value below is fabricated
    // to pin the clamp, so it must not be read as evidence that a hold exists.
    const candidate = { ...npcCandidate, holdProgress: 1.4 };

    expect(
      view.tick(candidate, true, 'KeyE', [{ button: 0, action: 'confirm' }], 'nintendo'),
    ).toMatchObject({
      padActive: true,
      keycap: 'nintendo:0',
      holdProgress: 1,
      holding: true,
    });

    expect(
      view.tick(candidate, true, 'KeyE', [{ button: 2, action: 'interact' }], 'xbox'),
    ).toMatchObject({ keycap: 'xbox:2' });
  });

  // Pin moved: the tone used to be a lookup by raw W3C button index, so index 0
  // came out Xbox-A green whatever the pad printed. It now follows the glyph the
  // player is actually reading, so a letter and its colour agree per brand.
  it('colours the keycap by the brand glyph, not the raw button index', () => {
    const view = createInteractPromptView((binding) => binding, labelForGamepadAction);
    const confirm = [{ button: 0, action: 'confirm' }];

    // Index 0 is A on an Xbox pad (green) but B on a Switch pad (red), and the
    // colour follows the letter each of them prints.
    expect(view.tick(npcCandidate, true, 'KeyE', confirm, 'xbox')).toMatchObject({
      padTone: 'a',
      keycap: 'A',
    });
    expect(view.tick(npcCandidate, true, 'KeyE', confirm, 'nintendo')).toMatchObject({
      padTone: 'b',
      keycap: 'B',
    });
    // A PlayStation pad prints shapes, whose colours are not the letter colours,
    // so its face buttons take no tone at all instead of a wrong one.
    expect(view.tick(npcCandidate, true, 'KeyE', confirm, 'playstation')).toMatchObject({
      padTone: null,
      keycap: 'Cross',
    });
    // The generic family prints both conventions; the tone follows the letter.
    expect(view.tick(npcCandidate, true, 'KeyE', confirm, 'generic')).toMatchObject({
      padTone: 'a',
      keycap: 'A / Cross',
    });
    // A shoulder is never a face button on any brand.
    expect(
      view.tick(npcCandidate, true, 'KeyE', [{ button: 4, action: 'confirm' }], 'nintendo'),
    ).toMatchObject({ padTone: null, keycap: 'L' });
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
