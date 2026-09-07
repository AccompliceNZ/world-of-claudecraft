import { corpseLootAvailability, localPartyMemberIds } from './corpse_loot_availability';
import { handleEscortPress } from './escort_interact';
import {
  type GatherEffectConfirmGate,
  type GatherNodeToolGate,
  handleGatherNodeInteract,
} from './gather_node_interact';
import type { InteractionOutcome } from './interaction_autorun';
import {
  type NearbyGatherNode,
  type NearbyInteractionScanWorld,
  resolveNearbyInteractionCandidate,
} from './nearby_interaction_core';

export interface NearbyInteractionWorld extends NearbyInteractionScanWorld {
  targetEntity(id: number | null): void;
  interact(): void;
  lootCorpse(id: number): InteractionOutcome;
  // Fire-and-forget half of the unified corpse press; omitting the
  // components argument selects the caller's town-focus default server-side.
  harvestCorpse(id: number): void;
  delveInteract(id: number): InteractionOutcome;
  enterDungeon(dungeonId: string): InteractionOutcome;
  leaveDungeon(): InteractionOutcome;
  pickUpObject(id: number): InteractionOutcome;
  nodeHarvestableByMe(nodeId: string): boolean;
  harvestNode(nodeId: string, confirmEffectUse?: boolean): InteractionOutcome;
}

export interface NearbyInteractionHud {
  openMailbox(): void;
  openQuestDialog(npcId: number): void;
  openDelveBoard(npcId: number): void;
  showError(text: string): void;
  requestSpiritHealerResurrect(): void;
}

/** Find and dispatch one eligible nearby interaction in stable priority order.
 *  `nodeToolGateFor` (Professions 2.0) resolves the tool-tier access
 *  gate + localized denial line for the node about to be harvested; it sits
 *  with the node list (not trailing) so the live call site (main.ts
 *  interactKey) still closes on the nothing-to-interact string, as pinned by
 *  tests/client_shell.test.ts. `escortAwayText` sits before that same string
 *  for the same reason. */
export function tryNearbyInteraction(
  world: NearbyInteractionWorld,
  hud: NearbyInteractionHud,
  gatherNodes: readonly NearbyGatherNode[],
  nodeToolGateFor: ((node: NearbyGatherNode) => GatherNodeToolGate) | null,
  tooFarText: string,
  notReadyText: string,
  escortAwayText: string,
  nothingToInteractText: string,
  harvestStateReliable = true,
  // The R40 per-use effect confirm gate, threaded to the node dispatch.
  effectConfirm?: GatherEffectConfirmGate,
  // The npc the caller means, when it has one in mind. The scan is otherwise
  // nearest-wins, which is right for a keypress aimed by walking up to someone and
  // wrong for a pad, where the player SELECTS an npc and then presses talk: without
  // this, pressing talk answered whoever happened to be standing closer. Only ever
  // promotes an npc the scan would already have accepted, so no rule is bypassed.
  preferNpcId?: number | null,
): InteractionOutcome {
  const candidate = resolveNearbyInteractionCandidate(
    world,
    gatherNodes,
    harvestStateReliable,
    preferNpcId,
  );
  if (candidate?.kind === 'corpse') {
    const corpse = candidate.entity;
    const playerId = world.playerId ?? world.player.id;
    const partyIds = localPartyMemberIds(world.partyInfo);
    // Unified press: harvest first, then loot, as two separate
    // commands (processed in receipt order in the same server tick batch).
    // Each half is gated on the availability predicate so a claimed or
    // emptied half is never dispatched (no denial-toast spam); the server
    // still revalidates both authoritatively.
    const availability = corpseLootAvailability(corpse, playerId, harvestStateReliable, partyIds);
    if (availability.harvestable) world.harvestCorpse(candidate.id);
    if (availability.hasLoot) return world.lootCorpse(candidate.id);
    return availability.harvestable;
  }
  if (candidate?.kind === 'delve') {
    return world.delveInteract(candidate.id);
  }
  if (candidate?.kind === 'object') {
    const object = candidate.entity;
    if (object.templateId === 'dungeon_door' && object.dungeonId) {
      return world.enterDungeon(object.dungeonId);
    } else if (object.templateId === 'dungeon_exit') {
      return world.leaveDungeon();
    } else if (object.templateId === 'mailbox') {
      hud.openMailbox();
      return true;
    } else {
      return world.pickUpObject(candidate.id);
    }
  }
  if (candidate?.kind === 'npc') {
    const npc = candidate.entity;
    if (npc.templateId === 'spirit_healer') {
      // The scan only picks a spirit healer for a ghost; route the revive
      // through the HUD's confirm gate rather than sending the command
      // directly (it applies The Keeper's Toll).
      hud.requestSpiritHealerResurrect();
    } else if (npc.templateId === 'brother_halven' || npc.templateId === 'brother_halven_marsh') {
      hud.openDelveBoard(candidate.id);
    } else {
      hud.openQuestDialog(candidate.id);
    }
    return true;
  }
  // STARTING an escort sits below the npc arm (an escortee is mob-kind, so the
  // two can never compete) and above gather nodes: an escortee standing in
  // front of you beats the node you happen to be over. Corpses still win, so
  // looting the ambush wave is never swallowed.
  if (candidate?.kind === 'escort') {
    return handleEscortPress(world, hud, { kind: 'start', entityId: candidate.id }, escortAwayText);
  }
  if (candidate?.kind === 'gather') {
    return handleGatherNodeInteract(
      world,
      hud,
      world.player.pos,
      candidate.node.id,
      candidate.node.pos,
      tooFarText,
      notReadyText,
      nodeToolGateFor?.(candidate.node),
      effectConfirm,
    );
  }
  // The away line is a LAST resort that only replaces the generic
  // nothing-to-interact message: an absent escortee must never eat a press that
  // some other arm above could have used (a node underfoot at an empty post).
  if (candidate?.kind === 'escortAway') {
    return handleEscortPress(world, hud, { kind: 'away' }, escortAwayText);
  }
  hud.showError(nothingToInteractText);
  return false;
}
