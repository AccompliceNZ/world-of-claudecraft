// The stamina baseline model guard (src/sim/item_budget.ts, "The stamina baseline
// model"): every item-level-eligible item in the merged catalog carries at least
// its free stamina baseline, and every item with a derivable tier sits exactly on
// its offense-and-resource line, unless it is on the drift allowlist below. The
// allowlist may only shrink. Measurements and the decision record:
// docs/design/gear-stamina-baseline-2026-09-10.md.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import {
  checkStaminaModel,
  expectedLineBudget,
  expectedStatBudget,
  expectedStatTotal,
  isItemLevelEligible,
  normalizeToStaminaModel,
  primaryStatSum,
  STAMINA_BASELINE_SHARE,
  staminaBaseline,
  statIdentity,
} from '../src/sim/item_level';
import type { ItemDef } from '../src/sim/types';

// Items whose primary total was off their budget BEFORE the stamina model landed
// (the 2026-09-10 inventory: the honor-tier wardrobe 1 to 3 under, the level-18
// crafted set 1 to 3 over, leveling drift of a point or two, and a few outliers
// such as Kingsbane's Last Oath 21 under its legendary budget). They still meet
// the stamina FLOOR like everything else; only the exact-line check is deferred.
// An entry that conforms fails "only names items still off budget" so it gets
// removed; nothing may be added without a design note.
const STAT_DRIFT_ALLOWLIST: ReadonlySet<string> = new Set([
  'apprentice_staff',
  'arcanite_war_axe',
  'ashen_focus_ring',
  'ashstalker_cowl',
  'ashstalker_grips',
  'ashstalker_harness',
  'ashstalker_legguards',
  'ashstalker_shoulderguards',
  'ashstalker_treads',
  'ashstalker_waistband',
  'boneglass_shiv',
  'broodmother_silk_robe',
  'burnished_thorium_amulet',
  'cinder_sigil_pendant',
  'cinderweave_cord',
  'cinderweave_cowl',
  'cinderweave_handwraps',
  'cinderweave_legwraps',
  'cinderweave_mantle',
  'cinderweave_raiment',
  'cinderweave_slippers',
  'crag_warden_cudgel',
  'cragmaw_huntcord',
  'cragmaw_prowlboots',
  'cryptbone_greaves',
  'cryptbone_helm',
  'cryptbone_pauldrons',
  'deacons_cleaver',
  'deathlord_sabatons',
  'drogmar_warboots',
  'drowned_prayer_leggings',
  'drowned_prayer_sandals',
  'drowned_tide_scepter',
  'drownedguard_breastplate',
  'drownedmoon_scepter',
  'drownstep_sabatons',
  'duskfang_dirk',
  'duskhide_wraps',
  'duskwhisper',
  'eastbrook_druids_hide',
  'eastbrook_ritual_vestments',
  'eastbrook_warded_leggings',
  'eelscale_leggings',
  'eelscale_treads',
  'elderwood_battle_staff',
  'emberglass_warstaff',
  'emberwing_legguards',
  'fen_reaver_glaive',
  'fenmist_robe',
  'final_argument_greatblade',
  'final_oath_medallion',
  'first_blood_razor',
  'fleetblood_band',
  'furyforged_gauntlets',
  'furyforged_girdle',
  'furyforged_legguards',
  'furyforged_sabatons',
  'furyforged_warhelm',
  'furyforged_warplate',
  'furyforged_warspaulders',
  'goldweave_leggings',
  'greyjaw_hide_boots',
  'heroic_deathless_heartwood',
  'heroic_kingsbane_last_oath',
  'hollow_vigil_staff',
  'iron_vow_band',
  'ironvein_lantern_staff',
  'ironvein_pickblade',
  'kingsbane_last_oath',
  'knight_commanders_greaves',
  'last_step_signet',
  'maldrecs_soulbinder',
  'mantle_of_the_unbroken_shore',
  'marrowlord_boneboots',
  'marrowtread_boots',
  'milepost_boots',
  'militia_vest',
  'mirejaw_biteblade',
  'mirejaw_oracle_staff',
  'mirejaw_scale_vest',
  'mirewarden_jerkin',
  'mirewarden_leggings',
  'mirewarden_treads',
  'mistbinder_kris',
  'mistcallers_edge',
  'mistveil_cord',
  'mistveil_grips',
  'moggers_copper_cudgel',
  'moggers_shiv',
  'moggers_stomper_boots',
  'moonshroud_breastplate',
  'moonshroud_robe',
  'moonshroud_tunic',
  'mossy_handwraps',
  'mother_of_pearl',
  'necromancers_legwraps',
  'nhalias_dirgeblade',
  'nhalias_funeral_wraps',
  'ogre_bonecharm_staff',
  'oiled_boots',
  'palecoil_rod',
  'quilted_trousers',
  'razorwind_torque',
  'ridgestalker_treads',
  'riptide_dirk',
  'sableweb_slippers',
  'saltforged_grips',
  'selthes_seastriders',
  'silkbinders_raiment',
  'skullsmasher_warbelt',
  'sloomtooth_tidefang',
  'sootscale_mantle',
  'spellbreakers_seal',
  'staff_of_drowned_prayers',
  'stormbound_crown',
  'stormbound_greaves',
  'stormbound_handguards',
  'stormbound_hauberk',
  'stormbound_legmail',
  'stormbound_spaulders',
  'stormbound_waistguard',
  'stormshard_leggings',
  'sunweave_mantle',
  'sunweave_treads',
  'thorium_warblade',
  'thoriumscale_cuirass',
  'thoriumscale_greathelm',
  'thoriumscale_leggings',
  'thornhide_boots',
  'thornhide_cinch',
  'thornhide_gloves',
  'thornhide_headdress',
  'thornhide_leggings',
  'thornhide_mantle',
  'thornhide_vestment',
  'tideglass_dirk',
  'tidereaver_gaff',
  'tidescale_vest',
  'tidewatchers_wraps',
  'trail_leggings',
  'tunnelkings_spade',
  'unbroken_circle',
  'veilsteel_blade',
  'wardens_oathband',
  'wardweave_cowl',
  'weighted_thorium_band',
  'whetted_iron_dirk',
  'woven_robe',
  'ysols_pearl_greaves',
]);

