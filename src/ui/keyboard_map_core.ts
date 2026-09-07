// Pure model for the Key Bindings panel's keyboard overview: a standard desktop
// keyboard (main block, navigation cluster, numpad) plus the three bindable
// mouse buttons, each key annotated with what the player's current bindings
// put on it. DOM-free and game-free: the caller hands in the Keybinds snapshot
// (actionId -> [primary, secondary] combos) and resolvers for the key legend,
// the action's display name and its category, and gets back the blocks the
// painter (keyboard_map.ts) lays out. Registered in tests/architecture.test.ts
// UI_PURE_CORES.
//
// A binding is a combo string: the bare KeyboardEvent.code, optionally prefixed
// by modifiers in canonical order ("Shift+Digit1", see src/game/keybinds.ts).
// The overview shows one modifier LAYER at a time (none, Shift, Ctrl, Alt): a
// key is painted with the binding it carries in the selected layer, and marked
// when it also carries bindings in other layers, all of which the key's
// tooltip / detail line lists.

import type { TranslationKey } from './i18n';

/** A modifier layer: the canonical combo head, '' for the bare key. */
export type KeyboardLayer = '' | 'Shift+' | 'Ctrl+' | 'Alt+';

export const KEYBOARD_LAYERS: { id: KeyboardLayer; labelKey: TranslationKey }[] = [
  { id: '', labelKey: 'hudChrome.keyboardMap.layerNone' },
  { id: 'Shift+', labelKey: 'hudChrome.keyboardMap.layerShift' },
  { id: 'Ctrl+', labelKey: 'hudChrome.keyboardMap.layerCtrl' },
  { id: 'Alt+', labelKey: 'hudChrome.keyboardMap.layerAlt' },
];

/** One physical key: its KeyboardEvent.code, width and height in key units
 *  (1 = a letter key), and an optional legend override for keys whose code
 *  label is too long for a keycap. A `spacer` is an empty cell that keeps the
 *  row geometry (the gap between F-key groups, the arrow cluster's blank). */
export interface KeyboardKeySpec {
  code: string;
  w?: number;
  h?: number;
  legend?: string;
  spacer?: boolean;
}

export type KeyboardBlockId = 'main' | 'nav' | 'numpad' | 'mouse';

export interface KeyboardBlockSpec {
  id: KeyboardBlockId;
  /** Width in key units; the painter's grid uses quarter-unit columns. */
  units: number;
  rows: KeyboardKeySpec[][];
}

const gap = (w: number): KeyboardKeySpec => ({ code: '', w, spacer: true });
const keys = (...codes: string[]): KeyboardKeySpec[] => codes.map((code) => ({ code }));

/** The layout, ANSI-style. Row 0 of every block lines up with the F-key row. */
export const KEYBOARD_LAYOUT: KeyboardBlockSpec[] = [
  {
    id: 'main',
    units: 15,
    rows: [
      [
        { code: 'Escape' },
        gap(1),
        ...keys('F1', 'F2', 'F3', 'F4'),
        gap(0.5),
        ...keys('F5', 'F6', 'F7', 'F8'),
        gap(0.5),
        ...keys('F9', 'F10', 'F11', 'F12'),
      ],
      [
        ...keys(
          'Backquote',
          'Digit1',
          'Digit2',
          'Digit3',
          'Digit4',
          'Digit5',
          'Digit6',
          'Digit7',
          'Digit8',
          'Digit9',
          'Digit0',
          'Minus',
          'Equal',
        ),
        { code: 'Backspace', w: 2, legend: 'Bksp' },
      ],
      [
        { code: 'Tab', w: 1.5 },
        ...keys('KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'),
        ...keys('BracketLeft', 'BracketRight'),
        { code: 'Backslash', w: 1.5 },
      ],
      [
        { code: 'CapsLock', w: 1.75 },
        ...keys('KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'),
        ...keys('Semicolon', 'Quote'),
        { code: 'Enter', w: 2.25 },
      ],
      [
        { code: 'ShiftLeft', w: 2.25, legend: 'Shift' },
        ...keys('KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'),
        ...keys('Comma', 'Period', 'Slash'),
        { code: 'ShiftRight', w: 2.75, legend: 'Shift' },
      ],
      [
        { code: 'ControlLeft', w: 1.25, legend: 'Ctrl' },
        { code: 'MetaLeft', w: 1.25, legend: 'Meta' },
        { code: 'AltLeft', w: 1.25, legend: 'Alt' },
        { code: 'Space', w: 6.25 },
        { code: 'AltRight', w: 1.25, legend: 'Alt' },
        { code: 'MetaRight', w: 1.25, legend: 'Meta' },
        { code: 'ContextMenu', w: 1.25, legend: 'Menu' },
        { code: 'ControlRight', w: 1.25, legend: 'Ctrl' },
      ],
    ],
  },
  {
    id: 'nav',
    units: 3,
    rows: [
      [gap(3)],
      [{ code: 'Insert', legend: 'Ins' }, { code: 'Home' }, { code: 'PageUp', legend: 'PgUp' }],
      [{ code: 'Delete', legend: 'Del' }, { code: 'End' }, { code: 'PageDown', legend: 'PgDn' }],
      [gap(3)],
      [gap(1), { code: 'ArrowUp' }, gap(1)],
      [{ code: 'ArrowLeft' }, { code: 'ArrowDown' }, { code: 'ArrowRight' }],
    ],
  },
  {
    id: 'numpad',
    units: 4,
    rows: [
      [gap(4)],
      [
        { code: 'NumLock', legend: 'Num' },
        { code: 'NumpadDivide', legend: '/' },
        { code: 'NumpadMultiply', legend: '*' },
        { code: 'NumpadSubtract', legend: '-' },
      ],
      [
        { code: 'Numpad7', legend: '7' },
        { code: 'Numpad8', legend: '8' },
        { code: 'Numpad9', legend: '9' },
        { code: 'NumpadAdd', legend: '+', h: 2 },
      ],
      [
        { code: 'Numpad4', legend: '4' },
        { code: 'Numpad5', legend: '5' },
        { code: 'Numpad6', legend: '6' },
      ],
      [
        { code: 'Numpad1', legend: '1' },
        { code: 'Numpad2', legend: '2' },
        { code: 'Numpad3', legend: '3' },
        { code: 'NumpadEnter', legend: 'Enter', h: 2 },
      ],
      [
        { code: 'Numpad0', legend: '0', w: 2 },
        { code: 'NumpadDecimal', legend: '.' },
      ],
    ],
  },
  {
    id: 'mouse',
    units: 1,
    rows: [[gap(1)], [{ code: 'Mouse3' }], [{ code: 'Mouse4' }], [{ code: 'Mouse5' }]],
  },
];

