import { describe, expect, it } from 'vitest';
import { CORPSE_DURATION } from '../src/sim/combat/damage';
import { DUNGEON_X_THRESHOLD, MOBS, riftInstanceOrigin } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  applyBossCorpseHold,
  BOSS_CORPSE_HOLD_SECONDS,
  bossCorpseHoldSeconds,
  isMajorBossTemplate,
} from '../src/sim/mob/boss_corpse_hold';
import { corpseHasDecayed } from '../src/sim/respawn_policy';
import type { PlayerMeta } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';
import { WORLD_BOSS_CORPSE_SECONDS } from '../src/sim/world_boss';
import { EMPTY_TEST_WORLD } from './sim_shared';

// Major-boss corpse hold (mob/boss_corpse_hold.ts): a slain boss keeps its
// lootable corpse for BOSS_CORPSE_HOLD_SECONDS instead of the CORPSE_DURATION
// window trash gets. The bug this pins: an instance boss never respawns in
// place, so its corpse used to be lootable for as long as the instance stood,
// but once corpseTimer hit zero the decay signal (corpseHasDecayed) made it
// unlootable and invisible after 60s while a member's personal first-clear
// ring was still sitting on the entity.

type SimInternals = {
  entities: Map<number, Entity>;
  players: Map<number, PlayerMeta>;
  addEntity(e: Entity): void;
};

const RIFT_POS = { ...riftInstanceOrigin(0, 0), y: 0 };
const WORLD_POS = { x: 0, y: 0, z: 0 };
const RING_ID = 'riftbound_band_of_might';

function setup(seed = 11) {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true, world: EMPTY_TEST_WORLD });
  const internals = sim as unknown as SimInternals;
  const pid = sim.addPlayer('warrior', 'Walla');
  sim.tick();
  return { sim, internals, pid };
}

function placePlayer(
  internals: SimInternals,
  pid: number,
  pos: { x: number; y: number; z: number },
) {
  const e = internals.entities.get(pid)!;
  e.pos = { ...pos };
  e.prevPos = { ...pos };
}

function spawnAndKill(
  sim: Sim,
  internals: SimInternals,
  killerId: number,
  templateId: string,
  pos: { x: number; y: number; z: number },
): Entity {
  const template = MOBS[templateId];
  const mob = createMob(9000 + internals.entities.size, template, template.maxLevel, { ...pos });
  internals.addEntity(mob);
  const killer = internals.entities.get(killerId)!;
  sim.dealDamage(killer, mob, 999_999, false, 'physical', null, 'hit');
  expect(mob.dead).toBe(true);
  return mob;
}

function tickSeconds(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / DT) + 1; i++) sim.tick();
}

