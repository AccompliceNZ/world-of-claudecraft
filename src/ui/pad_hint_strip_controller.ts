// DOM adapter for the pad hint strip and the launcher legend. Finds the two
// static nodes, resolves every glyph off the LIVE gamepad bindings and the
// connected pad's brand, and drives the pure view into the painter.
//
// The resolution lives here rather than in the view because a registered pure
// core may not reach into src/game: the view is handed strings, this module is
// the one that knows a controller exists. Nothing is memoized: the painter's
// writers elide a repeat write, which is what keeps a language switch reaching
// the strip without a relocalize fan-out row of its own.

import { CROSS_HOTBAR_ARRANGE_CHORD } from '../game/cross_hotbar';
import type { GamepadBindingEntry } from '../game/gamepad_bindings';
import { labelForGamepadAction } from '../game/gamepad_bindings';
import type { GamepadControlHintSource } from '../game/gamepad_control_hint';
import { gamepadControlHint } from '../game/gamepad_control_hint';
import type { GamepadActionId, GamepadKind } from '../game/gamepad_map';
import {
  GAMEPAD_CONFIRM,
  GAMEPAD_CYCLE_HUD,
  GAMEPAD_CYCLE_SET,
  gamepadButtonLabel,
} from '../game/gamepad_map';
import { t } from './i18n';
import type { PadHintRowElements } from './pad_hint_strip_painter';
import { PadHintStripPainter } from './pad_hint_strip_painter';
import type { PadHintBinding, PadHintBindings, PadHintTone } from './pad_hint_strip_view';
import { createPadHintStripView } from './pad_hint_strip_view';
import type { PainterHostWriters } from './painter_host';

const STRIP_ID = 'pad-hint-strip';
const LEGEND_ID = 'pad-legend';
const ROW_SELECTOR = '.pad-hint-row';
const GLYPH_SELECTOR = '.pad-glyph, .pad-legend-glyph';
const LABEL_SELECTOR = '.pad-hint-label';

/** The four face buttons in W3C index order, so a resolved binding can say which
 *  colour the hardware prints it in. */
const FACE_TONES: readonly PadHintTone[] = ['a', 'b', 'x', 'y'];

/** What the strip needs off the live pad. Structurally the HUD's own
 *  GamepadBindingsHooks, narrowed to the five members this readout reads. */
export interface PadHintGamepadSource {
  entries(): readonly GamepadBindingEntry[];
  kind(): GamepadKind;
  crossHotbarEnabled(): boolean;
  crossHotbarSets(): readonly (readonly ({ type: 'ability' | 'item'; id: string } | null)[])[];
  crossHotbarSet(): number;
}

const UNBOUND: PadHintBinding = { glyph: '', tone: null };

/** The face-button colour for the FIRST of these actions the pad has a button
 *  for, or null when that button is not a face button (a shoulder, a stick
 *  click, a d-pad direction) or none of them is bound at all. The action order
 *  mirrors the resolver that picked the glyph, so the colour and the letter can
 *  never come from different buttons. */
function toneFor(
  entries: readonly GamepadBindingEntry[],
  ...actions: readonly GamepadActionId[]
): PadHintTone {
  for (const action of actions) {
    const entry = entries.find((candidate) => candidate.action === action);
    if (entry) return FACE_TONES[entry.button] ?? null;
  }
  return null;
}

function bindingFor(
  entries: readonly GamepadBindingEntry[],
  action: GamepadActionId,
  kind: GamepadKind,
): PadHintBinding {
  const glyph = labelForGamepadAction(entries, action, kind);
  return glyph ? { glyph, tone: toneFor(entries, action) } : UNBOUND;
}

/** A hint that resolves to a SEQUENCE of presses reads as one line here: the
 *  strip has one glyph slot per row, and a route the player cannot perform in
 *  one press is still a route worth naming. */
function fromHint(caps: readonly string[]): PadHintBinding {
  return caps.length > 0 ? { glyph: caps.join(' '), tone: null } : UNBOUND;
}

/** Resolve every glyph the two readouts name. Interact and the target menu go
 *  through gamepadControlHint so they answer with the button that REALLY
 *  performs them (confirm falls back to interact, and the target cycle may be a
 *  bare d-pad direction with no explicit bind at all). */
export function padHintBindings(source: PadHintGamepadSource): PadHintBindings {
  const entries = source.entries();
  const kind = source.kind();
  const hintSource: GamepadControlHintSource = {
    entries,
    kind,
    crossHotbarEnabled: source.crossHotbarEnabled(),
    crossHotbarSets: source.crossHotbarSets(),
    crossHotbarSet: source.crossHotbarSet(),
  };
  const interact = fromHint(gamepadControlHint(hintSource, { type: 'interact' }));
  const target = fromHint(gamepadControlHint(hintSource, { type: 'target' }));
  return {
    // The tone follows the button confirm actually sits on, which is what the
    // interact prompt's own keycap is coloured by, so one button is one colour.
    interact: { glyph: interact.glyph, tone: toneFor(entries, GAMEPAD_CONFIRM, 'interact') },
    targetMenu: { glyph: target.glyph, tone: toneFor(entries, 'target', 'targetPrev') },
    swapSet: bindingFor(entries, GAMEPAD_CYCLE_SET, kind),
    // The chord that opens arrange mode, named the way the bar's own hint names
    // it, so the two lines agree.
    arrangeBar: {
      glyph: t('hudChrome.controller.crossHotbarArrangeChord', {
        bumper: gamepadButtonLabel(CROSS_HOTBAR_ARRANGE_CHORD.bumper, kind),
        button: gamepadButtonLabel(CROSS_HOTBAR_ARRANGE_CHORD.button, kind),
      }),
      tone: null,
    },
    bags: bindingFor(entries, 'bags', kind),
    menu: bindingFor(entries, 'escape', kind),
    cycleHud: bindingFor(entries, GAMEPAD_CYCLE_HUD, kind),
  };
}

function harvestRows(root: HTMLElement): PadHintRowElements[] {
  const rows: PadHintRowElements[] = [];
  for (const row of root.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
    const glyph = row.querySelector<HTMLElement>(GLYPH_SELECTOR);
    const label = row.querySelector<HTMLElement>(LABEL_SELECTOR);
    if (glyph && label) rows.push({ root: row, glyph, label });
  }
  return rows;
}

export class PadHintStripController {
  private readonly view = createPadHintStripView();

  private constructor(private readonly painter: PadHintStripPainter) {}

  /** Build the pair, or answer undefined on a document without the static nodes
   *  (the defensive shape the cross hotbar and the mobile ring both use). */
  static create(writers: PainterHostWriters): PadHintStripController | undefined {
    const strip = document.getElementById(STRIP_ID);
    const legend = document.getElementById(LEGEND_ID);
    if (!strip || !legend) return undefined;
    return new PadHintStripController(
      new PadHintStripPainter(writers, {
        strip,
        legend,
        rows: harvestRows(strip),
        legendRows: harvestRows(legend),
      }),
    );
  }

  /** Repaint from the live bindings. A keyboard player, or a player with no pad
   *  layout at all, stands every row down instead of printing a stale glyph. */
  update(padActive: boolean, source: PadHintGamepadSource | null): void {
    this.painter.paint(this.view.tick(padActive, source ? padHintBindings(source) : null));
  }
}
