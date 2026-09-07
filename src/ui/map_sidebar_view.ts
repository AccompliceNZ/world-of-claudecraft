// Pure view model for the World Map atlas rail. The rail reads the same quest
// log insertion order as map_window_view so its numbers stay identical to the
// gold objective badges painted on the map. DOM and localization stay in the
// controller; this core only returns content identities, counts, and routes.

import { NPCS, QUESTS, type ZoneDef } from '../sim/data';
import { questObjectiveAreas } from '../sim/quest_targets';
import { type QuestProgress, questObjectiveRequired } from '../sim/types';
import type { IWorld } from '../world_api';
import { ownEntry } from './known_item';
import { questNumbersByLog } from './map_quest_list_view';

export type MapAtlasFilterId = 'quests' | 'gather' | 'dungeons' | 'services' | 'players';

export interface MapAtlasFilters {
  quests: boolean;
  gather: boolean;
  dungeons: boolean;
  services: boolean;
  players: boolean;
}

/** Every layer on. The board draws Services off in its sample state, but the
 *  shipped map paints every marker family, so the opening state keeps them all
 *  and the chips are the player's own switch. */
export const DEFAULT_MAP_ATLAS_FILTERS: Readonly<MapAtlasFilters> = Object.freeze({
  quests: true,
  gather: true,
  dungeons: true,
  services: true,
  players: true,
});

export interface MapAtlasQuestRow {
  questId: string;
  number: number;
  ready: boolean;
  selected: boolean;
  objectiveIndex: number | null;
  current: number;
  required: number;
}

export interface MapAtlasNearbyQuest {
  questId: string;
  zoneId: string;
  distance: number;
  minLevel: number | null;
}

export interface MapAtlasRoute {
  questId: string;
  x: number;
  z: number;
}

export interface MapSidebarView {
  zoneId: string;
  levelRange: readonly [number, number];
  landmarkCount: number;
  filters: Readonly<MapAtlasFilters>;
  quests: MapAtlasQuestRow[];
  nearby: MapAtlasNearbyQuest[];
  selectedQuestId: string | null;
  route: MapAtlasRoute | null;
}

export interface MapSidebarViewInput {
  world: Pick<IWorld, 'player' | 'questLog' | 'questState'>;
  zone: ZoneDef;
  filters: Readonly<MapAtlasFilters>;
  selectedQuestId: string | null;
}

export function toggleMapAtlasFilter(
  filters: Readonly<MapAtlasFilters>,
  id: MapAtlasFilterId,
): MapAtlasFilters {
  return { ...filters, [id]: !filters[id] };
}

/** Yards per step of the offers list's rendered distance. A live distance moves
 *  every tick while the player walks, which is what made the rail rebuild its
 *  whole subtree four times a second; a bucketed one holds still until the
 *  reading really changes. */
export const MAP_ATLAS_DISTANCE_BUCKET = 10;

export function bucketMapAtlasDistance(distance: number): number {
  return Math.round(distance / MAP_ATLAS_DISTANCE_BUCKET) * MAP_ATLAS_DISTANCE_BUCKET;
}

/**
 * Everything the rail's markup is derived from, as one comparable string: the
 * whole view with the offers' distances bucketed, plus the chrome state the
 * view itself does not carry. Serialized wholesale rather than field by field
 * so a view field added later cannot silently fall out of the comparison and
 * leave the rail stale, and the i18n revision rides along because the markup
 * this gates resolves every label through t().
 */
export function mapSidebarSignature(
  view: MapSidebarView,
  chrome: { shownRouteQuestId: string | null; i18nRevision: number },
): string {
  return JSON.stringify({
    view: {
      ...view,
      nearby: view.nearby.map((quest) => ({
        ...quest,
        distance: bucketMapAtlasDistance(quest.distance),
      })),
    },
    chrome,
  });
}

