// Coldsight v0.42 class-balance pass (docs/design/class-balance-v042.md): a
// fully completed Fevered Draw (all six pulses, no cancel/interrupt/pushback
// shortening) grants one visible, non-stacking 10 sec opportunity; an
// accepted Long Draw or Fell Shot reserves it immediately (so a later
// interruption still spends it), and the reservation resolves into a
// +50%/+75% damageMult on the complete hit exactly once. This suite covers
// the exported state machine (src/sim/combat/hunter_coldsight_read.ts)
// directly; the real coordinator flow (a live Sim channeling, casting,
// interrupting) is tests/v042_coldsight_integration.test.ts.
import { describe, expect, it } from 'vitest';
import {
  COLDSIGHT_READ_FELL_SHOT_MULT,
  COLDSIGHT_READ_LONG_DRAW_MULT,
  coldsightFeveredDrawChannelStart,
  coldsightFeveredDrawCompleted,
  coldsightFeveredDrawPulse,
  coldsightReadArmed,
  coldsightReserveRead,
  coldsightVoidReservationOnCancel,
  consumeColdsightReadReservation,
  FEVERED_DRAW_PULSE_COUNT,
} from '../src/sim/combat/hunter_coldsight_read';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import type { ResolvedAbility } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity } from '../src/sim/types';

type TestSim = Sim & { ctx: SimContext; addEntity(e: Entity): void; nextId: number };

function hunterSim(spec: string, seed: number): TestSim {
  const sim = new Sim({ seed, playerClass: 'hunter', autoEquip: true }) as TestSim;
  sim.setPlayerLevel(20);
  expect(sim.setSpec(spec)).toBe(true);
  return sim;
}

function liveTarget(sim: TestSim): Entity {
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, 20, { ...sim.player.pos });
  sim.addEntity(mob);
  return mob;
}

function fullFeveredDraw(
  sim: TestSim,
  target: Entity | null,
  pulses = FEVERED_DRAW_PULSE_COUNT,
): void {
  coldsightFeveredDrawChannelStart(sim.ctx, sim.player, 'rapid_fire');
  for (let i = 0; i < pulses; i++) coldsightFeveredDrawPulse(sim.ctx, sim.player, 'rapid_fire');
  coldsightFeveredDrawCompleted(sim.ctx, sim.player, 'rapid_fire', target);
}

