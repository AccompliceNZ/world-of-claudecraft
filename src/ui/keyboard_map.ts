// The Key Bindings panel's keyboard overview painter: a live keyboard drawn
// from the player's current bindings, every key in use coloured by its
// action's category and captioned with the action, a modifier-layer switch
// (none / Shift / Ctrl / Alt), a category legend, and a detail line that spells
// out everything bound to the hovered or focused key. The keys are buttons:
// clicking a bound key arms the shared key capture for that action (press the
// new key; a key another action holds asks first, exactly like the panel's
// rows) with Unbind / Cancel beside the status, and clicking an empty key opens
// an action picker that binds the action to that key in the current layer.
// The same painter fills the pop-out window (keyboard_map_window.ts). The
// geometry and per-key annotation come from the pure keyboard_map_core.ts;
// this module owns only the DOM. Registered in tests/architecture.test.ts
// UI_DOM_MODULES.

import { audio } from '../game/audio';
import { type Keybinds, keyLabel } from '../game/keybinds';
import { t } from './i18n';
import {
  buildKeyboardMap,
  categoryClass,
  KEYBOARD_LAYERS,
  type KeyboardKeyBinding,
  type KeyboardKeyView,
  type KeyboardLayer,
  splitCombo,
} from './keyboard_map_core';

export interface KeyboardMapPaintDeps {
  /** The bindings to show (the live Keybinds snapshot, already filtered of
   *  any action the panel itself hides). */
  bindings: () => Record<string, (string | null)[]>;
  actionName: (actionId: string) => string;
  actionCategory: (actionId: string) => string;
  /** Ordered category names with their localized labels, for the legend. */
  categories: () => { id: string; label: string }[];
  /** The modifier layer to show first, and where a switch is remembered. */
  layer: KeyboardLayer;
  onLayerChange: (layer: KeyboardLayer) => void;
  /** Rebinding through the keys; omitted for a read-only board. */
  rebind?: KeyboardMapRebindDeps;
  /** Shown as a Pop Out button in the header when given. */
  onPopOut?: () => void;
}

export interface KeyboardMapRebindDeps {
  keybinds: () => Keybinds;
  /** OptionsHooks.captureKey: arm a one-shot key capture, or null to clear it. */
  captureKey: (cb: ((code: string | null) => void) | null) => void;
  /** The HUD's shared are-you-sure dialog (the panel rows' conflict prompt). */
  confirmDialog: (
    title: string,
    body: string,
    okText: string,
    cancelText: string,
    onOk: () => void,
  ) => void;
  /** After any bind / unbind: refresh keycaps and any other open view.
   *  `status` is the localized outcome line, for a view that rebuilds this
   *  board and wants to keep showing it. */
  onChanged: (status: string) => void;
  /** The actions an empty key may be given, in menu order. */
  assignable: () => { id: string; label: string }[];
  /** The shared gold dropdown (OptionsWindowDeps.buildDropdown). */
  buildDropdown: (
    options: { value: string; label: string }[],
    current: string,
    onChange?: (value: string) => void,
    placeholder?: string,
    a11y?: { ariaLabel?: string; labelledBy?: string },
  ) => HTMLElement;
}

export interface KeyboardMapHandle {
  el: HTMLElement;
  /** Redraw the board from the live bindings (after an outside rebind). */
  repaint: () => void;
}

/** Quarter-unit grid columns per key unit (keys are 1, 1.25, 1.5 ... wide). */
const COLS_PER_UNIT = 4;

