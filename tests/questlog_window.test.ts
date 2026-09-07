// @vitest-environment happy-dom

// WCAG-chrome + no-magic and interaction coverage for the quest-log window DOM painter.
//
// Happy DOM exercises the shipped interactions here; the pure decisions it renders are
// covered by tests/questlog_view.test.ts.
// This guard pins the a11y-bearing markup (dialog role + labelledby, real close +
// quest-row buttons with aria-pressed, focus-return) and the no-magic-values contract
// (no literal colors in TS; reward quality is carried by the shared quality class).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUESTS } from '../src/sim/data';
import { QuestLogWindow } from '../src/ui/hud/quest/questlog_window';

const src = readFileSync(join(__dirname, '../src/ui/hud/quest/questlog_window.ts'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function stubDeps<T extends object>(overrides: Partial<NoInfer<T>>): T {
  const noop = () => undefined;
  return new Proxy(overrides as Record<string, unknown>, {
    get(target, prop: string) {
      return prop in target ? target[prop] : noop;
    },
  }) as T;
}

function renderQuestFixture(): {
  root: HTMLElement;
  win: QuestLogWindow;
  questIds: [string, string];
  mapOpen: ReturnType<typeof vi.fn>;
  insertQuestChatLink: ReturnType<typeof vi.fn>;
  confirmDialog: ReturnType<typeof vi.fn>;
  abandonQuest: ReturnType<typeof vi.fn>;
} {
  const found = Object.values(QUESTS)
    .filter((quest) => quest.objectives.length > 0)
    .slice(0, 2);
  if (found.length !== 2) throw new Error('fixture needs two quests with objectives');
  const [questA, questB] = found;
  const root = document.createElement('div');
  root.id = 'quest-log-window';
  root.style.display = 'none';
  document.body.appendChild(root);
  const mapLauncher = document.createElement('button');
  mapLauncher.id = 'mm-map';
  const mapOpen = vi.fn();
  mapLauncher.addEventListener('click', mapOpen);
  document.body.appendChild(mapLauncher);
  const progressA = {
    questId: questA.id,
    counts: questA.objectives.map((objective) => objective.count / 2),
    state: 'active',
  };
  const progressB = {
    questId: questB.id,
    counts: questB.objectives.map(() => 0),
    state: 'active',
  };
  const questLog = new Map([
    [questA.id, progressA],
    [questB.id, progressB],
  ]);
  const insertQuestChatLink = vi.fn();
  const confirmDialog = vi.fn();
  const abandonQuest = vi.fn((questId: string) => questLog.delete(questId));
  const win = new QuestLogWindow(
    stubDeps({
      root: () => root,
      world: () =>
        ({
          cfg: { playerClass: 'warrior' },
          player: { name: 'Aurelia' },
          questLog,
          questsDone: new Set<string>(),
          abandonQuest,
        }) as never,
      captureFocus: () => null,
      moneyHtml: () => '',
      itemIcon: () => '',
      itemTooltip: () => '',
      attachTooltip: vi.fn(),
      focusFirstInteractive: vi.fn(),
      insertQuestChatLink,
      confirmDialog,
    }),
  );
  win.toggle();
  return {
    root,
    win,
    questIds: [questA.id, questB.id],
    mapOpen,
    insertQuestChatLink,
    confirmDialog,
    abandonQuest,
  };
}

describe('questlog_window: WCAG chrome (dialog + rows + focus-return)', () => {
  it('drives the panel from the pure view core', () => {
    expect(code).toContain('buildQuestLogView(');
  });

  it('renders the dialog role + labelledby for the window', () => {
    // The dialog identity is set via the shared markDialogRoot helper (role=dialog +
    // aria-labelledby + aria-modal + tabindex); the helper's own writes are unit-tested in
    // dialog_root.test.ts.
    expect(code).toContain("markDialogRoot(el, { labelledBy: 'quest-log-title' })");
    expect(code).toContain('id="quest-log-title"');
  });

  it('gives the close control a real button with an aria-label', () => {
    // W7 keeps the established close hook while adopting the shared window primitive.
    expect(code).toContain('class="x-btn ui-x-btn" data-close aria-label=');
    expect(code).toContain("t('questUi.log.close')");
  });

  it('renders quest rows as real buttons with aria-pressed selection state', () => {
    expect(code).toMatch(/button\.className = [`']ql-item/);
    expect(code).toContain("button.setAttribute('aria-pressed'");
  });

  it('keeps the abandon flow behind a confirm dialog', () => {
    expect(code).toContain("t('questUi.log.abandon')");
    expect(code).toContain('this.deps.confirmDialog(');
    expect(code).toContain('this.deps.world().abandonQuest(questId)');
  });

  it('returns focus to the first interactive element + the opener on close', () => {
    expect(code).toContain('this.deps.focusFirstInteractive(el)');
    expect(code).toContain('this.deps.restoreFocus(target)');
  });
});

describe('questlog_window: no magic values (DOM painter)', () => {
  it('carries no literal hex or rgb color in TS (the reward fallback is a token)', () => {
    const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const rgb = code.match(/\brgba?\s*\(/g) ?? [];
    expect(hex, `hex colors: ${hex.join(', ')}`).toEqual([]);
    expect(rgb, `rgb colors: ${rgb.join(', ')}`).toEqual([]);
  });

  // Pin moved: the bare .q-* family is a socket RIM (border plus glow), so the
  // class alone left the reward NAME uncolored and haloed. The color now comes
  // from the shared itemNameColor (a token or the QUALITY_COLOR map, never a
  // literal minted here), and the class stays for the rim and for this pin.
  it('colors the reward name through the shared itemNameColor, keeping the quality class', () => {
    expect(code).toContain('q-$' + "{item.quality ?? 'common'}");
    expect(code).toContain('style="color:$' + '{itemNameColor(item)}');
  });

  it('carries no literal em dash in source', () => {
    expect(src.includes('—'), 'em dash found').toBe(false);
  });
});

describe('questlog_window: W7 grouped-list interactions', () => {
  it('collapses a zone group, preserves focus, and paints objective progress', () => {
    const { root } = renderQuestFixture();
    const toggle = root.querySelector<HTMLButtonElement>(
      '.ql-group:not(.is-dimmed) [data-quest-group]',
    );
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('.ql-item')).toHaveLength(2);
    const groupRows = toggle?.parentElement?.querySelectorAll('.ql-item').length ?? 0;
    const progress = [...root.querySelectorAll<HTMLElement>('.qd-progress .ui-bar-fill')];
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.map((fill) => fill.style.width)).toEqual(progress.map(() => '50%'));
    toggle?.focus();
    toggle?.click();
    const rebuilt = root.querySelector<HTMLButtonElement>(
      '.ql-group:not(.is-dimmed) [data-quest-group]',
    );
    expect(rebuilt?.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelectorAll('.ql-item')).toHaveLength(2 - groupRows);
    expect(document.activeElement).toBe(rebuilt);
  });

  it('renders the completed tally as a count line, never as a toggle onto nothing', () => {
    const { root } = renderQuestFixture();
    const completed = root.querySelector<HTMLElement>('.ql-group.is-dimmed');
    expect(completed, 'the completed group renders beside the active zone groups').not.toBeNull();
    // No button, no aria-expanded, no chevron: the log lists only ACTIVE
    // quests, so there is nothing behind the tally to disclose.
    expect(completed?.querySelector('button')).toBeNull();
    expect(completed?.querySelector('[data-quest-group]')).toBeNull();
    expect(completed?.querySelector('[aria-expanded]')).toBeNull();
    expect(completed?.querySelector('.ql-group-chevron')).toBeNull();
    // The count itself still reads.
    expect(completed?.querySelector('.ql-group-count')?.textContent).toBe('0');
  });

  it('routes Show on Map through the shipped minimap launcher', () => {
    const { root, mapOpen } = renderQuestFixture();
    root.querySelector<HTMLButtonElement>('.ql-detail-actions .ui-btn:not(.ui-btn--red)')?.click();
    expect(mapOpen).toHaveBeenCalledOnce();
  });

  it('selects grouped rows, shift-links without selecting, and confirms abandon', () => {
    const { root, win, questIds, insertQuestChatLink, confirmDialog, abandonQuest } =
      renderQuestFixture();
    const [questA, questB] = questIds;
    root.querySelector<HTMLButtonElement>(`[data-quest="${questB}"]`)?.click();
    expect(win.selectedQuestId).toBe(questB);

    root
      .querySelector<HTMLButtonElement>(`[data-quest="${questA}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(insertQuestChatLink).toHaveBeenCalledWith(questA);
    expect(win.selectedQuestId).toBe(questB);

    root.querySelector<HTMLButtonElement>('.ql-detail-actions .ui-btn--red')?.click();
    expect(confirmDialog).toHaveBeenCalledOnce();
    const onConfirm = confirmDialog.mock.calls[0][4] as () => void;
    onConfirm();
    expect(abandonQuest).toHaveBeenCalledWith(questB);
  });
});
