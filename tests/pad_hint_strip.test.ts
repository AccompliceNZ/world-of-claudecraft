// @vitest-environment jsdom
// Behavioral pins for the pad hint strip and the launcher legend: the controller
// player's replacement for the key knowledge a keycap-free HUD takes away.
//
// The property that matters is that NO button name is baked in. Every glyph is
// resolved off the live bindings and the connected pad's brand, so a rebind or a
// PlayStation pad renames the strip; the shipped default appearing on a rebound
// pad is exactly the regression these cases exist to catch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GamepadBindingEntry } from '../src/game/gamepad_bindings';
import { GAMEPAD_CONFIRM, GAMEPAD_CYCLE_HUD, GAMEPAD_CYCLE_SET, GP } from '../src/game/gamepad_map';
import {
  type PadHintGamepadSource,
  PadHintStripController,
  padHintBindings,
} from '../src/ui/pad_hint_strip_controller';
import {
  createPadHintStripView,
  PAD_HINT_ROW_COUNT,
  PAD_LEGEND_ROW_COUNT,
} from '../src/ui/pad_hint_strip_view';
import { makeWriterFacet } from '../src/ui/painter_host';

/** The shipped defaults, narrowed to the buttons the two readouts name. */
const DEFAULT_ENTRIES: GamepadBindingEntry[] = [
  { button: GP.A, action: GAMEPAD_CONFIRM },
  { button: GP.X, action: 'target' },
  { button: GP.RB, action: GAMEPAD_CYCLE_SET },
  { button: GP.BACK, action: 'bags' },
  { button: GP.START, action: 'escape' },
  { button: GP.R3, action: GAMEPAD_CYCLE_HUD },
];

function source(
  entries: readonly GamepadBindingEntry[] = DEFAULT_ENTRIES,
  kind: PadHintGamepadSource extends { kind(): infer K } ? K : never = 'xbox',
): PadHintGamepadSource {
  return {
    entries: () => entries,
    kind: () => kind,
    crossHotbarEnabled: () => true,
    crossHotbarSets: () => [],
    crossHotbarSet: () => 0,
  };
}

/** The static markup both entries ship, harvested from index.html so the test
 *  cannot drift from the real node shape. */
function mountShippedMarkup(): void {
  const entry = readFileSync(join(__dirname, '../index.html'), 'utf8');
  const start = entry.indexOf('<div id="pad-hint-strip"');
  const end = entry.indexOf('<div id="click-move-marker"');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  document.body.innerHTML = entry.slice(start, end);
}

let writes = 0;
let skips = 0;

function build(): PadHintStripController {
  mountShippedMarkup();
  writes = 0;
  skips = 0;
  const writers = makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {
      writes++;
    },
    () => {
      skips++;
    },
  );
  const controller = PadHintStripController.create(writers);
  expect(controller).toBeDefined();
  return controller as PadHintStripController;
}

function glyphs(rootId: string): string[] {
  const root = document.getElementById(rootId) as HTMLElement;
  return [...root.querySelectorAll<HTMLElement>('.pad-glyph, .pad-legend-glyph')].map(
    (el) => el.textContent ?? '',
  );
}

function labels(rootId: string): string[] {
  const root = document.getElementById(rootId) as HTMLElement;
  return [...root.querySelectorAll<HTMLElement>('.pad-hint-label')].map(
    (el) => el.textContent ?? '',
  );
}

function shownRows(rootId: string): number {
  const root = document.getElementById(rootId) as HTMLElement;
  return [...root.querySelectorAll<HTMLElement>('.pad-hint-row')].filter(
    (el) => el.style.display !== 'none',
  ).length;
}

describe('padHintBindings', () => {
  it('names the buttons the shipped defaults actually sit on', () => {
    const b = padHintBindings(source());
    expect(b.interact.glyph).toBe('A');
    expect(b.targetMenu.glyph).toBe('X');
    expect(b.swapSet.glyph).toBe('RB');
    expect(b.arrangeBar.glyph).toBe('LB + Y');
    expect(b.bags.glyph).toBe('View');
    expect(b.menu.glyph).toBe('Menu');
    expect(b.cycleHud.glyph).toBe('R3');
  });

  it('follows a REBIND rather than the shipped default', () => {
    // The same actions, moved: confirm to B, the set swap to LB.
    const rebound: GamepadBindingEntry[] = [
      { button: GP.B, action: GAMEPAD_CONFIRM },
      { button: GP.LB, action: GAMEPAD_CYCLE_SET },
    ];
    const b = padHintBindings(source(rebound));
    expect(b.interact.glyph).toBe('B');
    expect(b.interact.tone).toBe('b');
    expect(b.swapSet.glyph).toBe('LB');
  });

  it('follows the connected pad brand', () => {
    expect(padHintBindings(source(DEFAULT_ENTRIES, 'playstation')).interact.glyph).toBe('Cross');
    expect(padHintBindings(source(DEFAULT_ENTRIES, 'nintendo')).interact.glyph).toBe('B');
    // The arrange chord is two hardware names, so BOTH follow the brand.
    expect(padHintBindings(source(DEFAULT_ENTRIES, 'playstation')).arrangeBar.glyph).toBe(
      'L1 + Triangle',
    );
  });

  it('colours a face button and leaves a shoulder uncoloured', () => {
    const b = padHintBindings(source());
    expect(b.interact.tone).toBe('a');
    expect(b.targetMenu.tone).toBe('x');
    // RB is a shoulder and the arrange chord is a chord: neither is one colour.
    expect(b.swapSet.tone).toBeNull();
    expect(b.arrangeBar.tone).toBeNull();
  });

  it('answers empty for an action this pad cannot reach', () => {
    expect(padHintBindings(source([])).swapSet.glyph).toBe('');
    expect(padHintBindings(source([])).bags.glyph).toBe('');
  });

  it('finds the bare d-pad target cycle when nothing is bound to targeting', () => {
    // The manager cycles targets on an otherwise-idle horizontal d-pad, so the
    // strip has to name that route rather than dropping the row.
    const idle: GamepadBindingEntry[] = [{ button: GP.DPAD_RIGHT, action: 'none' }];
    expect(padHintBindings(source(idle)).targetMenu.glyph).toBe('D-pad →');
  });
});

