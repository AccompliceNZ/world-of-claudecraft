// The missing-view candidate scan: which world entities near the player have
// no renderer view yet, ranked for creation. The walk itself is the largest
// leaf in the renderer's own per-frame code on a weak CPU (every entity of the
// world, every frame, for a list that changes only when something joins,
// leaves, or crosses the draw range), so this module also owns WHEN the walk
// runs: at once when the roster or the view set changed (a new entity gets its
// candidate on the very next frame, never later: the graphics-fairness rule),
// when the player or their target changed, when the range moved, and otherwise
// on a short cadence that covers entities walking across the draw-range edge.
// Between scans the renderer keeps consuming the last ranked list.
//
// Node-only (RENDER_PURE_CORES): no three.js, no DOM, no randomness.

import type { Entity, QuestProgress } from '../sim/types';
import {
  entityViewCandidatePriority,
  entityViewDistanceSq,
  entityViewIsAdmitted,
  entityViewShouldDrop,
  isDistanceCullExemptObject,
} from './entity_view_policy_core';
import type { QuestObjectGate } from './quest_object_gate_core';
import {
  finishViewCandidates,
  type ViewCandidate,
  writeViewCandidate,
} from './view_candidate_pool_core';

/** Frames between two scans when nothing else asked for one: the only case a
 *  scan then serves is an entity crossing the draw-range edge, which is far
 *  outside anything a player reacts to, so a few frames of pop-in latency at
 *  the edge is invisible while the walk itself is not. */
export const VIEW_CANDIDATE_RESCAN_FRAMES = 4;

export interface ViewCandidateScanState {
  rosterVersion: number;
  viewCount: number;
  centerId: number;
  targetId: number | null;
  rangeSq: number;
  /** Frames since the last scan; -1 before the first. */
  framesSinceScan: number;
}

export function createViewCandidateScanState(): ViewCandidateScanState {
  return {
    rosterVersion: -1,
    viewCount: -1,
    centerId: -1,
    targetId: null,
    rangeSq: -1,
    framesSinceScan: -1,
  };
}

/** Whether this frame walks the roster; records the frame either way. */
export function viewCandidateScanDue(
  state: ViewCandidateScanState,
  rosterVersion: number,
  viewCount: number,
  centerId: number,
  targetId: number | null,
  rangeSq: number,
  cadenceFrames: number = VIEW_CANDIDATE_RESCAN_FRAMES,
): boolean {
  const due =
    state.framesSinceScan < 0 ||
    state.framesSinceScan + 1 >= cadenceFrames ||
    state.rosterVersion !== rosterVersion ||
    state.viewCount !== viewCount ||
    state.centerId !== centerId ||
    state.targetId !== targetId ||
    state.rangeSq !== rangeSq;
  if (!due) {
    state.framesSinceScan++;
    return false;
  }
  state.rosterVersion = rosterVersion;
  state.viewCount = viewCount;
  state.centerId = centerId;
  state.targetId = targetId;
  state.rangeSq = rangeSq;
  state.framesSinceScan = 0;
  return true;
}

export interface ViewCandidateScanInput {
  entities: ReadonlyMap<number, Entity>;
  /** Entity ids that already have a view. */
  views: { has(id: number): boolean };
  questLog: Map<string, QuestProgress>;
  questObjectHidden: QuestObjectGate;
  center: Entity;
  rangeSq: number;
  /** Whether the player and their target ride the ranked list (the runtime
   *  frame creates those two ahead of it, so it leaves them out). */
  includeRequired: boolean;
}

/** Fills `active` (over the reusable `pool`) with every admitted, view-less
 *  entity inside `rangeSq` of the center, ranked; allocation-free once the
 *  pool has grown to the roster's size. */
export function collectMissingViewCandidatesInto(
  active: ViewCandidate[],
  pool: ViewCandidate[],
  input: ViewCandidateScanInput,
): void {
  const { center, questLog, questObjectHidden, rangeSq, views } = input;
  let count = 0;
  for (const e of input.entities.values()) {
    if (views.has(e.id)) continue;
    if (!entityViewIsAdmitted(e, questLog, questObjectHidden)) continue;
    const required = e.id === center.id || e.id === center.targetId;
    if (required && !input.includeRequired) continue;
    const d2 = entityViewDistanceSq(e, center);
    if (!required && d2 > rangeSq && !isDistanceCullExemptObject(e)) continue;
    writeViewCandidate(pool, active, count, e.id, d2, entityViewCandidatePriority(e, center, d2));
    count++;
  }
  finishViewCandidates(active, count);
}

export interface DoomedViewScanInput {
  entities: ReadonlyMap<number, Entity>;
  questLog: Map<string, QuestProgress>;
  questObjectHidden: QuestObjectGate;
  center: Entity;
  destroyRangeSq: number;
}

/** The drop half of the same policy: every view whose entity left, decayed,
 *  was retired by a quest turn-in or abandon, or moved past the destroy
 *  range, written into the caller's reusable `doomed` list. */
export function collectDoomedViewsInto(
  doomed: number[],
  viewIds: Iterable<number>,
  input: DoomedViewScanInput,
): void {
  doomed.length = 0;
  for (const id of viewIds) {
    const e = input.entities.get(id);
    if (
      entityViewShouldDrop(
        e,
        input.center,
        input.questLog,
        input.questObjectHidden,
        input.destroyRangeSq,
      )
    ) {
      doomed.push(id);
    }
  }
}