describe('Fevered Draw grant: only a full, valid channel qualifies', () => {
  it('grants a 10 sec visible opportunity after all six pulses land on a live target', () => {
    const sim = hunterSim('marksmanship', 201);
    const target = liveTarget(sim);
    expect(coldsightReadArmed(sim.player)).toBe(false);
    fullFeveredDraw(sim, target);
    expect(coldsightReadArmed(sim.player)).toBe(true);
    const aura = sim.player.auras.find((a) => a.kind === 'hunter_coldsight_read');
    expect(aura?.duration).toBe(10);
    expect(aura?.remaining).toBe(10);
  });

  it('refuses a pushback-shortened channel: fewer than six real pulses grants nothing', () => {
    const sim = hunterSim('marksmanship', 202);
    const target = liveTarget(sim);
    fullFeveredDraw(sim, target, FEVERED_DRAW_PULSE_COUNT - 1);
    expect(coldsightReadArmed(sim.player)).toBe(false);
  });

  it('refuses when the target is dead at completion', () => {
    const sim = hunterSim('marksmanship', 203);
    const target = liveTarget(sim);
    target.dead = true;
    fullFeveredDraw(sim, target);
    expect(coldsightReadArmed(sim.player)).toBe(false);
  });

  it('refuses when there is no target at completion', () => {
    const sim = hunterSim('marksmanship', 204);
    fullFeveredDraw(sim, null);
    expect(coldsightReadArmed(sim.player)).toBe(false);
  });

  it('ignores completion of any ability other than rapid_fire', () => {
    const sim = hunterSim('marksmanship', 205);
    const target = liveTarget(sim);
    coldsightFeveredDrawChannelStart(sim.ctx, sim.player, 'rapid_fire');
    for (let i = 0; i < FEVERED_DRAW_PULSE_COUNT; i++) {
      coldsightFeveredDrawPulse(sim.ctx, sim.player, 'rapid_fire');
    }
    coldsightFeveredDrawCompleted(sim.ctx, sim.player, 'aimed_shot', target);
    expect(coldsightReadArmed(sim.player)).toBe(false);
  });

  it('never grants for a non-marksmanship hunter spec', () => {
    const sim = hunterSim('survival', 206);
    const target = liveTarget(sim);
    fullFeveredDraw(sim, target);
    expect(coldsightReadArmed(sim.player)).toBe(false);
  });

  it('a channel that never actually started (no pulses tracked) grants nothing even if reported complete', () => {
    const sim = hunterSim('marksmanship', 207);
    const target = liveTarget(sim);
    coldsightFeveredDrawCompleted(sim.ctx, sim.player, 'rapid_fire', target);
    expect(coldsightReadArmed(sim.player)).toBe(false);
  });

  it('a repeated full completion refreshes, never stacks', () => {
    const sim = hunterSim('marksmanship', 208);
    const target = liveTarget(sim);
    fullFeveredDraw(sim, target);
    const aura = sim.player.auras.find((a) => a.kind === 'hunter_coldsight_read');
    if (aura) aura.remaining = 1; // simulate it ticking most of the way down
    fullFeveredDraw(sim, target);
    expect(sim.player.auras.filter((a) => a.kind === 'hunter_coldsight_read')).toHaveLength(1);
    expect(sim.player.auras.find((a) => a.kind === 'hunter_coldsight_read')?.remaining).toBe(10);
  });

  it('a fresh channel start resets progress: a prior short channel cannot combine with a later one', () => {
    const sim = hunterSim('marksmanship', 209);
    const target = liveTarget(sim);
    coldsightFeveredDrawChannelStart(sim.ctx, sim.player, 'rapid_fire');
    coldsightFeveredDrawPulse(sim.ctx, sim.player, 'rapid_fire'); // 1 pulse, then abandoned (no completion call)
    fullFeveredDraw(sim, target); // a fresh, full channel
    expect(coldsightReadArmed(sim.player)).toBe(true);
  });
});

describe('coldsightReserveRead: reserve at accepted cast, reject never consumes', () => {
  it('reserves on an accepted Long Draw and consumes the armed opportunity', () => {
    const sim = hunterSim('marksmanship', 210);
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    expect(coldsightReadArmed(sim.player)).toBe(false);
  });

  it('a rejected/ineligible cast never consumes the armed opportunity', () => {
    const sim = hunterSim('marksmanship', 211);
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'multi_shot'); // not a Coldsight Read ability
    expect(coldsightReadArmed(sim.player)).toBe(true);
  });

  it('reserving with nothing armed is a no-op', () => {
    const sim = hunterSim('marksmanship', 212);
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    const base = sim.resolvedAbility('aimed_shot');
    if (!base) throw new Error('expected aimed_shot to resolve');
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, base)).toBe(base);
  });

  it('prevents a second queued action from spending the same opportunity', () => {
    const sim = hunterSim('marksmanship', 213);
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot'); // first accepted cast reserves it
    coldsightReserveRead(sim.ctx, sim.player, 'arcane_shot'); // same-tick second cast finds nothing armed
    const fell = sim.resolvedAbility('arcane_shot');
    if (!fell) throw new Error('expected arcane_shot to resolve');
    // The second (arcane_shot) cast never reserved anything, so its own resolve is untouched...
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, fell)).toBe(fell);
    // ...while the first (aimed_shot) cast's reservation is still live and tied to it.
    const aimed = sim.resolvedAbility('aimed_shot');
    if (!aimed) throw new Error('expected aimed_shot to resolve');
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, aimed)).not.toBe(aimed);
  });
});

