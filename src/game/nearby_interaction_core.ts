import { NPCS } from '../sim/data';
import { isQuestGatedGroundObjectHidden } from '../sim/quest_gated_entity';
import { isObjectOpenedByViewer } from '../sim/quests/opened_object_view';
import { dist2d, type Entity, INTERACT_RANGE, type QuestProgress } from '../sim/types';
import type { FarmPatchDef } from '../world_api/farming';
import { corpseLootAvailability, localPartyMemberIds } from './corpse_loot_availability';
import { decideEscortPress } from './escort_interact';
import { nearestInteractableBed } from './farm_bed_interact';
import { nearestInteractableFeast } from './feast_interact';
import { objectInteractionRange } from './interactions';

export type InteractionPromptVerb =
  | 'talk'
  | 'loot'
  | 'open'
  | 'gather'
  | 'mail'
  | 'bank'
  | 'use'
  | 'harvest';

export type InteractionPromptTargetKind = 'mob' | 'npc' | 'gather' | 'bed' | 'raw';

export interface NearbyInteractionScanWorld {
  player: Entity;
  playerId?: number;
  partyInfo?: { members: readonly { pid: number }[] } | null;
  entities: ReadonlyMap<number, Entity>;
  questLog: ReadonlyMap<string, QuestProgress>;
  farmPatches: readonly FarmPatchDef[];
}

interface NearbyInteractionCandidateBase {
  verb: InteractionPromptVerb | null;
  targetKind: InteractionPromptTargetKind | null;
  targetId: string;
  targetName: string;
  holdProgress: number | null;
}

export type NearbyInteractionCandidate =
  | (NearbyInteractionCandidateBase & { kind: 'corpse'; id: number; entity: Entity })
  | (NearbyInteractionCandidateBase & { kind: 'delve'; id: number; entity: Entity })
  | (NearbyInteractionCandidateBase & { kind: 'object'; id: number; entity: Entity })
  | (NearbyInteractionCandidateBase & { kind: 'npc'; id: number; entity: Entity })
  | (NearbyInteractionCandidateBase & { kind: 'escort'; id: number; entity: Entity })
  | (NearbyInteractionCandidateBase & { kind: 'feast'; id: number; entity: Entity })
  | (NearbyInteractionCandidateBase & { kind: 'bed'; id: string })
  | (NearbyInteractionCandidateBase & { kind: 'escortAway'; id: null });

function objectVerb(entity: Entity): InteractionPromptVerb {
  if (entity.templateId === 'mailbox') return 'mail';
  if (entity.templateId === 'dungeon_door' || entity.templateId === 'dungeon_exit') return 'open';
  return 'use';
}

/** Resolve one eligible nearby interaction without dispatching it.
 *
 *  The ladder IS the press ladder in nearby_interaction.ts, arm for arm, so
 *  the prompt can never name a verb the press would not run: corpse (ordinary
 *  loot only), delve, ground object, npc, escort start, placed feast, garden
 *  bed, then the escort-away last resort. Intentional gathering made the
 *  generic press ORDINARY INTERACTION ONLY, so there is deliberately no
 *  gather or corpse-harvest arm here: those are explicit actions with their
 *  own entry points (node/tool/crop click, the corpse picker, the bed
 *  sheet's own Harvest control). */