// Items with no derivable source (vendor, starter and quest oddities) have no
// tier to price against; their floor is taken from their own authored line, the
// caster line divided by three, the physical line divided by two (a physical line
// is two thirds of a budget whose baseline is a third: 1.5 * L / 3 = L / 2).
function proxyBaseline(item: ItemDef): number {
  const s = item.stats ?? {};
  return statIdentity(s) === 'caster'
    ? Math.round(((s.int ?? 0) + (s.spi ?? 0)) / 3)
    : Math.round(((s.str ?? 0) + (s.agi ?? 0)) / 2);
}

const eligible = (Object.values(ITEMS) as ItemDef[]).filter(isItemLevelEligible);
const tiered = eligible.filter((item) => expectedLineBudget(item) !== undefined);
const untiered = eligible.filter((item) => expectedLineBudget(item) === undefined);

function describeFailure(item: ItemDef, detail: string): string {
  return `${item.id} (${item.slot}, ${item.quality}): ${detail} ${JSON.stringify(item.stats ?? {})}`;
}

describe('stamina baseline model: primitives', () => {
  it('takes a third of the budget, rounded, and nothing from a zero budget', () => {
    expect(STAMINA_BASELINE_SHARE).toBeCloseTo(1 / 3, 6);
    expect(staminaBaseline(0)).toBe(0);
    expect(staminaBaseline(1)).toBe(0);
    expect(staminaBaseline(2)).toBe(1);
    expect(staminaBaseline(3)).toBe(1);
    expect(staminaBaseline(4)).toBe(1);
    expect(staminaBaseline(5)).toBe(2);
    expect(staminaBaseline(25)).toBe(8);
    expect(staminaBaseline(33)).toBe(11);
  });

  it('prices Intellect or Spirit bearers on the caster line and everything else physical', () => {
    expect(statIdentity({ int: 17, spi: 8 })).toBe('caster');
    expect(statIdentity({ int: 17, sta: 8 })).toBe('caster');
    expect(statIdentity({ str: 17, sta: 8 })).toBe('physical');
    expect(statIdentity({ sta: 5 })).toBe('physical');
    // The all-stat hybrid prices physical-style: its stamina was inside its budget.
    expect(statIdentity({ str: 8, agi: 8, int: 8, sta: 18 })).toBe('physical');
    expect(statIdentity(undefined)).toBe('physical');
  });

  it('expects a caster total of budget plus baseline and a physical total of the budget', () => {
    expect(expectedStatTotal(25, 'caster')).toBe(33);
    expect(expectedStatTotal(25, 'physical')).toBe(25);
  });

  it('reads the four archetypes against a 25-point chest', () => {
    // Physical DPS: stamina inside the budget, on the line, at the floor.
    const dps = checkStaminaModel({ str: 17, sta: 8 }, 25);
    expect(dps).toMatchObject({
      identity: 'physical',
      baseline: 8,
      extra: 0,
      line: 17,
      expectedLine: 17,
      meetsFloor: true,
      onLine: true,
    });
    // Tank: seven stamina above the floor bought from the line one for one.
    const tank = checkStaminaModel({ str: 10, sta: 15 }, 25);
    expect(tank).toMatchObject({
      extra: 7,
      line: 10,
      expectedLine: 10,
      meetsFloor: true,
      onLine: true,
    });
    // Caster raid piece as authored: on its line, under the floor.
    const raid = checkStaminaModel({ int: 17, spi: 8 }, 25);
    expect(raid).toMatchObject({
      identity: 'caster',
      line: 25,
      expectedLine: 25,
      meetsFloor: false,
      onLine: true,
      expectedTotal: 33,
    });
    // The same piece with its baseline placed: on the model.
    const fixed = checkStaminaModel({ int: 17, spi: 8, sta: 8 }, 25);
    expect(fixed).toMatchObject({ meetsFloor: true, onLine: true, total: 33 });
    // A stamina-free physical neck: over its line and under the floor.
    const neck = checkStaminaModel({ str: 8, agi: 7 }, 15);
    expect(neck).toMatchObject({
      baseline: 5,
      line: 15,
      expectedLine: 10,
      meetsFloor: false,
      onLine: false,
    });
  });

  it('normalizes generated profiles onto the model', () => {
    // Caster profile: line on the budget, baseline on top, armor untouched.
    expect(normalizeToStaminaModel({ int: 2, spi: 1, armor: 90 }, 25)).toEqual({
      armor: 90,
      int: 17,
      spi: 8,
      sta: 8,
    });
    // Physical DPS profile keeps its authored split (stamina inside the budget).
    expect(normalizeToStaminaModel({ str: 2, sta: 1 }, 25)).toEqual({ str: 17, sta: 8 });
    // Tank profile keeps its extra stamina and pays for it from the line.
    const tank = normalizeToStaminaModel({ str: 10, sta: 15 }, 25);
    expect(tank.sta).toBe(15);
    expect((tank.str ?? 0) + (tank.sta ?? 0)).toBe(25);
    // A stamina-free physical profile is lifted to the floor and fitted to the line.
    expect(normalizeToStaminaModel({ str: 1, agi: 1 }, 15)).toEqual({ str: 5, agi: 5, sta: 5 });
    // Zero budget: armor only.
    expect(normalizeToStaminaModel({ str: 3, armor: 40 }, 0)).toEqual({ armor: 40 });
  });
});

