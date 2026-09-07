import { NPCS } from '../sim/data';
import { isQuestGatedGroundObjectHidden } from '../sim/quest_gated_entity';
import { isObjectOpenedByViewer } from '../sim/quests/opened_object_view';
import {
  dist2d,
  type Entity,
  type GatherNodeDef,
  INTERACT_RANGE,
  type QuestProgress,
} from '../sim/types';
import { corpseLootAvailability, localPartyMemberIds } from './corpse_loot_availability';
import { decideEscortPress } from './escort_interact';
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

export type InteractionPromptTargetKind = 'mob' | 'npc' | 'gather' | 'raw';

export type NearbyGatherNode = Pick<GatherNodeDef, 'id' | 'pos' | 'type' | 'tier'>;

export interface NearbyInteractionScanWorld {
  player: Entity;
  playerId?: number;
  partyInfo?: { members: readonly { pid: number }[] } | null;
  entities: ReadonlyMap<number, Entity>;
  questLog: ReadonlyMap<string, QuestProgress>;
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
  | (NearbyInteractionCandidateBase & { kind: 'gather'; id: string; node: NearbyGatherNode })
  | (NearbyInteractionCandidateBase & { kind: 'escortAway'; id: null });

function objectVerb(entity: Entity): InteractionPromptVerb {
  if (entity.templateId === 'mailbox') return 'mail';
  if (entity.templateId === 'dungeon_door' || entity.templateId === 'dungeon_exit') return 'open';
  return 'use';
}

/** Resolve one eligible nearby interaction without dispatching it. */
export function resolveNearbyInteractionCandidate(
  world: NearbyInteractionScanWorld,
  gatherNodes: readonly NearbyGatherNode[],
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
  let bestNode: NearbyGatherNode | null = null;
  let bestNodeDistance = INTERACT_RANGE;

  if (!player.dead) {
    for (const node of gatherNodes) {
      const distance = dist2d(player.pos, { x: node.pos.x, y: player.pos.y, z: node.pos.z });
      if (distance < bestNodeDistance) {
        bestNode = node;
        bestNodeDistance = distance;
      }
    }
  }

  for (const entity of world.entities.values()) {
    const distance = dist2d(player.pos, entity.pos);
    if (
      !player.dead &&
      entity.kind === 'mob' &&
      entity.dead &&
      entity.lootable &&
      corpseLootAvailability(entity, playerId, harvestStateReliable, partyIds).canOpen &&
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
    const availability = corpseLootAvailability(
      bestCorpse,
      playerId,
      harvestStateReliable,
      partyIds,
    );
    return {
      kind: 'corpse',
      id: bestCorpse.id,
      entity: bestCorpse,
      verb: availability.hasLoot ? 'loot' : 'harvest',
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
    const entity = world.entities.get(escort.entityId);
    if (entity) {
      return {
        kind: 'escort',
        id: entity.id,
        entity,
        verb: 'talk',
        targetKind: 'mob',
        targetId: entity.templateId,
        targetName: entity.name,
        holdProgress: null,
      };
    }
  }
  if (bestNode) {
    return {
      kind: 'gather',
      id: bestNode.id,
      node: bestNode,
      verb: 'gather',
      targetKind: 'gather',
      targetId: bestNode.type,
      targetName: '',
      holdProgress: null,
    };
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
