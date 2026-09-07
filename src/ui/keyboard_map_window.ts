// The keyboard overview's pop-out: the same live keyboard the Key Bindings panel
// shows (keyboard_map.ts), in its own movable `.window.panel` so it can stay up
// while the player plays or rebinds. Fully interactive (click a key to rebind
// or assign, exactly as in the panel). Built in code and appended to #ui the
// first time it opens; the HUD's window management (titlebar drag, stacking,
// the shared resize grip, Esc / closeAll) picks it up through the `.window.panel`
// class, and Hud.closeManagedWindow routes its id through
// OptionsWindow.closeKeyboardWindow (the CODE_BUILT row in
// tests/managed_window_close_registry.test.ts). No trap, no timer: every open
// repaints from the live bindings.
// Desktop only: the panel offers the Pop Out button only off touch. Registered
// in tests/architecture.test.ts UI_DOM_MODULES.

import { markDialogRoot } from './dialog_root';
import { esc } from './esc';
import { t } from './i18n';
import {
  type KeyboardMapHandle,
  type KeyboardMapPaintDeps,
  paintKeyboardMap,
} from './keyboard_map';
import { svgIcon } from './ui_icons';

const TITLE_ID = 'keyboard-map-title';

export class KeyboardMapWindow {
  private rootEl: HTMLElement | null = null;
  private map: KeyboardMapHandle | null = null;

  /** `deps` is read at every open so the board always reflects the live
   *  bindings and the panel's current modifier layer. */
  constructor(private readonly deps: () => KeyboardMapPaintDeps) {}

  get isOpen(): boolean {
    return this.rootEl?.style.display === 'block';
  }

  open(): void {
    const root = this.root();
    this.paint(root);
    root.style.display = 'block';
    root.focus();
  }

  close(): void {
    if (!this.rootEl) return;
    this.rootEl.style.display = 'none';
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Redraw from the live bindings (a rebind made elsewhere while open). */
  repaint(): void {
    if (this.isOpen) this.map?.repaint();
  }

  private root(): HTMLElement {
    if (this.rootEl) return this.rootEl;
    const root = document.createElement('section');
    root.id = 'keyboard-map-window';
    root.className = 'window panel keyboard-map-window';
    root.style.display = 'none';
    markDialogRoot(root, { labelledBy: TITLE_ID });
    document.getElementById('ui')?.appendChild(root);
    this.rootEl = root;
    return root;
  }

  private paint(root: HTMLElement): void {
    root.innerHTML = `<div class="panel-title"><span id="${TITLE_ID}">${esc(t('hudChrome.keyboardMap.title'))}</span><button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.mounts.close'))}">${svgIcon('close')}</button></div>`;
    root.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    const body = document.createElement('div');
    body.className = 'keyboard-map-body';
    root.appendChild(body);
    this.map = paintKeyboardMap(body, this.deps());
  }
}
