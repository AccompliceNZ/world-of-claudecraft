// @vitest-environment happy-dom
//
// The native-dropdown repaint hold (native_select_hold.ts): the module owns
// its delegated listeners over a real root, so every case here dispatches
// REAL bubbling events; the consumer behavior (holding the $WOC Exchange's
// background repaints, resuming on the pick) lives in
// tests/woc_market_window_rig.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { createNativeSelectHold, type NativeSelectHold } from '../src/ui/native_select_hold';

afterEach(() => {
  document.body.innerHTML = '';
});

function rig(): { hold: NativeSelectHold; sel: HTMLSelectElement; outside: HTMLButtonElement } {
  const root = document.createElement('div');
  const sel = document.createElement('select');
  const opt = document.createElement('option');
  opt.value = 'epic';
  sel.appendChild(opt);
  root.appendChild(sel);
  const outside = document.createElement('button');
  root.appendChild(outside);
  document.body.appendChild(root);
  return { hold: createNativeSelectHold(root), sel, outside };
}

describe('createNativeSelectHold', () => {
  it('holds after mousedown on a focused select, releases on mousedown elsewhere', () => {
    const { hold, sel, outside } = rig();
    expect(hold.holdRepaints()).toBe(false);
    sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    sel.focus();
    expect(hold.holdRepaints()).toBe(true);
    // A press that reached the page means no dropdown swallowed it.
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(hold.holdRepaints()).toBe(false);
  });

  it('a pick (change) releases even though the select keeps focus', () => {
    const { hold, sel } = rig();
    sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    sel.focus();
    expect(hold.holdRepaints()).toBe(true);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.activeElement).toBe(sel);
    expect(hold.holdRepaints()).toBe(false);
  });

  it('never holds without focus: armed state cannot outlive the select', () => {
    const { hold, sel } = rig();
    sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // Armed but unfocused (a dismissal path that moved focus): no hold.
    expect(hold.holdRepaints()).toBe(false);
    sel.focus();
    expect(hold.holdRepaints()).toBe(true);
    sel.blur();
    expect(hold.holdRepaints()).toBe(false);
  });

  it('arms only for the dropdown-opening keys', () => {
    const { hold, sel } = rig();
    sel.focus();
    for (const key of [' ', 'Enter', 'ArrowDown', 'ArrowUp']) {
      sel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(hold.holdRepaints(), key).toBe(true);
    }
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hold.holdRepaints()).toBe(false);
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(hold.holdRepaints()).toBe(false);
  });

  it('non-select interactions never arm it', () => {
    const { hold, sel, outside } = rig();
    outside.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    outside.dispatchEvent(new Event('change', { bubbles: true }));
    sel.focus();
    expect(hold.holdRepaints()).toBe(false);
  });
});
