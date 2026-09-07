// The persisted keyboard size the Key Bindings panel's keyboard overview draws
// (full size, tenkeyless, 75%, 60%). A tiny DOM-free, deterministic state helper
// (the guild_hide_offline.ts shape): the localStorage key plus load/save, driven
// over an injected Storage in Node tests. Registered in
// tests/architecture.test.ts UI_PURE_CORES; the key rides the full settings
// export (settings_transfer_core.ts FULL_KEYS).
//
// A browser cannot tell what physical keyboard is plugged in (key events carry
// only codes), so the player picks the form factor once and the overview hides
// the blocks that board does not have.

import type { KeyboardFormFactor } from './keyboard_map_core';
import { KEYBOARD_FORM_FACTORS } from './keyboard_map_core';
import { safeLocalStorage } from './safe_local_storage';

export const KEYBOARD_LAYOUT_STORE_KEY = 'woc_keyboard_layout';
const DEFAULT_FORM_FACTOR: KeyboardFormFactor = 'full';

/** Read the persisted form factor; full size when unset, unknown, or unreadable. */
export function loadKeyboardFormFactor(
  storage: Pick<Storage, 'getItem'> | null = safeLocalStorage(),
): KeyboardFormFactor {
  if (!storage) return DEFAULT_FORM_FACTOR;
  try {
    const raw = storage.getItem(KEYBOARD_LAYOUT_STORE_KEY);
    return KEYBOARD_FORM_FACTORS.some((f) => f.id === raw)
      ? (raw as KeyboardFormFactor)
      : DEFAULT_FORM_FACTOR;
  } catch {
    return DEFAULT_FORM_FACTOR;
  }
}

/** Persist the form factor; silently no-ops when storage is unavailable. */
export function saveKeyboardFormFactor(
  formFactor: KeyboardFormFactor,
  storage: Pick<Storage, 'setItem'> | null = safeLocalStorage(),
): void {
  try {
    storage?.setItem(KEYBOARD_LAYOUT_STORE_KEY, formFactor);
  } catch {
    /* storage unavailable */
  }
}
