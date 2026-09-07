// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NPCS, QUESTS, zoneAt } from '../src/sim/data';
import type { QuestProgress } from '../src/sim/types';
import { MapSidebarController } from '../src/ui/map_sidebar_controller';
import type { IWorld } from '../src/world_api';

function makeHarness(alsoTracked: readonly string[] = []) {
  const root = document.createElement('aside');
  document.body.appendChild(root);
  const giver = NPCS[QUESTS.q_wolves.giverNpcId];
  const quest: QuestProgress = { questId: 'q_wolves', counts: [2], state: 'active' };
  const log = new Map<string, QuestProgress>([['q_wolves', quest]]);
  for (const questId of alsoTracked) {
    log.set(questId, { questId, counts: [0], state: 'active' });
  }
  const world = {
    player: { name: 'Adventurer', pos: { x: giver.pos.x, y: 0, z: giver.pos.z } },
    questLog: log,
    questState: () => 'unavailable',
  } as unknown as IWorld;
  const click = vi.fn();
  const onFiltersChanged = vi.fn();
  const onShowRoute = vi.fn();
  const onUntrackQuest = vi.fn();
  const controller = new MapSidebarController({
    root: () => root,
    click,
    onFiltersChanged,
    onShowRoute,
    onUntrackQuest,
  });
  controller.update(world, zoneAt(giver.pos.x, giver.pos.z));
  return { root, controller, click, onFiltersChanged, onShowRoute, onUntrackQuest, world };
}

