// The native-dropdown repaint hold: "may a background rebuild replace this
// window's subtree right now, or could a native <select> dropdown be open?"
//
// A rebuild replaces a focused <select> and a replaced select's open dropdown
// closes out from under the pointer (the reported Exchange Browse-filter
// bug). Native selects expose no open state, so this watches the delegated
// interactions instead. Focus ALONE is too wide a proxy: a select keeps
// focus after a pick or a dismissal, and holding on focus froze the
// Exchange's countdowns for as long as the player sat reading after touching
// a filter. The rules, and why each side is safe:
//
//  - pointerdown or mousedown ON a select ARMS (the press that opens the
//    dropdown); either anywhere else DISARMS (a press that reached the page
//    means no dropdown swallowed it). Both, because a touch delivers the
//    pointer event directly and the compatibility mousedown after a tap is
//    the mobile browser's to send or skip; on a mouse the pair agrees.
//  - keydown ON a select arms only for the keys that can open a dropdown
//    (Space, Enter, the Arrow pair); any other key disarms. A platform whose
//    arrows step the value on a closed select fires change right after,
//    which disarms again; while a native dropdown is open the browser
//    delivers no page keydowns at all.
//  - change DISARMS (a pick closes the dropdown), which is what lets
//    repaints resume the moment a filter is chosen even though the picked
//    select keeps focus.
//  - focusout from a select DISARMS.
//  - wheel anywhere in the root DISARMS: an open native popup takes the wheel
//    itself or is rolled up by the page scroll, so a wheel that reached the
//    page means no popup is capturing input, and the reader scrolling the
//    list is exactly who a frozen countdown would punish.
//
// The residual: a dropdown dismissed WITHOUT a pick (an outside click or
// Escape swallowed by the native popup, or re-picking the current value,
// which fires no change) leaves the watch armed while the select keeps focus
// until the next press, key, or wheel the page sees. It is bounded either
// way: holdRepaints() additionally requires the focused control inside the
// root to BE a select (through focusedWithin, the sanctioned active-element
// read), so a stray armed state can never outlive the select's focus. The
// consumer's sell-picker guard documents the same bounding doctrine for its
// own flag.
//
// Attaches its own delegated listeners at construction, BEFORE the consumer
// wires its handlers, so a change disarms while the select is still attached
// (the consumer's change handler rebuilds the subtree, and an observe running
// after that rebuild would see a detached target and skip the disarm).
//
// Owns browser state by design (live listeners, instanceof narrowing):
// registered in UI_DOM_MODULES (tests/architecture.test.ts), the
// focus_restore.ts pattern. Its paired test drives it over a real happy-dom
// root; the consumer behavior lives in tests/woc_market_window_rig.test.ts.

import { focusedWithin } from './focus_restore';

export interface NativeSelectHold {
  /** True while a background rebuild must wait: a native select inside the
   *  root holds focus AND the last interaction could have opened its
   *  dropdown. User-initiated repaints never consult this. */
  holdRepaints(): boolean;
}

const OPEN_KEYS = new Set([' ', 'Enter', 'ArrowDown', 'ArrowUp']);

export function createNativeSelectHold(root: HTMLElement): NativeSelectHold {
  let armed = false;
  const onSelect = (e: Event): boolean =>
    e.target instanceof HTMLSelectElement && root.contains(e.target);
  for (const press of ['pointerdown', 'mousedown'] as const) {
    root.addEventListener(press, (e) => {
      armed = onSelect(e);
    });
  }
  root.addEventListener('keydown', (e) => {
    if (onSelect(e)) armed = OPEN_KEYS.has(e.key);
  });
  root.addEventListener('change', (e) => {
    if (onSelect(e)) armed = false;
  });
  root.addEventListener('focusout', (e) => {
    if (onSelect(e)) armed = false;
  });
  // Passive: it only observes, and a blocking wheel listener stalls the scroll.
  root.addEventListener(
    'wheel',
    () => {
      armed = false;
    },
    { passive: true },
  );
  return {
    holdRepaints(): boolean {
      return armed && focusedWithin(root) instanceof HTMLSelectElement;
    },
  };
}
