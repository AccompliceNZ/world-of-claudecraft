import { describe, expect, it } from 'vitest';
import type { ClientWorld } from '../src/net/online';
import { BUILTIN_WORLD } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { abilityScalingOf } from '../src/ui/ability_damage';
import { abilityEffectText } from '../src/ui/ability_description';
import { bareClient } from './helpers/bare_client';

function snapshot(client: ClientWorld, extra: Record<string, unknown> = {}): void {
  (client as unknown as { applySnapshot(value: unknown): void }).applySnapshot({
    t: 'snap',
    tick: 1,
    time: 0,
    ents: [],
    self: {
      id: 1,
      k: 'player',
      tid: 'paladin',
      nm: 'Healer',
      lv: 20,
      x: 0,
      y: 0,
      z: 0,
      f: 0,
      hp: 100,
      mhp: 100,
      res: 100,
      mres: 100,
      rtype: 'mana',
      tal: { alloc: { spec: 'holy', rows: {} }, loadouts: [], activeLoadout: -1 },
      ...extra,
    },
  });
}

describe('online balance resolution uses current snapshot state', () => {
  it('applies a new Fiesta healing augment, retains an omitted delta, and clears on exit', () => {
    const client = bareClient(1, { playerClass: 'paladin' });
    snapshot(client);
    const ordinary = client.resolvedAbility('aegis_first_dawn');
    expect(ordinary?.outputScaling?.healing).toBe(1);
    snapshot(client, { arena: { match: { fiesta: { augments: ['aug_mending'] } } } });
    const augmented = client.resolvedAbility('aegis_first_dawn');
    expect(augmented?.outputScaling?.healing).toBe(1.2);
    expect(augmented?.outputScaling?.primaryHealing).toBe(1.1);
    expect(augmented?.effects).not.toEqual(ordinary?.effects);
    snapshot(client);
    expect(client.resolvedAbility('aegis_first_dawn')).toEqual(augmented);
    snapshot(client, { arena: null });
    expect(client.resolvedAbility('aegis_first_dawn')).toEqual(ordinary);
  });

  it('shows Ascension healing effects and Radiant Resonance cast time identically offline and online', () => {
    const sim = new Sim({
      seed: 842,
      playerClass: 'paladin',
      autoEquip: false,
      world: { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] },
    });
    sim.setPlayerLevel(20);
    expect(sim.setSpec('holy')).toBe(true);
    const client = bareClient(1, { playerClass: 'paladin' });
    const devotion = {
      value: 0,
      ascensionCharges: 3,
      ascensionRemaining: 20,
      outOfCombatTime: 0,
      decayProgress: 0,
      blockIcdRemaining: 0,
    };
    sim.player.paladinDevotion = devotion;
    snapshot(client, { pdev: { value: 0, charges: 3, remaining: 20 } });
    for (const id of ['dawns_embrace', 'radiant_chorus', 'solar_invocation']) {
      const offline = sim.resolvedAbility(id);
      const online = client.resolvedAbility(id);
      expect(offline, id).not.toBeNull();
      expect(online?.effects, id).toEqual(offline?.effects);
      expect(online?.castTime, id).toBe(offline?.castTime);
      expect(online?.outputScaling, id).toEqual(offline?.outputScaling);
    }
    sim.player.paladinDevotion = { ...devotion, ascensionCharges: 0, ascensionRemaining: 0 };
    sim.player.auras.push({
      id: 'radiant_resonance',
      name: 'Radiant Resonance',
      kind: 'paladin_radiant_resonance',
      value: 0.5,
      remaining: 10,
      duration: 10,
      sourceId: sim.player.id,
      school: 'holy',
    });
    snapshot(client, {
      pdev: null,
      auras: [
        {
          id: 'radiant_resonance',
          name: 'Radiant Resonance',
          kind: 'paladin_radiant_resonance',
          value: 0.5,
          rem: 10,
          dur: 10,
          src: 1,
          school: 'holy',
        },
      ],
    });
    const offline = sim.resolvedAbility('dawns_embrace');
    const online = client.resolvedAbility('dawns_embrace');
    if (!offline || !online) throw new Error('Dawn is missing');
    expect(online.castTime).toBe(offline.castTime);
    expect(online.castTime).toBe(1.5);
    const scaling = abilityScalingOf(sim.player);
    expect(abilityEffectText(online, scaling)).toBe(abilityEffectText(offline, scaling));
  });
});