describe('bossCorpseHoldSeconds (pure leaf)', () => {
  const instancePos = { x: DUNGEON_X_THRESHOLD + 1 };
  const worldPos = { x: 0 };

  it('is thirty minutes and identifies boss / worldBoss templates only', () => {
    expect(BOSS_CORPSE_HOLD_SECONDS).toBe(30 * 60);
    expect(isMajorBossTemplate({ boss: true })).toBe(true);
    expect(isMajorBossTemplate({ worldBoss: true })).toBe(true);
    expect(isMajorBossTemplate({ elite: true, rare: true } as never)).toBe(false);
    expect(isMajorBossTemplate({})).toBe(false);
    expect(isMajorBossTemplate(undefined)).toBe(false);
  });

  it('grants nothing to a non-boss, wherever it died', () => {
    expect(bossCorpseHoldSeconds({}, instancePos, 25)).toBe(0);
    expect(bossCorpseHoldSeconds({ elite: true } as never, worldPos, 3600)).toBe(0);
    expect(bossCorpseHoldSeconds(undefined, worldPos, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('gives an instance boss the full hold regardless of its (never used) respawn delay', () => {
    expect(bossCorpseHoldSeconds({ boss: true }, instancePos, 25)).toBe(BOSS_CORPSE_HOLD_SECONDS);
  });

  it('gives a world boss the full hold (its respawn is the scheduler, never in place)', () => {
    expect(bossCorpseHoldSeconds({ worldBoss: true }, worldPos, Number.POSITIVE_INFINITY)).toBe(
      BOSS_CORPSE_HOLD_SECONDS,
    );
  });

  it('bounds an in-place open-world respawner by its own respawn delay', () => {
    expect(bossCorpseHoldSeconds({ boss: true }, worldPos, 180)).toBe(180);
    expect(bossCorpseHoldSeconds({ boss: true }, worldPos, 3600)).toBe(BOSS_CORPSE_HOLD_SECONDS);
  });

  it('applyBossCorpseHold only ever raises corpseTimer', () => {
    const template = MOBS.rift_boss_frost;
    const boss = createMob(1, template, template.maxLevel, { ...RIFT_POS });
    boss.corpseTimer = CORPSE_DURATION;
    boss.respawnTimer = 25;
    applyBossCorpseHold(boss, template);
    expect(boss.corpseTimer).toBe(BOSS_CORPSE_HOLD_SECONDS);
    // A longer window already granted (a pending loot roll, say) stands.
    boss.corpseTimer = BOSS_CORPSE_HOLD_SECONDS + 100;
    applyBossCorpseHold(boss, template);
    expect(boss.corpseTimer).toBe(BOSS_CORPSE_HOLD_SECONDS + 100);
    const trash = createMob(2, MOBS.rift_frost_revenant, 20, { ...RIFT_POS });
    trash.corpseTimer = CORPSE_DURATION;
    applyBossCorpseHold(trash, MOBS.rift_frost_revenant);
    expect(trash.corpseTimer).toBe(CORPSE_DURATION);
  });

  it('the world-boss corpse window IS the major-boss hold', () => {
    expect(WORLD_BOSS_CORPSE_SECONDS).toBe(BOSS_CORPSE_HOLD_SECONDS);
  });
});

describe('boss corpse hold through handleDeath', () => {
  it('a slain rift boss holds its corpse for the full hold, not the trash window', () => {
    const { sim, internals, pid } = setup();
    placePlayer(internals, pid, RIFT_POS);
    const boss = spawnAndKill(sim, internals, pid, 'rift_boss_frost', RIFT_POS);
    expect(MOBS.rift_boss_frost.boss).toBe(true);
    expect(boss.spawnPos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(boss.corpseTimer).toBe(BOSS_CORPSE_HOLD_SECONDS);
    expect(boss.corpseTimer).not.toBe(CORPSE_DURATION);
  });

  it('rift trash on the same floor keeps the classic 60s decay', () => {
    const { sim, internals, pid } = setup();
    placePlayer(internals, pid, RIFT_POS);
    const trash = spawnAndKill(sim, internals, pid, 'rift_frost_revenant', RIFT_POS);
    expect(MOBS.rift_frost_revenant.boss).toBeUndefined();
    expect(trash.corpseTimer).toBe(CORPSE_DURATION);
    tickSeconds(sim, CORPSE_DURATION);
    expect(corpseHasDecayed(trash.dead, trash.corpseTimer)).toBe(true);
  });

  it('a personal first-clear ring is still lootable well past the old 60s decay', () => {
    const { sim, internals, pid } = setup();
    placePlayer(internals, pid, RIFT_POS);
    const boss = spawnAndKill(sim, internals, pid, 'rift_boss_frost', RIFT_POS);
    // The Walla-two shape: one ring, personal to one member, left on the corpse
    // while the party finishes up. addRiftProgressionLoot pushes exactly this.
    boss.loot = { copper: 0, items: [{ itemId: RING_ID, count: 1, personalFor: [pid] }] };
    boss.lootable = true;

    tickSeconds(sim, CORPSE_DURATION * 3);

    expect(boss.dead).toBe(true);
    expect(corpseHasDecayed(boss.dead, boss.corpseTimer)).toBe(false);
    expect(boss.lootable).toBe(true);
    expect(sim.lootCorpse(boss.id, pid)).toBe(true);
    const meta = internals.players.get(pid)!;
    expect(meta.inventory.some((slot) => slot.itemId === RING_ID)).toBe(true);
  });

  it('the hold ends: after BOSS_CORPSE_HOLD_SECONDS the boss corpse decays like any other', () => {
    const { sim, internals, pid } = setup();
    placePlayer(internals, pid, RIFT_POS);
    const boss = spawnAndKill(sim, internals, pid, 'rift_boss_frost', RIFT_POS);
    boss.loot = { copper: 0, items: [{ itemId: RING_ID, count: 1, personalFor: [pid] }] };
    boss.lootable = true;
    // Jump to the last second of the hold rather than ticking half an hour.
    boss.corpseTimer = 1;
    tickSeconds(sim, 1);
    expect(corpseHasDecayed(boss.dead, boss.corpseTimer)).toBe(true);
    expect(boss.lootable).toBe(false);
    expect(sim.lootCorpse(boss.id, pid)).toBe(false);
  });

  it('an open-world quest boss keeps its cadence: the corpse lasts exactly the respawn wait', () => {
    const { sim, internals, pid } = setup();
    placePlayer(internals, pid, WORLD_POS);
    const drogmar = spawnAndKill(sim, internals, pid, 'warlord_drogmar', WORLD_POS);
    expect(MOBS.warlord_drogmar.boss).toBe(true);
    expect(drogmar.spawnPos.x).toBeLessThanOrEqual(DUNGEON_X_THRESHOLD);
    // Longer than the trash window, bounded by his own three-minute return.
    expect(drogmar.respawnTimer).toBe(180);
    expect(drogmar.corpseTimer).toBe(drogmar.respawnTimer);
    expect(drogmar.corpseTimer).toBeGreaterThan(CORPSE_DURATION);
    expect(drogmar.corpseTimer).toBeLessThan(BOSS_CORPSE_HOLD_SECONDS);
    // Unlooted loot must not push the respawn past its schedule.
    drogmar.loot = { copper: 650, items: [] };
    drogmar.lootable = true;
    tickSeconds(sim, 180);
    expect(drogmar.dead).toBe(false);
  });
});
