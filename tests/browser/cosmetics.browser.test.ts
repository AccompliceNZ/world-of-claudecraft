// Real painter, shipped CSS, and account fixtures for the new cosmetics dialog.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { MOUNT_SKIN_IDS } from '../../src/sim/content/mount_skins';
import { CosmeticsWindow } from '../../src/ui/hud/cosmetics/cosmetics_window';
import { axeSeriousViolations, cleanup, formatViolations, host, stubDeps } from './_harness';

afterEach(() => {
  cleanup();
  document.body.classList.remove('mobile-touch');
});
function mountWindow() {
  const root = host('cosmetics-window');
  root.style.display = '';
  const world = {
    player: {
      templateId: 'warrior',
      mainhandItemId: 'worn_sword',
      skinCatalog: 'class',
      skin: 0,
      mountSkinId: null as string | null,
    },
    ownedMounts: () => ['valorsteed'],
    accountCosmetics: {
      completedQuestIds: [],
      mountSkinIds: [...MOUNT_SKIN_IDS],
      weaponSkinIds: ['ice_fang_sword'],
      weaponSkinLoadout: {},
      mechChromaIds: ['amber_crimson'],
    },
    changeMountSkin: vi.fn((id: string | null) => {
      world.player.mountSkinId = id;
    }),
  };
  const win = new CosmeticsWindow(
    stubDeps({ root: () => root, world: () => world as never, captureFocus: () => null }),
  );
  win.open();
  return { root, world, win };
}
describe('cosmetics accessibility and interaction', () => {
  it.each(['mounts', 'skins', 'mech'] as const)(
    '%s has a named dialog and no serious WCAG violations',
    async (tab) => {
      await page.viewport(1280, 900);
      const { root, win } = mountWindow();
      win.open(tab);
      expect(root.getAttribute('aria-label')).toBe('Cosmetics');
      expect(root.querySelectorAll('.cos-card').length).toBeGreaterThan(0);
      const violations = await axeSeriousViolations(root);
      expect(violations, formatViolations(violations)).toEqual([]);
    },
  );
  it('makes every mount skin reachable with Wear and Take off on short mobile landscape', async () => {
    await page.viewport(844, 390);
    document.body.classList.add('mobile-touch');
    const { root, world } = mountWindow();
    const bounds = root.getBoundingClientRect();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(844);
    expect(bounds.bottom).toBeLessThanOrEqual(390);
    for (const id of MOUNT_SKIN_IDS) {
      const button = root.querySelector<HTMLButtonElement>(
        `[data-act="wear-mount"][data-id="${id}"]`,
      )!;
      button.scrollIntoView({ block: 'center' });
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
      button.click();
      expect(world.player.mountSkinId).toBe(id);
      root.querySelector<HTMLButtonElement>('[data-act="takeoff-mount"]')!.click();
      expect(world.player.mountSkinId).toBeNull();
    }
    expect(world.changeMountSkin).toHaveBeenCalledTimes(10);
  });
});
