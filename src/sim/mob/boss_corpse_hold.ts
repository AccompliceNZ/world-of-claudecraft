// Boss corpse hold: a slain boss keeps its lootable corpse standing for
// BOSS_CORPSE_HOLD_SECONDS instead of the CORPSE_DURATION window trash gets.
//
// Why: corpseTimer is the LOOT WINDOW, not only a decay clock. Once it reaches
// zero the corpse reads as decayed (respawn_policy.ts corpseHasDecayed):
// lootCorpse refuses it, expireDecayedCorpseInteractions (mob/locomotion.ts)
// clears lootable, server/game.ts flags it `cd` on the wire, and
// entity_view_policy_core.ts drops its view on every client. An INSTANCE mob
// never respawns in place (the respawn gate in mob/locomotion.ts skips it), so
// before the decay signal existed its corpse stayed lootable for as long as
// the instance stood; with it, a rift or dungeon boss went unlootable AND
// invisible 60s after the kill while its loot was still sitting on the entity
// (a first-clear ring personal to one member, a rolled epic nobody had taken
// yet). A raid-sized party finishing adds, resolving need/greed rolls, or
// resurrecting the member who died to the boss routinely takes longer than
// that, and that member then found no body to loot.
//
// The hold is scoped to camp-placed `boss` templates so trash, ordinary elites,
// and rares keep the classic 60s decay:
// - an instance boss (rift floors, dungeons, raids, delves: spawnPos beyond
//   DUNGEON_X_THRESHOLD) takes the full hold. The instance reapers still bound
//   it from outside: an empty instance frees on its own timeout, and freeing
//   drops the corpse with the rest of the floor;
// - an open-world boss that respawns IN PLACE (Warlord Drogmar's three-minute
//   quest cadence) is bounded by its own respawn delay. The respawn gate defers
//   an in-place respawn while the corpse is still lootable, so an unbounded
//   hold would let one unlooted kill block a required quest kill for half an
//   hour. Its loot window becomes the whole respawn wait (never shorter than
//   before) and the respawn lands on schedule;
// - an authored fixed schedule (`respawnSeconds`, the practice dummies) caps
//   the hold exactly as it caps the default decay in handleDeath: that mob
//   returns on schedule whether or not it was looted, hold or no hold.
// Deliberately NOT held:
// - a world boss: its corpse window is WORLD_BOSS_CORPSE_SECONDS, owned by the
//   world-boss scheduler, and that corpse also BLOCKS the next scheduled spawn
//   (updateWorldBosses only spawns into an empty slot), so lengthening it would
//   silently skip an hourly spawn after any kill in the back half of the hour;
// - a per-player summon (`runScoped` / `summonedAdd`, the Bound Guardian rite):
//   every summon mints a fresh entity and the corpse decay is its only teardown,
//   so a long hold would pile half-hour bodies at the altar. The summoner is
//   standing right there; the classic window is the right one.
// The loot-side clamps stay in charge of an EMPTIED corpse: pruneCorpseLoot
// collapses a boss corpse with nothing left exactly as before, so the hold
// never keeps an empty body standing. No shipped boss carries harvest
// componentTags, so the harvest-half grace clamp (interaction.ts harvestCorpse)
// never meets a held boss.
//
// `src/sim`-pure and rng-free: no DOM/Three/render/ui/game/net imports, no
// Math.random/Date.now, no draw sites.

import { DUNGEON_X_THRESHOLD } from '../data';
import type { Entity, MobTemplate } from '../types';

/** How long a slain boss's lootable corpse stands (seconds). */
export const BOSS_CORPSE_HOLD_SECONDS = 30 * 60;

type HoldTemplate = Pick<MobTemplate, 'boss' | 'worldBoss' | 'respawnSeconds'>;
type HoldMob = Pick<Entity, 'spawnPos' | 'respawnTimer' | 'summonedAdd' | 'runScoped'>;

/** A `boss` template the hold applies to: world bosses keep their
 * scheduler-owned window (see the header). */
export function isHeldBossTemplate(template: HoldTemplate | undefined): boolean {
  return template?.boss === true && template.worldBoss !== true;
}

/**
 * Seconds a fresh boss corpse must stay lootable: 0 when no hold applies (a
 * non-boss, a world boss, a per-player summon), the full hold for an instance
 * boss, and min(hold, respawn delay) for an in-place open-world respawner; an
 * authored `respawnSeconds` caps every arm. `mob.respawnTimer` is the delay
 * handleDeath just assigned (Infinity for a run-scoped mob).
 */
export function bossCorpseHoldSeconds(template: HoldTemplate | undefined, mob: HoldMob): number {
  if (!template || !isHeldBossTemplate(template)) return 0;
  if (mob.summonedAdd || mob.runScoped) return 0;
  const respawnsInPlace =
    mob.spawnPos.x <= DUNGEON_X_THRESHOLD && Number.isFinite(mob.respawnTimer);
  const hold = respawnsInPlace
    ? Math.min(BOSS_CORPSE_HOLD_SECONDS, mob.respawnTimer)
    : BOSS_CORPSE_HOLD_SECONDS;
  return template.respawnSeconds === undefined ? hold : Math.min(hold, template.respawnSeconds);
}

/**
 * Raise a slain boss's corpseTimer to its hold. Never lowers it: a longer
 * window already granted (a pending loot roll's extension) stands. Call after
 * handleDeath has assigned the corpse and respawn timers.
 */
export function applyBossCorpseHold(e: Entity, template: HoldTemplate | undefined): void {
  const hold = bossCorpseHoldSeconds(template, e);
  if (hold > e.corpseTimer) e.corpseTimer = hold;
}
