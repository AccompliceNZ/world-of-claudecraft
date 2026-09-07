// Pure view model for the two pad-mode readouts a keycap-free HUD owes a
// controller player: the right-hand hint strip (Interact, Target menu, Swap set,
// Arrange bar) and the legend under the launcher rail (Bags, Menu, Cycle HUD).
//
// Host-agnostic by contract, so it names no gamepad button and reads no binding
// store: the caller resolves every glyph off the LIVE bindings and the connected
// pad's brand and hands them in, which is what lets a rebound or non-Xbox pad
// name its own buttons instead of the strip printing letters nobody has.
//
// Row COUNT is fixed and matches the static markup, so an unbound action stands
// its row down rather than shifting the ones under it.

import { type TranslationKey, t } from './i18n';

/** Which of the four face buttons a glyph names, so it can take the hardware
 *  colour. Null for a shoulder, a d-pad direction, or a chord. */
export type PadHintTone = 'a' | 'b' | 'x' | 'y' | null;

/** One resolved binding: what this pad prints for it, and which face button it
 *  is (if any). An empty glyph means the action is not reachable on this pad. */
export interface PadHintBinding {
  glyph: string;
  tone: PadHintTone;
}

/** Every binding the two readouts name, resolved by the caller. */
export interface PadHintBindings {
  interact: PadHintBinding;
  targetMenu: PadHintBinding;
  swapSet: PadHintBinding;
  arrangeBar: PadHintBinding;
  bags: PadHintBinding;
  menu: PadHintBinding;
  cycleHud: PadHintBinding;
}

export interface PadHintRow {
  glyph: string;
  tone: PadHintTone;
  label: string;
  /** False for an action this pad has no button for: the row stands down. */
  visible: boolean;
}

export interface PadHintStripState {
  /** Whether the pad is the live input at all. */
  visible: boolean;
  /** The strip's accessible name, so the four rows read as one group. */
  label: string;
  /** Always four rows, in board order. */
  rows: readonly PadHintRow[];
  /** Always three entries, in board order. */
  legend: readonly PadHintRow[];
}

/** The strip, top to bottom. */
const STRIP_KEYS: readonly TranslationKey[] = [
  'hudChrome.controller.padHintInteract',
  'hudChrome.controller.padHintTargetMenu',
  'hudChrome.controller.padHintSwapSet',
  'hudChrome.controller.padHintArrangeBar',
];

/** The legend, left to right, in the order the launchers sit on the rail. */
const LEGEND_KEYS: readonly TranslationKey[] = [
  'hudChrome.controller.padLegendBags',
  'hudChrome.controller.padLegendMenu',
  'hudChrome.controller.padLegendCycleHud',
];

export const PAD_HINT_ROW_COUNT = STRIP_KEYS.length;
export const PAD_LEGEND_ROW_COUNT = LEGEND_KEYS.length;

function stripBindings(bindings: PadHintBindings): readonly PadHintBinding[] {
  return [bindings.interact, bindings.targetMenu, bindings.swapSet, bindings.arrangeBar];
}

function legendBindings(bindings: PadHintBindings): readonly PadHintBinding[] {
  return [bindings.bags, bindings.menu, bindings.cycleHud];
}

const UNBOUND: PadHintBinding = { glyph: '', tone: null };

export interface PadHintStripView {
  tick(padActive: boolean, bindings: PadHintBindings | null): PadHintStripState;
}

/**
 * Build the view. The state object is stable across ticks (the interact-prompt
 * shape): the caller hands it straight to a painter whose writers elide, so a
 * frame that changes nothing costs no DOM write and no memo is needed here.
 */
export function createPadHintStripView(): PadHintStripView {
  const rows: PadHintRow[] = STRIP_KEYS.map(() => ({
    glyph: '',
    tone: null,
    label: '',
    visible: false,
  }));
  const legend: PadHintRow[] = LEGEND_KEYS.map(() => ({
    glyph: '',
    tone: null,
    label: '',
    visible: false,
  }));
  const state: PadHintStripState = { visible: false, label: '', rows, legend };

  const fill = (
    target: PadHintRow[],
    keys: readonly TranslationKey[],
    resolved: readonly PadHintBinding[],
    visible: boolean,
  ): void => {
    for (let i = 0; i < target.length; i++) {
      const binding = resolved[i] ?? UNBOUND;
      target[i].glyph = binding.glyph;
      target[i].tone = binding.tone;
      // Localized every tick rather than latched: a language switch has to reach
      // the strip, and the painter's writers drop the repeat anyway.
      target[i].label = t(keys[i]);
      target[i].visible = visible && binding.glyph.length > 0;
    }
  };

  return {
    tick(padActive, bindings) {
      state.visible = padActive && bindings !== null;
      state.label = t('hudChrome.controller.padHintLabel');
      fill(rows, STRIP_KEYS, bindings ? stripBindings(bindings) : [], state.visible);
      fill(legend, LEGEND_KEYS, bindings ? legendBindings(bindings) : [], state.visible);
      return state;
    },
  };
}