export function resolveNearbyInteractionCandidate(
  world: NearbyInteractionScanWorld,
  harvestStateReliable = true,
  preferNpcId?: number | null,
): NearbyInteractionCandidate | null {
  const player = world.player;
  const playerId = world.playerId ?? player.id;
  const partyIds = localPartyMemberIds(world.partyInfo);
  let bestCorpse: Entity | null = null;
  let bestCorpseDistance = INTERACT_RANGE;
  let bestObject: Entity | null = null;
  let bestObjectDistance = INTERACT_RANGE;
  let bestNpc: Entity | null = null;
  let bestNpcDistance = INTERACT_RANGE + 1;
  let bestDelve: Entity | null = null;
  let bestDelveDistance = INTERACT_RANGE + 1;

  for (const entity of world.entities.values()) {
    const distance = dist2d(player.pos, entity.pos);
    // A corpse is a candidate only for the ordinary loot this viewer may take
    // (hasLoot, never canOpen): a harvest-only corpse is no candidate here, so
    // it cannot swallow an eligible interaction standing behind it.
    if (
      !player.dead &&
      entity.kind === 'mob' &&
      entity.dead &&
      entity.lootable &&
      corpseLootAvailability(entity, playerId, harvestStateReliable, partyIds).hasLoot &&
      distance < bestCorpseDistance
    ) {
      bestCorpse = entity;
      bestCorpseDistance = distance;
    }
    if (!player.dead && entity.kind === 'object' && entity.templateId.startsWith('delve_')) {
      if (distance < bestDelveDistance) {
        bestDelve = entity;
        bestDelveDistance = distance;
      }
    } else if (
      !player.dead &&
      entity.kind === 'object' &&
      entity.lootable &&
      !isQuestGatedGroundObjectHidden(entity, world.questLog) &&
      !isObjectOpenedByViewer(entity, world.questLog) &&
      distance <= objectInteractionRange(entity) &&
      distance < bestObjectDistance
    ) {
      bestObject = entity;
      bestObjectDistance = distance;
    }
    const promoted =
      preferNpcId !== undefined &&
      preferNpcId !== null &&
      entity.id === preferNpcId &&
      distance <= INTERACT_RANGE;
    if (entity.kind === 'npc' && (promoted || distance < bestNpcDistance)) {
      const isGhostHealer = entity.templateId === 'spirit_healer' && player.ghost;
      const isLivingNpc = entity.templateId !== 'spirit_healer' && !player.dead;
      if (isGhostHealer || isLivingNpc) {
        bestNpc = entity;
        bestNpcDistance = promoted ? -1 : distance;
      }
    }
  }

  if (bestCorpse) {
    return {
      kind: 'corpse',
      id: bestCorpse.id,
      entity: bestCorpse,
      verb: 'loot',
      targetKind: 'mob',
      targetId: bestCorpse.templateId,
      targetName: bestCorpse.name,
      holdProgress: null,
    };
  }
  if (bestDelve) {
    return {
      kind: 'delve',
      id: bestDelve.id,
      entity: bestDelve,
      verb: 'open',
      targetKind: 'raw',
      targetId: bestDelve.templateId,
      targetName: bestDelve.name,
      holdProgress: null,
    };
  }
  if (bestObject) {
    return {
      kind: 'object',
      id: bestObject.id,
      entity: bestObject,
      verb: objectVerb(bestObject),
      targetKind: 'raw',
      targetId: bestObject.templateId,
      targetName: bestObject.name,
      holdProgress: null,
    };
  }
  if (bestNpc) {
    return {
      kind: 'npc',
      id: bestNpc.id,
      entity: bestNpc,
      verb: NPCS[bestNpc.templateId]?.banker === true ? 'bank' : 'talk',
      targetKind: 'npc',
      targetId: bestNpc.templateId,
      targetName: bestNpc.name,
      holdProgress: null,
    };
  }
  const escort = player.dead
    ? ({ kind: 'none' } as const)
    : decideEscortPress(player.pos, world.entities, world.questLog);
  if (escort.kind === 'start') {
    // TERMINAL, like upstream's own arm: decideEscortPress derives the id from
    // THIS map, so the lookup cannot miss, and a miss must not hand the press
    // down to the feast or bed arms behind it.
    const entity = world.entities.get(escort.entityId);
    return entity
      ? {
          kind: 'escort',
          id: entity.id,
          entity,
          verb: 'talk',
          targetKind: 'mob',
          targetId: entity.templateId,
          targetName: entity.name,
          holdProgress: null,
        }
      : null;
  }
  // A PLACED TRANSIENT outranks permanent world furniture (ruling 11b-R3c-1):
  // a feast despawns on a timer and is what the player just walked to, so it
  // sits above the garden bed that is always there.
  if (!player.dead) {
    const feastId = nearestInteractableFeast(world.entities, player.pos);
    const feast = feastId === null ? undefined : world.entities.get(feastId);
    if (feast) {
      return {
        kind: 'feast',
        id: feast.id,
        entity: feast,
        verb: 'use',
        targetKind: 'raw',
        targetId: feast.templateId,
        targetName: feast.name,
        holdProgress: null,
      };
    }
  }
  // The bed press only OPENS the bed sheet, in either mode, so the affordance
  // is Open: nothing here ever harvests a crop.
  if (!player.dead) {
    const bedId = nearestInteractableBed(world.farmPatches, player.pos);
    if (bedId !== null) {
      return {
        kind: 'bed',
        id: bedId,
        verb: 'open',
        targetKind: 'bed',
        targetId: bedId,
        targetName: '',
        holdProgress: null,
      };
    }
  }
  if (escort.kind === 'away') {
    return {
      kind: 'escortAway',
      id: null,
      verb: null,
      targetKind: null,
      targetId: '',
      targetName: '',
      holdProgress: null,
    };
  }
  return null;
}
