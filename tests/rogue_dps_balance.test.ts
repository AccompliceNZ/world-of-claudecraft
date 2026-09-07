import { describe, expect, it } from 'vitest';
import {
  averageRogueDps,
  ROGUE_BAND_FIXTURE,
  type RogueProbeSpec,
  runRogueDpsProbe,
} from '../scripts/rogue_dps_probe';
import { ITEMS } from '../src/sim/data';

const SPECS: RogueProbeSpec[] = ['assassination', 'combat', 'subtlety'];

function measuredDps(): Record<RogueProbeSpec, number> {
  return Object.fromEntries(
    SPECS.map((spec) => [
      spec,
      averageRogueDps(
        spec,
        ROGUE_BAND_FIXTURE.seeds,
        ROGUE_BAND_FIXTURE.seconds,
        ROGUE_BAND_FIXTURE.targetArmor,
        ROGUE_BAND_FIXTURE.build,
      ).dps,
    ]),
  ) as Record<RogueProbeSpec, number>;
}

describe('Rogue fight-6498 deterministic DPS bands', () => {
  it('records the accepted La Luna, BiS epic, heroic Nythraxis fixture', () => {
    expect(ROGUE_BAND_FIXTURE).toEqual({
      seconds: 60,
      seeds: [4242, 777, 1313],
      targetArmor: 798,
      build: {
        row14: 'rog_r14_ceaseless_cuts',
        row20: 'rog_r20_second_shadow',
      },
      rows: {
        5: 'rog_r5_killers_pace',
        8: 'rog_r8_borrowed_breath',
        11: 'rog_r11_marked_prey',
        14: 'rog_r14_ceaseless_cuts',
        17: 'rog_r17_flurry_of_knives',
        20: 'rog_r20_second_shadow',
      },
    });

    // Assert the gear properties on what a probe run ACTUALLY equipped, not on
    // a picker function the probe could silently stop calling: re-coupling the
    // probe to the parse loadouts (legendaries included) fails here cheaply.
    for (const spec of SPECS) {
      const probe = runRogueDpsProbe(
        spec,
        ROGUE_BAND_FIXTURE.seeds[0],
        1,
        ROGUE_BAND_FIXTURE.targetArmor,
        ROGUE_BAND_FIXTURE.build,
      );
      const gear = Object.values(probe.equipment);
      expect(gear.length, `${spec} equips a complete representative loadout`).toBeGreaterThan(0);
      expect(
        gear.every((itemId) => ITEMS[itemId]?.quality === 'epic'),
        `${spec} probe loadout excludes legendary gear`,
      ).toBe(true);
    }
  });

  it('holds Combat at the 200-DPS top band and keeps the sibling ordering', () => {
    const first = measuredDps();
    const repeat = measuredDps();
    expect(repeat).toEqual(first);

    // Accepted three-seed measurements are approximately 203 Combat, 182
    // Assassination, and 153 Subtlety. They preserve both release rulings: the
    // poison-coating rework lowers this same-level fixture from the old
    // hit-rebalance anchor, while v0.42.0 class balance buffs Knifework /
    // assassination and nerfs Skulduggery / subtlety's sustained output. Combat
    // remains untuned. The two rogue-specific class-balance moves cross the
    // sibling order, so the merged tree pins combat > assassination > subtlety.
    expect(first.combat).toBeGreaterThanOrEqual(195);
    expect(first.combat).toBeLessThanOrEqual(211);
    expect(first.assassination).toBeGreaterThanOrEqual(174);
    expect(first.assassination).toBeLessThanOrEqual(190);
    expect(first.subtlety).toBeGreaterThanOrEqual(145);
    expect(first.subtlety).toBeLessThanOrEqual(161);
    expect(first.combat).toBeGreaterThan(first.assassination);
    expect(first.assassination).toBeGreaterThan(first.subtlety);
  }, 30_000);
});
