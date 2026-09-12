import { describe, expect, it } from 'vitest';
import {
  LONGSTRIDE,
  LOPING_STRIDE_DURATION,
  LOPING_STRIDE_ICD,
  LOPING_STRIDE_SPEED,
} from '../src/sim/combat/druid_engines';
import { DRUID_CHOICE_ROWS } from '../src/sim/content/choice_rows_classic';
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

function dropAura(entity: Entity, id: string): void {
  entity.auras = entity.auras.filter((a) => a.id !== id);
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