/** Paint the overview into `root` (appended) and return its handle. */
export function paintKeyboardMap(root: HTMLElement, deps: KeyboardMapPaintDeps): KeyboardMapHandle {
  const wrap = document.createElement('section');
  wrap.className = 'kbm';
  wrap.setAttribute('aria-label', t('hudChrome.keyboardMap.title'));

  const head = document.createElement('div');
  head.className = 'kbm-head';
  const title = document.createElement('div');
  title.className = 'kbm-title';
  title.textContent = t('hudChrome.keyboardMap.title');
  const controls = document.createElement('div');
  controls.className = 'kbm-controls';
  const layers = document.createElement('div');
  layers.className = 'kbm-layers';
  layers.setAttribute('role', 'group');
  layers.setAttribute('aria-label', t('hudChrome.keyboardMap.layerGroup'));
  controls.appendChild(layers);
  if (deps.onPopOut) {
    const onPopOut = deps.onPopOut;
    const pop = document.createElement('button');
    pop.type = 'button';
    pop.className = 'btn kbm-popout';
    pop.textContent = t('hudChrome.keyboardMap.popOut');
    pop.addEventListener('click', () => {
      audio.click();
      onPopOut();
    });
    controls.appendChild(pop);
  }
  head.append(title, controls);

  const board = document.createElement('div');
  board.className = 'kbm-board';
  const detail = document.createElement('div');
  detail.className = 'kbm-detail';
  detail.setAttribute('role', 'status');
  // The action row under the detail line: Unbind / Cancel while a capture is
  // armed, or the assign picker for an empty key.
  const actions = document.createElement('div');
  actions.className = 'kbm-actions';
  actions.hidden = true;

  let layer: KeyboardLayer = deps.layer;
  // The capture armed from a key click, so a second click or a repaint can
  // clear it instead of leaving a stale one-shot callback behind.
  let armed: { binding: KeyboardKeyBinding } | null = null;
  const rebind = deps.rebind;

  const hint = (): string =>
    t(rebind ? 'hudChrome.keyboardMap.hintInteractive' : 'hudChrome.keyboardMap.hint');
  detail.textContent = hint();

  const layerButtons = new Map<KeyboardLayer, HTMLButtonElement>();
  for (const entry of KEYBOARD_LAYERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn kbm-layer';
    b.textContent = t(entry.labelKey);
    b.setAttribute('aria-pressed', String(entry.id === layer));
    b.addEventListener('click', () => {
      if (layer === entry.id) return;
      audio.click();
      layer = entry.id;
      for (const [id, btn] of layerButtons) btn.setAttribute('aria-pressed', String(id === layer));
      deps.onLayerChange(layer);
      resetInteraction();
      paintBoard();
    });
    layerButtons.set(entry.id, b);
    layers.appendChild(b);
  }

  const describe = (key: KeyboardKeyView): string => {
    if (key.bindings.length === 0)
      return t('hudChrome.keyboardMap.keyDetail', {
        key: key.legend,
        bindings: t('hudChrome.keyboardMap.unbound'),
      });
    // A bare binding is already named by the {key} prefix; only a modifier
    // combo needs its own label ("3: Iron Bellow, Ctrl+3: Pet: Taunt").
    const parts = key.bindings.map((b) =>
      splitCombo(b.combo).head === '' ? b.name : `${keyLabel(b.combo)}: ${b.name}`,
    );
    return t('hudChrome.keyboardMap.keyDetail', {
      key: key.legend,
      bindings: parts.join(t('hudChrome.keyboardMap.separator')),
    });
  };

  /** Drop any armed capture and the action row; the detail goes back to the hint. */
  const resetInteraction = (): void => {
    if (armed) rebind?.captureKey(null);
    armed = null;
    actions.hidden = true;
    actions.replaceChildren();
    detail.textContent = hint();
  };

  const actionButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = label;
    b.addEventListener('click', () => {
      audio.click();
      onClick();
    });
    return b;
  };

  /** Commit a bind, asking first when `combo` is held by another action. */
  const bindWithConfirm = (
    io: KeyboardMapRebindDeps,
    actionId: string,
    index: number,
    combo: string,
    done: () => string,
  ): void => {
    const commit = () => {
      io.keybinds().bind(actionId, index, combo);
      const status = done();
      finish(status);
      io.onChanged(status);
    };
    const conflict = io.keybinds().findBindConflict(actionId, index, combo);
    if (!conflict) {
      commit();
      return;
    }
    io.confirmDialog(
      t('hudChrome.actionBar.conflictTitle'),
      t('hudChrome.actionBar.conflictBody', {
        key: keyLabel(conflict.code),
        other: deps.actionName(conflict.id),
        action: deps.actionName(actionId),
      }),
      t('hudChrome.actionBar.conflictAccept'),
      t('hudChrome.actionBar.cancel'),
      commit,
    );
  };

  /** A bound key was clicked: capture a new key for that binding. */
  const startRebind = (io: KeyboardMapRebindDeps, binding: KeyboardKeyBinding): void => {
    resetInteraction();
    armed = { binding };
    detail.textContent = t('hudChrome.keyboardMap.pressKey', { action: binding.name });
    for (const cell of board.querySelectorAll<HTMLElement>('.kbm-key.capturing'))
      cell.classList.remove('capturing');
    board
      .querySelector(`[data-code="${splitCombo(binding.combo).code}"]`)
      ?.classList.add('capturing');
    actions.replaceChildren(
      actionButton(t('hudChrome.keyboardMap.unbind'), () => {
        if (armed?.binding !== binding) return;
        io.captureKey(null);
        armed = null;
        io.keybinds().clear(binding.actionId, binding.index);
        const status = t('hudChrome.keyboardMap.unbound_', { action: binding.name });
        finish(status);
        io.onChanged(status);
      }),
      actionButton(t('hudChrome.actionBar.cancel'), () => {
        resetInteraction();
        paintBoard();
      }),
    );
    actions.hidden = false;
    io.captureKey((code) => {
      // A stale capture: a later click re-armed for another binding, or the
      // board was reset. Drop it.
      if (armed?.binding !== binding) return;
      armed = null;
      if (code === null) {
        finish(t('hud.options.keybindCancelled'));
        return;
      }
      bindWithConfirm(io, binding.actionId, binding.index, code, () =>
        t('hudChrome.keyboardMap.boundTo', {
          action: binding.name,
          key: keyLabel(io.keybinds().codeAt(binding.actionId, binding.index)),
        }),
      );
    });
  };

  /** An empty key was clicked: pick an action to put on it in this layer. */
  const startAssign = (io: KeyboardMapRebindDeps, key: KeyboardKeyView): void => {
    resetInteraction();
    const combo = `${layer}${key.code}`;
    const comboLabel = keyLabel(combo);
    detail.textContent = t('hudChrome.keyboardMap.assignHint', { key: comboLabel });
    const picker = io.buildDropdown(
      io.assignable().map((a) => ({ value: a.id, label: a.label })),
      '',
      (actionId) => {
        const kb = io.keybinds();
        // The primary slot when free, else the alternate (replacing it when
        // both are taken): the primary is the one the panel rows show first.
        const index = kb.codeAt(actionId, 0) === null ? 0 : 1;
        bindWithConfirm(io, actionId, index, combo, () =>
          t('hudChrome.keyboardMap.boundTo', {
            action: deps.actionName(actionId),
            key: comboLabel,
          }),
        );
      },
      t('hudChrome.keyboardMap.assignPlaceholder', { key: comboLabel }),
      { ariaLabel: t('hudChrome.keyboardMap.assignPlaceholder', { key: comboLabel }) },
    );
    actions.replaceChildren(
      picker,
      actionButton(t('hudChrome.actionBar.cancel'), () => {
        resetInteraction();
        paintBoard();
      }),
    );
    actions.hidden = false;
  };

  /** End an interaction with a status line and a fresh board. */
  const finish = (status: string): void => {
    armed = null;
    actions.hidden = true;
    actions.replaceChildren();
    paintBoard();
    detail.textContent = status;
  };

  const paintBoard = (): void => {
    board.replaceChildren();
    for (const block of buildKeyboardMap(deps.bindings(), layer, {
      legend: (code) => keyLabel(code),
      name: deps.actionName,
      category: deps.actionCategory,
    })) {
      const el = document.createElement('div');
      el.className = `kbm-block kbm-block-${block.id}`;
      el.style.setProperty('--kbm-cols', String(block.units * COLS_PER_UNIT));
      for (const row of block.rows) {
        for (const key of row) {
          if (key.spacer) {
            const cell = document.createElement('div');
            cell.className = 'kbm-key kbm-spacer';
            cell.style.setProperty('--kbm-w', String(key.w * COLS_PER_UNIT));
            cell.style.setProperty('--kbm-h', String(key.h));
            cell.setAttribute('aria-hidden', 'true');
            el.appendChild(cell);
            continue;
          }
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.dataset.code = key.code;
          cell.style.setProperty('--kbm-w', String(key.w * COLS_PER_UNIT));
          cell.style.setProperty('--kbm-h', String(key.h));
          const bound = key.layerBinding;
          cell.className = `kbm-key${bound ? ` in-use kbm-cat-${categoryClass(bound.category)}` : ''}`;
          const legend = document.createElement('span');
          legend.className = 'kbm-legend';
          legend.textContent = key.legend;
          cell.appendChild(legend);
          if (bound) {
            const action = document.createElement('span');
            action.className = 'kbm-action';
            action.textContent = bound.name;
            cell.appendChild(action);
          }
          if (key.otherLayers) {
            const dot = document.createElement('span');
            dot.className = 'kbm-dot';
            cell.appendChild(dot);
          }
          const text = describe(key);
          cell.setAttribute('aria-label', text);
          cell.title = text;
          const show = () => {
            if (!armed && actions.hidden) detail.textContent = text;
          };
          cell.addEventListener('mouseenter', show);
          cell.addEventListener('focus', show);
          if (rebind) {
            cell.addEventListener('click', () => {
              audio.click();
              if (bound) startRebind(rebind, bound);
              else startAssign(rebind, key);
            });
          }
          el.appendChild(cell);
        }
      }
      board.appendChild(el);
    }
  };
  paintBoard();

  const legend = document.createElement('div');
  legend.className = 'kbm-legend-row';
  for (const cat of deps.categories()) {
    const item = document.createElement('span');
    item.className = 'kbm-legend-item';
    const swatch = document.createElement('span');
    swatch.className = `kbm-swatch kbm-cat-${categoryClass(cat.id)}`;
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, document.createTextNode(cat.label));
    legend.appendChild(item);
  }
  const dotItem = document.createElement('span');
  dotItem.className = 'kbm-legend-item';
  const dotSwatch = document.createElement('span');
  dotSwatch.className = 'kbm-swatch kbm-swatch-dot';
  dotSwatch.setAttribute('aria-hidden', 'true');
  dotItem.append(dotSwatch, document.createTextNode(t('hudChrome.keyboardMap.otherLayers')));
  legend.appendChild(dotItem);

  wrap.append(head, board, legend, detail, actions);
  root.appendChild(wrap);
  return {
    el: wrap,
    repaint: () => {
      // A repaint from outside during an interaction drops it (the bindings it
      // was about moved); a quiet one keeps the status line the last action set.
      if (armed || !actions.hidden) resetInteraction();
      paintBoard();
    },
  };
}
