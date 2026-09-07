import { describe, expect, it } from 'vitest';
import { NPCS, QUESTS, zoneAt } from '../src/sim/data';
import type { QuestProgress } from '../src/sim/types';
import {
  buildMapSidebarView,
  DEFAULT_MAP_ATLAS_FILTERS,
  toggleMapAtlasFilter,
} from '../src/ui/map_sidebar_view';
import type { IWorld } from '../src/world_api';

function progress(questId: string, state: QuestProgress['state'], current = 0): QuestProgress {
  return { questId, counts: [current], state };
}

function world(questLog: Map<string, QuestProgress>, available = new Set<string>()): IWorld {
  const giver = NPCS[QUESTS.q_wolves.giverNpcId];
  return {
    player: { name: 'Adventurer', pos: { x: giver.pos.x, y: 0, z: giver.pos.z } },
    questLog,
    questState: (questId: string) => (available.has(questId) ? 'available' : 'unavailable'),
  } as unknown as IWorld;
}

describe('map sidebar view', () => {
  it('keeps quest numbers in log order and selects the first incomplete objective', () => {
    const log = new Map([
      ['q_wolves', progress('q_wolves', 'active', 2)],
      ['q_boars', progress('q_boars', 'ready', 8)],
    ]);
    const w = world(log);
    const zone = zoneAt(w.player.pos.x, w.player.pos.z);

    const model = buildMapSidebarView({
      world: w,
      zone,
      filters: DEFAULT_MAP_ATLAS_FILTERS,
      selectedQuestId: 'q_wolves',
    });

    expect(model.quests.map((quest) => [quest.questId, quest.number])).toEqual([
      ['q_wolves', 1],
      ['q_boars', 2],
    ]);
    expect(model.quests[0]).toMatchObject({ selected: true, current: 2, objectiveIndex: 0 });
    expect(model.quests[1]).toMatchObject({ ready: true, selected: false });
    expect(model.route).toMatchObject({ questId: 'q_wolves' });
  });

  it('lists the closest available offers in the current zone without mutating the log', () => {
    const w = world(new Map(), new Set(['q_wolves']));
    const zone = zoneAt(w.player.pos.x, w.player.pos.z);

    const model = buildMapSidebarView({
      world: w,
      zone,
      filters: DEFAULT_MAP_ATLAS_FILTERS,
      selectedQuestId: null,
    });

    expect(model.nearby.some((quest) => quest.questId === 'q_wolves')).toBe(true);
    expect(model.nearby.find((quest) => quest.questId === 'q_wolves')?.zoneId).toBe(zone.id);
    expect(w.questLog.size).toBe(0);
  });

  it('keeps an unknown accepted quest in the numbered rail for stale-client parity', () => {
    const unknown = progress('q_future_content', 'active');
    const w = world(new Map([[unknown.questId, unknown]]));
    const zone = zoneAt(w.player.pos.x, w.player.pos.z);

    const model = buildMapSidebarView({
      world: w,
      zone,
      filters: DEFAULT_MAP_ATLAS_FILTERS,
      selectedQuestId: unknown.questId,
    });

    expect(model.quests[0]).toMatchObject({
      questId: 'q_future_content',
      number: 1,
      objectiveIndex: null,
    });
    expect(model.route).toBeNull();
  });

  it('opens with every marker family the shipped map paints', () => {
    expect(Object.values(DEFAULT_MAP_ATLAS_FILTERS).every(Boolean)).toBe(true);
  });

  it('toggles only the requested atlas layer', () => {
    const next = toggleMapAtlasFilter(DEFAULT_MAP_ATLAS_FILTERS, 'services');
    expect(next.services).toBe(false);
    expect(next.quests).toBe(true);
    expect(DEFAULT_MAP_ATLAS_FILTERS.services).toBe(true);
  });
});