/** A binding riding on a key, in any layer. */
export interface KeyboardKeyBinding {
  actionId: string;
  combo: string;
  name: string;
  category: string;
}

export interface KeyboardKeyView {
  code: string;
  legend: string;
  w: number;
  h: number;
  spacer: boolean;
  /** The binding shown on the cap: the first one in the selected layer. */
  layerBinding: KeyboardKeyBinding | null;
  /** Every binding on this physical key, all layers, layer-then-action order. */
  bindings: KeyboardKeyBinding[];
  /** True when a binding exists in a layer other than the selected one. */
  otherLayers: boolean;
}

export interface KeyboardBlockView {
  id: KeyboardBlockId;
  units: number;
  rows: KeyboardKeyView[][];
}

export interface KeyboardMapDeps {
  /** Short keycap label for a bare code (keyLabel from src/game/keybinds). */
  legend: (code: string) => string;
  name: (actionId: string) => string;
  category: (actionId: string) => string;
}

/** Split a combo into its modifier head ("Shift+", "" for none) and bare code. */
export function splitCombo(combo: string): { head: string; code: string } {
  const at = combo.lastIndexOf('+');
  // A trailing '+' is not a code separator (no code is empty), so only an
  // interior '+' splits; "Shift+Digit1" -> head "Shift+", code "Digit1".
  if (at <= 0 || at === combo.length - 1) return { head: '', code: combo };
  return { head: combo.slice(0, at + 1), code: combo.slice(at + 1) };
}

/** Category name -> the painter's class suffix ("Action Bar" -> "action-bar"). */
export function categoryClass(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Index every binding by its bare code, in registry order. */
function bindingsByCode(
  snapshot: Record<string, (string | null)[]>,
  deps: KeyboardMapDeps,
): Map<string, KeyboardKeyBinding[]> {
  const out = new Map<string, KeyboardKeyBinding[]>();
  for (const [actionId, combos] of Object.entries(snapshot)) {
    for (const combo of combos) {
      if (typeof combo !== 'string' || combo.length === 0) continue;
      const { code } = splitCombo(combo);
      const list = out.get(code) ?? [];
      list.push({ actionId, combo, name: deps.name(actionId), category: deps.category(actionId) });
      out.set(code, list);
    }
  }
  return out;
}

/** Annotate the layout with the snapshot's bindings for `layer`. */
export function buildKeyboardMap(
  snapshot: Record<string, (string | null)[]>,
  layer: KeyboardLayer,
  deps: KeyboardMapDeps,
): KeyboardBlockView[] {
  const byCode = bindingsByCode(snapshot, deps);
  return KEYBOARD_LAYOUT.map((block) => ({
    id: block.id,
    units: block.units,
    rows: block.rows.map((row) =>
      row.map((spec): KeyboardKeyView => {
        const all = spec.spacer ? [] : (byCode.get(spec.code) ?? []);
        // Selected layer first so the cap and the detail line agree on order.
        const inLayer = all.filter((b) => splitCombo(b.combo).head === layer);
        const elsewhere = all.filter((b) => splitCombo(b.combo).head !== layer);
        return {
          code: spec.code,
          legend: spec.spacer ? '' : (spec.legend ?? deps.legend(spec.code)),
          w: spec.w ?? 1,
          h: spec.h ?? 1,
          spacer: spec.spacer === true,
          layerBinding: inLayer[0] ?? null,
          bindings: [...inLayer, ...elsewhere],
          otherLayers: elsewhere.length > 0,
        };
      }),
    ),
  }));
}

/** Every bindable code the layout can show (no spacers). */
export function keyboardLayoutCodes(): string[] {
  const codes: string[] = [];
  for (const block of KEYBOARD_LAYOUT)
    for (const row of block.rows) for (const k of row) if (!k.spacer) codes.push(k.code);
  return codes;
}
