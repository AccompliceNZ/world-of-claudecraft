// The pure model behind the Key Bindings panel's keyboard overview
// (src/ui/keyboard_map_core.ts): the layout covers every code the registry
// binds by default, has no duplicate caps, keeps row geometry, and the
// annotation puts each binding on the right key in the right layer.
import { describe, expect, it } from 'vitest';
import { BIND_ACTIONS } from '../src/game/keybinds';
import {
  buildKeyboardMap,
  categoryClass,
  KEYBOARD_LAYERS,
  KEYBOARD_LAYOUT,
  keyboardLayoutCodes,
  splitCombo,
} from '../src/ui/keyboard_map_core';

const deps = {
  legend: (code: string) => code,
  name: (id: string) => `name:${id}`,
  category: (id: string) => (id.startsWith('slot') ? 'Action Bar' : 'Movement'),
};

describe('KEYBOARD_LAYOUT', () => {
  it('has a cap for every code the registry binds by default, mouse buttons included', () => {
    const codes = new Set(keyboardLayoutCodes());
    for (const a of BIND_ACTIONS) {
      for (const combo of a.defaults) {
        const { code } = splitCombo(combo);
        expect(codes.has(code), `${a.id}: ${combo}`).toBe(true);
      }
    }
    for (const mouse of ['Mouse3', 'Mouse4', 'Mouse5']) expect(codes.has(mouse)).toBe(true);
  });

  it('never draws the same physical key twice', () => {
    const codes = keyboardLayoutCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps every row of a block exactly the block width, so the grid never wraps', () => {
    for (const block of KEYBOARD_LAYOUT) {
      // A key spanning two rows (numpad + and Enter) takes its column in the
      // NEXT row too, so that row is one unit short by design.
      let carried = 0;
      for (const row of block.rows) {
        const width = row.reduce((sum, k) => sum + (k.w ?? 1), 0) + carried;
        expect(width, `${block.id}: ${row.map((k) => k.code || '_').join(' ')}`).toBe(block.units);
        carried = row.reduce((sum, k) => sum + ((k.h ?? 1) > 1 ? (k.w ?? 1) : 0), 0);
      }
    }
  });

  it('offers the bare layer first, then Shift, Ctrl and Alt', () => {
    expect(KEYBOARD_LAYERS.map((l) => l.id)).toEqual(['', 'Shift+', 'Ctrl+', 'Alt+']);
  });
});

describe('splitCombo / categoryClass', () => {
  it('splits a modifier head from the bare code and leaves a bare code alone', () => {
    expect(splitCombo('Shift+Digit1')).toEqual({ head: 'Shift+', code: 'Digit1' });
    expect(splitCombo('Ctrl+Alt+KeyA')).toEqual({ head: 'Ctrl+Alt+', code: 'KeyA' });
    expect(splitCombo('KeyA')).toEqual({ head: '', code: 'KeyA' });
    expect(splitCombo('NumpadAdd')).toEqual({ head: '', code: 'NumpadAdd' });
  });

  it('slugs a category for the painter class', () => {
    expect(categoryClass('Action Bar')).toBe('action-bar');
    expect(categoryClass('Pet')).toBe('pet');
  });
});

describe('buildKeyboardMap', () => {
  const snapshot = {
    forward: ['KeyW', 'ArrowUp'],
    slot12: ['Shift+KeyW', null],
    petAttack: ['Ctrl+Digit1', null],
    slot0: ['Digit1', null],
    autorun: [null, null],
  };
  const find = (layer: '' | 'Shift+' | 'Ctrl+' | 'Alt+', code: string) => {
    for (const block of buildKeyboardMap(snapshot, layer, deps))
      for (const row of block.rows) for (const k of row) if (k.code === code) return k;
    throw new Error(`no key ${code}`);
  };

  it('puts a bare binding on its cap in the bare layer and marks other layers', () => {
    const w = find('', 'KeyW');
    expect(w.layerBinding).toEqual({
      actionId: 'forward',
      index: 0,
      combo: 'KeyW',
      name: 'name:forward',
      category: 'Movement',
    });
    expect(w.otherLayers).toBe(true); // Shift+W is on the bar
    // The alternate slot carries index 1, what a rebind or unbind targets.
    expect(find('', 'ArrowUp').layerBinding?.index).toBe(1);
    expect(w.bindings.map((b) => b.combo)).toEqual(['KeyW', 'Shift+KeyW']);
  });

  it('switches the cap to the selected layer and orders that layer first', () => {
    const w = find('Shift+', 'KeyW');
    expect(w.layerBinding?.actionId).toBe('slot12');
    expect(w.bindings.map((b) => b.combo)).toEqual(['Shift+KeyW', 'KeyW']);
    const one = find('Ctrl+', 'Digit1');
    expect(one.layerBinding?.actionId).toBe('petAttack');
    expect(find('', 'Digit1').layerBinding?.actionId).toBe('slot0');
    expect(find('Alt+', 'Digit1').layerBinding).toBeNull();
    expect(find('Alt+', 'Digit1').otherLayers).toBe(true);
  });

  it('leaves an unused key empty and spells spacers as blank cells', () => {
    const q = find('', 'KeyQ');
    expect(q.layerBinding).toBeNull();
    expect(q.bindings).toEqual([]);
    expect(q.otherLayers).toBe(false);
    expect(q.legend).toBe('KeyQ');
    const spacer = buildKeyboardMap(snapshot, '', deps)[0].rows[0][1];
    expect(spacer.spacer).toBe(true);
    expect(spacer.legend).toBe('');
    expect(spacer.w).toBe(1);
  });

  it('uses the layout legend override over the resolver', () => {
    expect(find('', 'ShiftLeft').legend).toBe('Shift');
    expect(find('', 'Numpad7').legend).toBe('7');
  });
});
