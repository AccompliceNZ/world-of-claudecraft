import { describe, expect, it } from 'vitest';
import { resolveNearbyInteractionCandidate } from '../src/game/nearby_interaction_core';
import type { Entity, GatherNodeDef, QuestProgress } from '../src/sim/types';

function entity(overrides: Partial<Entity> & Pick<Entity, 'id' | 'kind'>): Entity {
  return {
    templateId: 'test',
    name: 'Test target',
    pos: { x: 0, y: 0, z: 0 },
    dead: false,
    ghost: false,
    lootable: false,
    loot: null,
    harvestClaimedBy: null,
    dungeonId: null,
    ...overrides,
  } as Entity;
}

function scan(targets: Entity[] = [], nodes: GatherNodeDef[] = []) {
  const player = entity({ id: 1, kind: 'player', name: 'Adventurer' });
  return {
    world: {
      playerId: player.id,
      player,
      entities: new Map<number, Entity>([
        [player.id, player],
        ...targets.map((target): [number, Entity] => [target.id, target]),
      ]),
      questLog: new Map<string, QuestProgress>(),
    },
    nodes,
  };
}

describe('resolveNearbyInteractionCandidate', () => {
  it('returns the same stable corpse, delve, object, npc, gather priority used by dispatch', () => {
    const corpse = entity({
      id: 2,
      kind: 'mob',
      templateId: 'forest_wolf',
      name: 'Forest Wolf',
      dead: true,
      lootable: true,
      loot: { copper: 1, items: [] },
    });
    const delve = entity({
      id: 3,
      kind: 'object',
      templateId: 'delve_chest',
      name: 'Delve Cache',
      lootable: true,
    });
    const object = entity({ id: 4, kind: 'object', name: 'Supply Crate', lootable: true });
    const npc = entity({ id: 5, kind: 'npc', templateId: 'elder_maren', name: 'Elder Maren' });
    const node = {
      id: 'ore_1',
      zoneId: 'zone',
      type: 'ore',
      pos: { x: 1, z: 0 },
      level: 1,
      tier: 1,
    } as const;

    const cases = [
      { targets: [corpse, delve, object, npc], kind: 'corpse', id: 2, verb: 'loot' },
      { targets: [delve, object, npc], kind: 'delve', id: 3, verb: 'open' },
      { targets: [object, npc], kind: 'object', id: 4, verb: 'use' },
      { targets: [npc], kind: 'npc', id: 5, verb: 'talk' },
      { targets: [], kind: 'gather', id: 'ore_1', verb: 'gather' },
    ] as const;

    for (const expected of cases) {
      const { targets, ...match } = expected;
      const { world } = scan([...targets], [node]);
      expect(resolveNearbyInteractionCandidate(world, [node])).toMatchObject(match);
    }
  });

  it('classifies the prompt verb without dispatching an interaction', () => {
    const mailbox = entity({
      id: 2,
      kind: 'object',
      templateId: 'mailbox',
      name: 'Mailbox',
      lootable: true,
    });
    const { world } = scan([mailbox]);

    expect(resolveNearbyInteractionCandidate(world, [])).toMatchObject({
      kind: 'object',
      id: 2,
      verb: 'mail',
      targetKind: 'raw',
      targetName: 'Mailbox',
    });
  });

  it('distinguishes harvestable corpses and bankers', () => {
    const corpse = entity({
      id: 2,
      kind: 'mob',
      templateId: 'forest_wolf',
      name: 'Forest Wolf',
      dead: true,
      lootable: true,
      loot: { copper: 0, items: [] },
    });
    const banker = entity({
      id: 3,
      kind: 'npc',
      templateId: 'bursar_wick',
      name: 'Bursar Wick',
    });

    expect(resolveNearbyInteractionCandidate(scan([corpse]).world, [])).toMatchObject({
      verb: 'harvest',
    });
    expect(resolveNearbyInteractionCandidate(scan([banker]).world, [])).toMatchObject({
      verb: 'bank',
    });
  });
});