describe('coldsightVoidReservationOnCancel: interrupted casts spend it, never leak forward', () => {
  it('an interrupted Long Draw loses its reservation for good', () => {
    const sim = hunterSim('marksmanship', 214);
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    coldsightVoidReservationOnCancel(sim.ctx, sim.player, 'aimed_shot');
    const base = sim.resolvedAbility('aimed_shot');
    if (!base) throw new Error('expected aimed_shot to resolve');
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, base)).toBe(base);
    expect(coldsightReadArmed(sim.player)).toBe(false); // not merely re-armed either
  });

  it('leaves an unrelated cancelled cast alone', () => {
    const sim = hunterSim('marksmanship', 215);
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    coldsightVoidReservationOnCancel(sim.ctx, sim.player, 'raptor_strike');
    const base = sim.resolvedAbility('aimed_shot');
    if (!base) throw new Error('expected aimed_shot to resolve');
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, base)).not.toBe(base);
  });
});

describe('consumeColdsightReadReservation: a damageMult rider on the complete hit, exactly once', () => {
  function directDamageOf(res: ResolvedAbility) {
    const eff = res.effects.find((e) => e.type === 'directDamage');
    if (eff?.type !== 'directDamage') throw new Error('expected a directDamage effect');
    return eff;
  }

  it('bakes +50% as damageMult into a reserved Long Draw, leaving min/max (and any AP scaling) untouched', () => {
    const sim = hunterSim('marksmanship', 216);
    const base = sim.resolvedAbility('aimed_shot');
    if (!base) throw new Error('expected aimed_shot to resolve');
    const baseEff = directDamageOf(base);
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    const boosted = consumeColdsightReadReservation(sim.ctx, sim.player, base);
    const boostedEff = directDamageOf(boosted);
    expect(boostedEff.min).toBe(baseEff.min);
    expect(boostedEff.max).toBe(baseEff.max);
    expect(boostedEff.damageMult ?? 1).toBeCloseTo(COLDSIGHT_READ_LONG_DRAW_MULT);
  });

  it('bakes +75% for a reserved Fell Shot', () => {
    const sim = hunterSim('marksmanship', 217);
    const base = sim.resolvedAbility('arcane_shot');
    if (!base) throw new Error('expected arcane_shot to resolve');
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'arcane_shot');
    const boosted = consumeColdsightReadReservation(sim.ctx, sim.player, base);
    expect(directDamageOf(boosted).damageMult ?? 1).toBeCloseTo(COLDSIGHT_READ_FELL_SHOT_MULT);
  });

  it('composes with an existing damageMult rather than overwriting it', () => {
    const sim = hunterSim('marksmanship', 218);
    const base = sim.resolvedAbility('aimed_shot');
    if (!base) throw new Error('expected aimed_shot to resolve');
    const withExistingMult: ResolvedAbility = {
      ...base,
      effects: base.effects.map((eff) =>
        eff.type === 'directDamage' ? { ...eff, damageMult: 1.2 } : eff,
      ),
    };
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    const boosted = consumeColdsightReadReservation(sim.ctx, sim.player, withExistingMult);
    expect(directDamageOf(boosted).damageMult).toBeCloseTo(1.2 * COLDSIGHT_READ_LONG_DRAW_MULT);
  });

  it('leaves the resolved ability unchanged (same reference) when nothing is reserved', () => {
    const sim = hunterSim('marksmanship', 219);
    const base = sim.resolvedAbility('aimed_shot');
    if (!base) throw new Error('expected aimed_shot to resolve');
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, base)).toBe(base);
  });

  it('leaves an ineligible ability unchanged even with a live reservation, and does not consume it', () => {
    const sim = hunterSim('marksmanship', 220);
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    const sting = sim.resolvedAbility('serpent_sting');
    if (!sting) throw new Error('expected serpent_sting to resolve');
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, sting)).toBe(sting);
    const aimed = sim.resolvedAbility('aimed_shot');
    if (!aimed) throw new Error('expected aimed_shot to resolve');
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, aimed)).not.toBe(aimed);
  });

  it('only consumes once: a second resolve of the same ability finds nothing left', () => {
    const sim = hunterSim('marksmanship', 221);
    const base = sim.resolvedAbility('aimed_shot');
    if (!base) throw new Error('expected aimed_shot to resolve');
    fullFeveredDraw(sim, liveTarget(sim));
    coldsightReserveRead(sim.ctx, sim.player, 'aimed_shot');
    consumeColdsightReadReservation(sim.ctx, sim.player, base);
    expect(consumeColdsightReadReservation(sim.ctx, sim.player, base)).toBe(base);
  });
});