describe('map sidebar controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the complete atlas rail from the current world', () => {
    const test = makeHarness();
    expect(test.root.querySelectorAll('[data-map-filter]')).toHaveLength(5);
    expect(test.root.querySelector('[data-map-quest="q_wolves"]')).not.toBeNull();
    expect(test.root.querySelector('[data-map-route]')).not.toBeNull();
    expect(test.root.querySelectorAll('.map-atlas-legend > span')).toHaveLength(5);
    expect(test.root.textContent).toContain('Tracked quests');
    expect(test.root.textContent).toContain('Available nearby');
  });

  it('publishes filter changes and the selected quest route', () => {
    const test = makeHarness();
    test.root.querySelector<HTMLElement>('[data-map-filter="services"]')?.click();
    expect(test.onFiltersChanged).toHaveBeenCalledWith(
      expect.objectContaining({ services: false, quests: true }),
    );

    test.root.querySelector<HTMLElement>('[data-map-route]')?.click();
    expect(test.onShowRoute).toHaveBeenCalledWith(expect.objectContaining({ questId: 'q_wolves' }));
    expect(test.controller.shownRoute()).toMatchObject({ questId: 'q_wolves' });
    expect(test.root.querySelector('[data-map-route]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the toggled filter chip focused across the rail swap', () => {
    const test = makeHarness();
    const chip = test.root.querySelector<HTMLElement>('[data-map-filter="services"]');
    chip?.focus();
    expect(document.activeElement).toBe(chip);

    chip?.click();

    const repainted = test.root.querySelector<HTMLElement>('[data-map-filter="services"]');
    expect(repainted).not.toBe(chip);
    expect(document.activeElement).toBe(repainted);
    expect(repainted?.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the selected quest row focused across the rail swap', () => {
    const test = makeHarness(['q_boars']);
    const row = test.root.querySelector<HTMLElement>('[data-map-quest="q_boars"]');
    row?.focus();

    row?.click();

    const repainted = test.root.querySelector<HTMLElement>('[data-map-quest="q_boars"]');
    expect(repainted).not.toBe(row);
    expect(document.activeElement).toBe(repainted);
    expect(repainted?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the Show Route button focused after it publishes a route', () => {
    const test = makeHarness();
    const route = test.root.querySelector<HTMLElement>('[data-map-route]');
    route?.focus();

    route?.click();

    const repainted = test.root.querySelector<HTMLElement>('[data-map-route]');
    expect(repainted).not.toBe(route);
    expect(document.activeElement).toBe(repainted);
  });

  it('leaves focus alone when it was never inside the rail', () => {
    const test = makeHarness();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    test.root.querySelector<HTMLElement>('[data-map-filter="services"]')?.click();

    expect(document.activeElement).toBe(outside);
  });

  it('untracks selection without abandoning the authoritative quest', () => {
    const test = makeHarness();
    const abandonQuest = vi.fn();
    Object.assign(test.world, { abandonQuest });

    test.root.querySelector<HTMLElement>('[data-map-untrack]')?.click();
    test.controller.update(test.world, zoneAt(test.world.player.pos.x, test.world.player.pos.z));

    expect(test.onUntrackQuest).toHaveBeenCalledWith('q_wolves');
    expect(test.controller.shownRoute()).toBeNull();
    expect(abandonQuest).not.toHaveBeenCalled();
    expect(test.root.querySelector('[data-map-untrack]')?.hasAttribute('disabled')).toBe(true);
  });
});

describe('map sidebar controller: walking cadence', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  /** The offers list is the only part of the rail that moves with the player, so
   *  it needs live offers to be worth measuring (the default harness has none). */
  function walkingHarness() {
    const root = document.createElement('aside');
    document.body.appendChild(root);
    const giver = NPCS[QUESTS.q_wolves.giverNpcId];
    const world = {
      player: { name: 'Adventurer', pos: { x: giver.pos.x, y: 0, z: giver.pos.z } },
      questLog: new Map<string, QuestProgress>([
        ['q_wolves', { questId: 'q_wolves', counts: [2], state: 'active' }],
      ]),
      questState: () => 'available',
    } as unknown as IWorld;
    const controller = new MapSidebarController({
      root: () => root,
      click: vi.fn(),
      onFiltersChanged: vi.fn(),
      onShowRoute: vi.fn(),
      onUntrackQuest: vi.fn(),
    });
    const zone = zoneAt(giver.pos.x, giver.pos.z);
    const writes = { count: 0 };
    let descriptor: PropertyDescriptor | undefined;
    for (
      let proto = Object.getPrototypeOf(root);
      proto && !descriptor;
      proto = Object.getPrototypeOf(proto)
    ) {
      descriptor = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    }
    if (!descriptor?.set) throw new Error('no innerHTML accessor to count writes through');
    const innerHtml = descriptor;
    Object.defineProperty(root, 'innerHTML', {
      configurable: true,
      get: () => innerHtml.get?.call(root),
      set: (value: string) => {
        writes.count += 1;
        innerHtml.set?.call(root, value);
      },
    });
    const walk = (dx: number) => {
      world.player.pos.x = giver.pos.x + dx;
      controller.update(world, zone);
    };
    return { root, walk, writes };
  }

  it('repaints nothing while the player walks a few yards', () => {
    const test = walkingHarness();
    test.walk(0);
    expect(test.writes.count, 'the first update paints the rail').toBe(1);
    expect(test.root.querySelectorAll('.map-atlas-nearby-row').length).toBeGreaterThan(0);
    const painted = test.root.firstElementChild;

    test.walk(3);

    // A live distance moved every tick, so the rail used to rebuild its whole
    // subtree four times a second while the player walked.
    expect(test.writes.count).toBe(1);
    expect(test.root.firstElementChild).toBe(painted);
  });

  it('repaints once the offers list actually reads differently', () => {
    const test = walkingHarness();
    test.walk(0);
    const painted = test.root.firstElementChild;
    const before = test.root.querySelector('.map-atlas-nearby-row')?.textContent;

    test.walk(30);

    expect(test.writes.count).toBe(2);
    expect(test.root.firstElementChild).not.toBe(painted);
    expect(test.root.querySelector('.map-atlas-nearby-row')?.textContent).not.toBe(before);
  });
});
