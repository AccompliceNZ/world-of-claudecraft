import { describe, expect, it } from 'vitest';
import {
  BRUIN_RUSH_WINDOW_ID,
  BRUIN_RUSH_WINDOW_SECONDS,
  LONGSTRIDE,
  LOPING_STRIDE_DURATION,
  LOPING_STRIDE_ICD,
  LOPING_STRIDE_SPEED,
  PIN_DURATION,
  PIN_ID,
  PIN_SLOW_MULT,
} from '../src/sim/combat/druid_engines';
import { DRUID_CHOICE_ROWS } from '../src/sim/content/choice_rows_classic';
import { ABILITIES, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { moveSpeedMult } from '../src/sim/player_motion';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// Wildfang kit pass 2 (engage, control, opener): the baseline shift sprint and
// its Longstride talent, the Bruin Rush to Wolf Form Pin rider, full-speed
// Stalk, the Lunge shape of Slinkstrike, and the Hamstring Bite finisher. Every
// case drives the real cast path (Sim.castAbility plus ticks) so the cost gate,
// the replacement resolver, and the aura funnels are the ones the game runs.

const LONGSTRIDE_ROW = 5;
const LONGSTRIDE_ID = 'dru_r5_ferocity';

function rig(rows: Record<number, string> = {}, spec: string | null = 'feral', seed = 29) {
  const sim = new Sim({ seed, playerClass: 'druid', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.applyTalents({ spec, rows })).toBe(true);
  const player = sim.player;
  player.resource = player.maxResource;
  return { sim, player };
}

function ticks(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(20 * seconds); i++) sim.tick();
}

function cast(sim: Sim, abilityId: string, settleSeconds = 0.05): void {
  sim.player.gcdRemaining = 0;
  sim.castAbility(abilityId);
  ticks(sim, settleSeconds);
}

function aura(entity: Entity, id: string) {
  return entity.auras.find((a) => a.id === id);
}

function inForm(entity: Entity, kind: 'form_bear' | 'form_cat'): boolean {
  return entity.auras.some((a) => a.kind === kind);
}

function dropAura(entity: Entity, id: string): void {
  entity.auras = entity.auras.filter((a) => a.id !== id);
}

// A hostile, effectively unkillable wolf dist yards in front of the druid,
// targeted and faced (the sim.test.ts idiom).
function addTargetMob(sim: Sim, dist: number, id = 9820): Entity {
  const player = sim.player;
  const mob = createMob(id, MOBS.forest_wolf, 20, {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z + dist,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = 1_000_000;
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  sim.targetEntity(mob.id);
  player.facing = 0;
  return mob;
}

describe('Loping Stride is baseline and Longstride retunes it', () => {
  it('grants the sprint on any form shift with no talent selected', () => {
    const { sim, player } = rig();
    expect(moveSpeedMult(player)).toBe(1);
    cast(sim, 'bear_form');
    const stride = aura(player, 'loping_stride');
    expect(stride?.kind).toBe('buff_speed');
    expect(stride?.value).toBe(LOPING_STRIDE_SPEED);
    expect(stride?.duration).toBe(LOPING_STRIDE_DURATION);
    expect(moveSpeedMult(player)).toBeCloseTo(1.6);
  });

  it('holds the baseline 20 sec internal cooldown between shifts', () => {
    const { sim, player } = rig();
    cast(sim, 'cat_form');
    expect(aura(player, 'loping_stride')).toBeDefined();
    dropAura(player, 'loping_stride');
    cast(sim, 'bear_form');
    expect(aura(player, 'loping_stride')).toBeUndefined();
    // One tick short of the cooldown: still held.
    ticks(sim, LOPING_STRIDE_ICD - 1);
    cast(sim, 'cat_form');
    expect(aura(player, 'loping_stride')).toBeUndefined();
    ticks(sim, 1.1);
    cast(sim, 'bear_form');
    expect(aura(player, 'loping_stride')).toBeDefined();
  });

  it('Longstride makes the sprint last 5 sec on a 12 sec cooldown', () => {
    expect(LONGSTRIDE).toEqual({ duration: 5, icd: 12 });
    const { sim, player } = rig({ [LONGSTRIDE_ROW]: LONGSTRIDE_ID });
    cast(sim, 'bear_form');
    const stride = aura(player, 'loping_stride');
    expect(stride?.duration).toBe(5);
    expect(stride?.value).toBe(LOPING_STRIDE_SPEED);
    dropAura(player, 'loping_stride');
    cast(sim, 'cat_form');
    expect(aura(player, 'loping_stride')).toBeUndefined();
    ticks(sim, 11);
    cast(sim, 'bear_form');
    expect(aura(player, 'loping_stride')).toBeUndefined();
    ticks(sim, 1.1);
    cast(sim, 'cat_form');
    expect(aura(player, 'loping_stride')?.duration).toBe(5);
  });

  it('reads the Longstride numbers from the row option so the tooltip cannot drift', () => {
    const row = DRUID_CHOICE_ROWS.rows.find((r) => r.level === LONGSTRIDE_ROW);
    const option = row?.options.find((o) => o.id === LONGSTRIDE_ID);
    expect(option?.name).toBe('Longstride');
    expect(option?.effect.intrinsic).toEqual({
      mechanic: 'druid_longstride',
      metrics: { duration: LONGSTRIDE.duration, icd: LONGSTRIDE.icd },
    });
    expect(option?.description).toContain(`${LONGSTRIDE.duration} sec`);
    expect(option?.description).toContain(`${LONGSTRIDE.icd} sec`);
  });
});

describe('Pin, the Bruin Rush to Wolf Form rider', () => {
  function rushRig() {
    const { sim, player } = rig();
    const target = addTargetMob(sim, 12);
    cast(sim, 'bear_form');
    expect(inForm(player, 'form_bear')).toBe(true);
    return { sim, player, target };
  }

  it('makes Wolf Form free inside the 3 sec window and Pins the Rush target', () => {
    const { sim, player, target } = rushRig();
    const parkedBefore = player.savedMana;
    cast(sim, 'bear_charge');
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)?.value).toBe(target.id);
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)?.duration).toBe(BRUIN_RUSH_WINDOW_SECONDS);
    // The displayed cost and the bill agree: both worlds read the same tail.
    expect(sim.resolvedAbility('cat_form')?.cost).toBe(0);
    ticks(sim, 1);
    cast(sim, 'cat_form');
    expect(inForm(player, 'form_cat')).toBe(true);
    expect(player.savedMana).toBe(parkedBefore);
    const pin = aura(target, PIN_ID);
    expect(pin?.kind).toBe('slow');
    expect(pin?.value).toBe(PIN_SLOW_MULT);
    expect(pin?.duration).toBe(PIN_DURATION);
    expect(pin?.sourceId).toBe(player.id);
    expect(moveSpeedMult(target)).toBeCloseTo(0.5);
    // The window is consumed by the shift.
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)).toBeUndefined();
    expect(sim.resolvedAbility('bear_form')?.cost).toBe(30);
  });

  it('charges the full 30 mana and Pins nothing once the window has closed', () => {
    const { sim, player, target } = rushRig();
    cast(sim, 'bear_charge');
    ticks(sim, BRUIN_RUSH_WINDOW_SECONDS + 0.2);
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)).toBeUndefined();
    expect(sim.resolvedAbility('cat_form')?.cost).toBe(30);
    const parkedBefore = player.savedMana;
    cast(sim, 'cat_form');
    expect(inForm(player, 'form_cat')).toBe(true);
    expect(player.savedMana).toBe(parkedBefore - 30);
    expect(aura(target, PIN_ID)).toBeUndefined();
  });

  it('Pins the Rushed target even when the druid has retargeted', () => {
    const { sim, player, target } = rushRig();
    const other = addTargetMob(sim, 5, 9821);
    sim.targetEntity(target.id);
    cast(sim, 'bear_charge');
    sim.targetEntity(other.id);
    cast(sim, 'cat_form');
    expect(aura(target, PIN_ID)).toBeDefined();
    expect(aura(other, PIN_ID)).toBeUndefined();
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)).toBeUndefined();
  });

  it('closes the window on death and on leaving combat', () => {
    const { sim, player, target } = rushRig();
    const dealDamage = (sim as unknown as { dealDamage(...args: unknown[]): void }).dealDamage.bind(
      sim,
    );
    cast(sim, 'bear_charge');
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)).toBeDefined();
    // Leaving combat: the Rush target dies, the hate table empties, and the
    // combat timer runs out; the engaged pass then closes the window.
    dealDamage(player, target, target.hp + 1, false, 'physical', null, 'hit');
    expect(target.dead).toBe(true);
    player.autoAttack = false;
    player.inCombat = false;
    player.combatTimer = 99;
    sim.tick();
    expect(player.inCombat).toBe(false);
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)).toBeUndefined();

    const second = addTargetMob(sim, 12, 9822);
    player.cooldowns.delete('bear_charge');
    cast(sim, 'bear_charge');
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)?.value).toBe(second.id);
    dealDamage(null, player, player.hp + 1, false, 'physical', null, 'hit');
    expect(player.dead).toBe(true);
    expect(aura(player, BRUIN_RUSH_WINDOW_ID)).toBeUndefined();
  });

  it('applies the same no-ladder rule as every other slow, so a repeat Pin is never diminished', () => {
    const { sim, player, target } = rushRig();
    cast(sim, 'bear_charge');
    cast(sim, 'cat_form');
    expect(aura(target, PIN_ID)?.duration).toBe(PIN_DURATION);
    dropAura(target, PIN_ID);
    player.cooldowns.delete('bear_charge');
    cast(sim, 'bear_form');
    cast(sim, 'bear_charge');
    cast(sim, 'cat_form');
    expect(aura(target, PIN_ID)?.duration).toBe(PIN_DURATION);
    // Hobbling Cut's slow aura is the reference: same kind, no DR category.
    expect(ABILITIES.hamstring.effects.some((e) => e.type === 'slow')).toBe(true);
  });
});

describe('Stalk moves at full speed', () => {
  it('stealths a Wolf at 1.0x while rogue Duskveil keeps its 0.5x crawl', () => {
    const { sim, player } = rig();
    cast(sim, 'cat_form');
    expect(moveSpeedMult(player)).toBeCloseTo(1.6); // the shift's Loping Stride
    dropAura(player, 'loping_stride');
    cast(sim, 'prowl');
    const stealth = player.auras.find((a) => a.kind === 'stealth');
    expect(stealth?.value).toBe(1);
    expect(moveSpeedMult(player)).toBe(1);

    const rogue = new Sim({ seed: 29, playerClass: 'rogue', autoEquip: true });
    rogue.setPlayerLevel(20);
    rogue.player.gcdRemaining = 0;
    rogue.castAbility('stealth');
    rogue.tick();
    const duskveil = rogue.player.auras.find((a) => a.kind === 'stealth');
    expect(duskveil?.value).toBe(0.5);
    expect(moveSpeedMult(rogue.player)).toBe(0.5);
    expect(ABILITIES.stealth.description).toContain('50% slower');
    expect(ABILITIES.prowl.description).not.toContain('slower');
  });
});