describe('the pad hint view', () => {
  it('keeps a fixed row count so an unbound action shifts nothing', () => {
    const view = createPadHintStripView();
    const state = view.tick(true, padHintBindings(source([])));
    expect(state.rows).toHaveLength(PAD_HINT_ROW_COUNT);
    expect(state.legend).toHaveLength(PAD_LEGEND_ROW_COUNT);
    // The arrange chord is a hardware chord, not a binding, so it survives an
    // empty layout; everything else stands down.
    expect(state.rows.filter((r) => r.visible).map((r) => r.glyph)).toEqual(['LB + Y']);
    expect(state.legend.every((r) => !r.visible)).toBe(true);
  });

  it('stands every row down for a keyboard player', () => {
    const view = createPadHintStripView();
    const state = view.tick(false, padHintBindings(source()));
    expect(state.visible).toBe(false);
    expect(state.rows.every((r) => !r.visible)).toBe(true);
    expect(state.legend.every((r) => !r.visible)).toBe(true);
  });

  it('labels every row from the catalog, never from the glyph', () => {
    const view = createPadHintStripView();
    const state = view.tick(true, padHintBindings(source()));
    expect(state.rows.map((r) => r.label)).toEqual([
      'Interact',
      'Target menu',
      'Swap set',
      'Arrange bar',
    ]);
    expect(state.legend.map((r) => r.label)).toEqual(['Bags', 'Menu', 'Cycle HUD']);
    expect(state.label).toBe('Controller hints');
  });
});

describe('the pad hint controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('answers undefined on a document without the static nodes', () => {
    document.body.innerHTML = '<div id="ui"></div>';
    const writers = makeWriterFacet(
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      () => {},
      () => {},
    );
    expect(PadHintStripController.create(writers)).toBeUndefined();
  });

  it('paints both readouts from the live bindings', () => {
    const controller = build();
    controller.update(true, source());
    expect(glyphs('pad-hint-strip')).toEqual(['A', 'X', 'RB', 'LB + Y']);
    expect(labels('pad-hint-strip')).toEqual([
      'Interact',
      'Target menu',
      'Swap set',
      'Arrange bar',
    ]);
    expect(glyphs('pad-legend')).toEqual(['View', 'Menu', 'R3']);
    expect(labels('pad-legend')).toEqual(['Bags', 'Menu', 'Cycle HUD']);
  });

  it('gives a face-button row its hardware colour and takes it back on a rebind', () => {
    const controller = build();
    controller.update(true, source());
    const interact = document.querySelectorAll<HTMLElement>('#pad-hint-strip .pad-glyph')[0];
    expect(interact.classList.contains('pad-glyph--a')).toBe(true);
    controller.update(true, source([{ button: GP.Y, action: GAMEPAD_CONFIRM }]));
    expect(interact.classList.contains('pad-glyph--a')).toBe(false);
    expect(interact.classList.contains('pad-glyph--y')).toBe(true);
  });

  it('stands rows down for a keyboard player without hiding the roots', () => {
    const controller = build();
    controller.update(true, source());
    expect(shownRows('pad-hint-strip')).toBe(PAD_HINT_ROW_COUNT);
    controller.update(false, source());
    expect(shownRows('pad-hint-strip')).toBe(0);
    expect(shownRows('pad-legend')).toBe(0);
    // The stylesheet alone decides whether the readouts exist on screen: an
    // inline display here would beat body.xhb-mode and strand them.
    expect(document.getElementById('pad-hint-strip')?.style.display).toBe('');
    expect(document.getElementById('pad-legend')?.style.display).toBe('');
  });

  it('writes through the facet and elides an unchanged repaint', () => {
    const controller = build();
    controller.update(true, source());
    const first = writes;
    expect(first).toBeGreaterThan(0);
    const skipsAfterFirst = skips;
    controller.update(true, source());
    expect(writes).toBe(first);
    expect(skips).toBeGreaterThan(skipsAfterFirst);
  });
});