describe('stamina baseline model: the merged catalog', () => {
  it('covers the whole combat-gear catalog', () => {
    expect(eligible.length).toBeGreaterThanOrEqual(800);
    expect(tiered.length).toBeGreaterThanOrEqual(700);
  });

  it('every eligible item meets its stamina floor', () => {
    const failures: string[] = [];
    for (const item of tiered) {
      const check = checkStaminaModel(item.stats, expectedLineBudget(item) as number);
      if (!check.meetsFloor)
        failures.push(
          describeFailure(
            item,
            `sta ${check.sta} < baseline ${check.baseline} on line ${check.budget}`,
          ),
        );
    }
    for (const item of untiered) {
      const baseline = proxyBaseline(item);
      const sta = item.stats?.sta ?? 0;
      if (sta < baseline)
        failures.push(
          describeFailure(item, `sta ${sta} < proxy baseline ${baseline} (no derived tier)`),
        );
    }
    expect(
      failures,
      `${failures.length} items under their stamina floor:\n${failures.slice(0, 40).join('\n')}`,
    ).toEqual([]);
  });

  it('every tiered item off the drift allowlist sits exactly on its line and total', () => {
    const failures: string[] = [];
    for (const item of tiered) {
      if (STAT_DRIFT_ALLOWLIST.has(item.id)) continue;
      const check = checkStaminaModel(item.stats, expectedLineBudget(item) as number);
      if (!check.onLine)
        failures.push(
          describeFailure(
            item,
            `${check.identity} line ${check.line} != ${check.expectedLine} (budget ${check.budget}, extra sta ${check.extra})`,
          ),
        );
      else if (primaryStatSum(item) !== expectedStatBudget(item))
        failures.push(
          describeFailure(item, `total ${primaryStatSum(item)} != ${expectedStatBudget(item)}`),
        );
    }
    expect(
      failures,
      `${failures.length} items off their line:\n${failures.slice(0, 40).join('\n')}`,
    ).toEqual([]);
  });

  it('the drift allowlist only names real items that are still off their line', () => {
    const stale: string[] = [];
    for (const id of STAT_DRIFT_ALLOWLIST) {
      const item = ITEMS[id];
      if (!item) {
        stale.push(`${id}: not in the catalog`);
        continue;
      }
      const line = expectedLineBudget(item);
      if (line === undefined) {
        stale.push(`${id}: no derived tier, does not need an allowlist entry`);
        continue;
      }
      const check = checkStaminaModel(item.stats, line);
      if (check.onLine && primaryStatSum(item) === expectedStatBudget(item))
        stale.push(`${id}: now on its line, remove it`);
    }
    expect(stale).toEqual([]);
  });

  it('generated heroic variants and crucible collection pieces are on the model', () => {
    const failures: string[] = [];
    for (const item of tiered) {
      if (!item.id.startsWith('heroic_') && !item.id.startsWith('crucible_')) continue;
      if (STAT_DRIFT_ALLOWLIST.has(item.id)) continue;
      const check = checkStaminaModel(item.stats, expectedLineBudget(item) as number);
      if (!check.meetsFloor || !check.onLine)
        failures.push(
          describeFailure(
            item,
            `floor ${check.meetsFloor} line ${check.line}/${check.expectedLine}`,
          ),
        );
    }
    expect(failures).toEqual([]);
  });
});
