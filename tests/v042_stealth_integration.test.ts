import { describe, expect, it, vi } from 'vitest';
import { runEffects } from '../src/sim/combat/effect_dispatch';
import { GLOAM_ID, VEILED_EDGE_ID } from '../src/sim/combat/rogue_engines';
import { BUILTIN_WORLD, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Aura } from '../src/sim/types';

function setup(spec: string, stealth: boolean, edge = false) {
  const sim = new Sim({
    seed: 42042,
    playerClass: 'rogue',
    autoEquip: true,
    world: { ...BUILTIN_WORLD, camps: [], npcs: {}, groundObjects: [] },
  });
  sim.setPlayerLevel(20);
  expect(sim.setSpec(spec)).toBe(true);
  const p = sim.player;
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, 20, { ...p.pos, z: p.pos.z + 2 });
  mob.maxHp = mob.hp = 100000;
  sim.addEntity(mob);
  p.auras = [];
  const aura = (id: string, kind: Aura['kind'], value: number): Aura => ({
    id,
    kind,
    value,
    name: id,
    sourceId: p.id,
    school: 'physical',
    duration: 30,
    remaining: 30,
  });
  if (stealth) p.auras.push(aura('stealth', 'stealth', 0));
  if (edge) p.auras.push(aura(VEILED_EDGE_ID, 'internal_cd', 0.5));
  const meta = sim.players.get(p.id);
  const resolved = sim.resolvedAbility('ambush');
  if (!meta || !resolved) throw new Error('missing rogue fixture');
  return { sim, p, mob, meta, resolved, aura };
}
describe('Skulduggery complete opener integration', () => {
  it.each([
    ['subtlety', true, false, 2, 2],
    ['subtlety', true, true, 2, 2],
    ['subtlety', false, true, 1.5, 1],
    ['assassination', true, false, 1, 1],
  ] as const)(
    '%s stealth=%s edge=%s delivers the correct weapon and flat factors',
    (spec, stealth, edge, weaponFactor, flatFactor) => {
      const { sim, p, mob, meta, resolved } = setup(spec, stealth, edge);
      const hit = vi.spyOn(sim.ctx, 'meleeSwing').mockReturnValue(true);
      runEffects(sim.ctx, p, meta, mob, {
        ...resolved,
        effects: [{ type: 'weaponStrike', bonus: 100, weaponMult: 1.6 }],
      });
      expect(hit.mock.calls[0]?.[2]).toBe(100 * flatFactor);
      expect(hit.mock.calls[0]?.[4]?.weaponMult).toBeCloseTo(1.6 * weaponFactor);
      expect(p.auras.some((a) => a.kind === 'stealth')).toBe(false);
      expect(p.auras.some((a) => a.id === VEILED_EDGE_ID)).toBe(false);
    },
  );

  it('does not let a full Gloam bank waive the true-stealth behind requirement', () => {
    const { sim, p, mob, aura } = setup('subtlety', true);
    p.weapon = { ...p.weapon, dagger: true };
    p.facing = 0;
    mob.facing = Math.PI; // mob faces the priest-side player
    p.auras.push({ ...aura(GLOAM_ID, 'gloam', 0), stacks: 3 });
    sim.targetEntity(mob.id);
    const hit = vi.spyOn(sim.ctx, 'meleeSwing');
    sim.castAbility('ambush');
    expect(hit).not.toHaveBeenCalled();
    expect(p.auras.some((a) => a.kind === 'stealth')).toBe(true);
    expect(
      sim.drainEvents().some((event) => event.type === 'error' && event.text.includes('behind')),
    ).toBe(true);
  });
});
