// The Key Bindings panel's keyboard overview painter: a live keyboard drawn
// from the player's current bindings, every key in use coloured by its
// action's category and captioned with the action, a modifier-layer switch
// (none / Shift / Ctrl / Alt), a category legend, and a detail line that spells
// out everything bound to the hovered or focused key. The geometry and the
// per-key annotation come from the pure keyboard_map_core.ts; this module owns
// only the DOM. Registered in tests/architecture.test.ts UI_DOM_MODULES.

import { audio } from '../game/audio';
import { keyLabel } from '../game/keybinds';
import { t } from './i18n';
import {
  buildKeyboardMap,
  categoryClass,
  KEYBOARD_LAYERS,
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
}

/** Quarter-unit grid columns per key unit (keys are 1, 1.25, 1.5 ... wide). */
const COLS_PER_UNIT = 4;

/** Paint the overview into `root` (appended). Repaints the board in place when
 *  the layer switch is used; the caller repaints everything on a rebind. */
export function paintKeyboardMap(root: HTMLElement, deps: KeyboardMapPaintDeps): void {
  const wrap = document.createElement('section');
  wrap.className = 'kbm';
  wrap.setAttribute('aria-label', t('hudChrome.keyboardMap.title'));

  const head = document.createElement('div');
  head.className = 'kbm-head';
  const title = document.createElement('div');
  title.className = 'kbm-title';
  title.textContent = t('hudChrome.keyboardMap.title');
  const layers = document.createElement('div');
  layers.className = 'kbm-layers';
  layers.setAttribute('role', 'group');
  layers.setAttribute('aria-label', t('hudChrome.keyboardMap.layerGroup'));
  head.append(title, layers);

  const board = document.createElement('div');
  board.className = 'kbm-board';
  const detail = document.createElement('div');
  detail.className = 'kbm-detail';
  detail.setAttribute('role', 'status');
  detail.textContent = t('hudChrome.keyboardMap.hint');

  let layer: KeyboardLayer = '';
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
          const cell = key.spacer
            ? document.createElement('div')
            : document.createElement('button');
          cell.style.setProperty('--kbm-w', String(key.w * COLS_PER_UNIT));
          cell.style.setProperty('--kbm-h', String(key.h));
          if (key.spacer) {
            cell.className = 'kbm-key kbm-spacer';
            cell.setAttribute('aria-hidden', 'true');
            el.appendChild(cell);
            continue;
          }
          (cell as HTMLButtonElement).type = 'button';
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
            detail.textContent = text;
          };
          cell.addEventListener('mouseenter', show);
          cell.addEventListener('focus', show);
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

  wrap.append(head, board, legend, detail);
  root.appendChild(wrap);
}