function primaryObjective(progress: QuestProgress): {
  objectiveIndex: number | null;
  current: number;
  required: number;
} {
  const quest = ownEntry(QUESTS, progress.questId);
  if (!quest || quest.objectives.length === 0) {
    return { objectiveIndex: null, current: 0, required: 0 };
  }
  let objectiveIndex = quest.objectives.length - 1;
  for (let index = 0; index < quest.objectives.length; index++) {
    const required = questObjectiveRequired(quest, progress, index);
    if ((progress.counts[index] ?? 0) < required) {
      objectiveIndex = index;
      break;
    }
  }
  return {
    objectiveIndex,
    current: progress.counts[objectiveIndex] ?? 0,
    required: questObjectiveRequired(quest, progress, objectiveIndex),
  };
}

function routeForQuest(
  questId: string | null,
  questLog: ReadonlyMap<string, QuestProgress>,
): MapAtlasRoute | null {
  if (questId === null) return null;
  const progress = questLog.get(questId);
  const quest = ownEntry(QUESTS, questId);
  if (!progress || !quest) return null;
  if (progress.state !== 'ready') {
    const area = questObjectiveAreas(new Map([[questId, progress]])).find((candidate) =>
      candidate.objectives.some((objective) => objective.questId === questId),
    );
    if (area) return { questId, x: area.center.x, z: area.center.z };
  }
  const npc = NPCS[progress.state === 'ready' ? quest.turnInNpcId : quest.giverNpcId];
  return npc ? { questId, x: npc.pos.x, z: npc.pos.z } : null;
}

function nearbyQuests(input: MapSidebarViewInput): MapAtlasNearbyQuest[] {
  const { world, zone } = input;
  const zoneMinX = zone.xMin ?? Number.NEGATIVE_INFINITY;
  const zoneMaxX = zone.xMax ?? Number.POSITIVE_INFINITY;
  const seen = new Set<string>();
  const nearby: MapAtlasNearbyQuest[] = [];
  for (const npc of Object.values(NPCS)) {
    if (
      npc.pos.x < zoneMinX ||
      npc.pos.x >= zoneMaxX ||
      npc.pos.z < zone.zMin ||
      npc.pos.z >= zone.zMax
    )
      continue;
    for (const questId of npc.questIds) {
      if (seen.has(questId) || world.questState(questId) !== 'available') continue;
      const quest = ownEntry(QUESTS, questId);
      if (!quest) continue;
      seen.add(questId);
      nearby.push({
        questId,
        zoneId: zone.id,
        distance: Math.hypot(npc.pos.x - world.player.pos.x, npc.pos.z - world.player.pos.z),
        minLevel: quest.minLevel ?? null,
      });
    }
  }
  nearby.sort((a, b) => a.distance - b.distance || a.questId.localeCompare(b.questId));
  return nearby.slice(0, 4);
}

export function buildMapSidebarView(input: MapSidebarViewInput): MapSidebarView {
  const quests: MapAtlasQuestRow[] = [];
  let selectedQuestId = input.selectedQuestId;
  // The SAME numbering the map paints on its gold objective badges, so a rail
  // row and its badge can never drift apart.
  const numbers = questNumbersByLog(input.world.questLog);
  for (const progress of input.world.questLog.values()) {
    const objective = primaryObjective(progress);
    quests.push({
      questId: progress.questId,
      number: numbers.get(progress.questId) ?? 0,
      ready: progress.state === 'ready',
      selected: progress.questId === selectedQuestId,
      ...objective,
    });
  }
  if (selectedQuestId !== null && !input.world.questLog.has(selectedQuestId)) {
    selectedQuestId = null;
  }
  if (selectedQuestId !== input.selectedQuestId) {
    for (const quest of quests) quest.selected = false;
  }
  return {
    zoneId: input.zone.id,
    levelRange: input.zone.levelRange,
    landmarkCount: input.zone.pois.filter((poi) => poi.hideOnMap !== true).length,
    filters: input.filters,
    quests,
    nearby: nearbyQuests(input),
    selectedQuestId,
    route: routeForQuest(selectedQuestId, input.world.questLog),
  };
}
