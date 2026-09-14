// The missing-view candidate scan (view_candidate_scan_core.ts): the walk
// itself, and when it runs. The fairness pin is the roster one: an entity
// that joins the world gets its candidate on the very next frame.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { makeQuestObjectGate } from '../src/render/quest_object_gate_core';
import type { ViewCandidate } from '../src/render/view_candidate_pool_core';
import {
  collectDoomedViewsInto,
  collectMissingViewCandidatesInto,
  createViewCandidateScanState,
  VIEW_CANDIDATE_RESCAN_FRAMES,
  VIEW_CANDIDATE_RESCAN_MOVE_YD,
  viewCandidateScanDue,
} from '../src/render/view_candidate_scan_core';
import { MOBS } from '../src/sim/data';
import { createMob, createPlayer } from '../src/sim/entity';
import type { Entity, QuestProgress } from '../src/sim/types';
import { codeWithoutLineComments } from './helpers/code_without_line_comments';

const mob = (id: number, x: number, z = 0): Entity =>
  createMob(id, MOBS.ridge_stalker, 3, { x, y: 0, z });

function scan(
  entities: Entity[],
  center: Entity,
  views: Set<number>,
  rangeSq: number,
  includeRequired = false,
): ViewCandidate[] {
  const active: ViewCandidate[] = [];
  collectMissingViewCandidatesInto(active, [], {
    entities: new Map(entities.map((e) => [e.id, e])),
    views,
    questLog: new Map<string, QuestProgress>(),
    questObjectHidden: makeQuestObjectGate({}),
    center,
    rangeSq,
    includeRequired,
  });
  return active;
}

describe('collectMissingViewCandidatesInto', () => {
  it('lists the view-less entities in range, ranked by priority then distance then id', () => {
    const player = createPlayer(1, 'warrior', { x: 0, y: 0, z: 0 }, 'Probe');
    const near = mob(10, 5);
    const far = mob(11, 50);
    const beyond = mob(12, 500);
    const viewed = mob(13, 3);
    const out = scan([player, near, far, beyond, viewed], player, new Set([13]), 100 * 100);
    expect(out.map((c) => c.id)).toEqual([10, 11]);
    expect(out[0].d2).toBe(25);
    // The player is required work the runtime frame does ahead of the list.
    expect(out.some((c) => c.id === 1)).toBe(false);
    const withRequired = scan([player, near], player, new Set(), 100 * 100, true);
    expect(withRequired.map((c) => c.id)).toEqual([1, 10]);
  });

  it('keeps a decayed corpse out of the list', () => {
    const player = createPlayer(1, 'warrior', { x: 0, y: 0, z: 0 }, 'Probe');
    const corpse = mob(10, 5);
    corpse.dead = true;
    corpse.corpseTimer = 0;
    expect(scan([player, corpse], player, new Set(), 100 * 100)).toEqual([]);
  });
});

describe('viewCandidateScanDue', () => {
  const due = (
    state = createViewCandidateScanState(),
    roster = 1,
    views = 4,
    center = 1,
    target: number | null = null,
    range = 6400,
    x = 0,
    z = 0,
  ) =>
    viewCandidateScanDue(
      state,
      roster,
      views,
      { id: center, targetId: target, pos: { x, z } },
      range,
    );

  it('scans on the first frame, then rests until the cadence elapses', () => {
    const state = createViewCandidateScanState();
    expect(due(state)).toBe(true);
    for (let frame = 1; frame < VIEW_CANDIDATE_RESCAN_FRAMES; frame++) {
      expect(due(state), `frame ${frame}`).toBe(false);
    }
    expect(due(state)).toBe(true);
    expect(due(state)).toBe(false);
  });

  it('scans on the very next frame after the roster changed (a new entity is never held)', () => {
    const state = createViewCandidateScanState();
    expect(due(state, 1)).toBe(true);
    expect(due(state, 1)).toBe(false);
    expect(due(state, 2)).toBe(true);
    expect(due(state, 2)).toBe(false);
  });

  it('scans again when a view was created or evicted, the target or center changed, or the range moved', () => {
    const state = createViewCandidateScanState();
    expect(due(state, 1, 4)).toBe(true);
    expect(due(state, 1, 5)).toBe(true);
    expect(due(state, 1, 5)).toBe(false);
    expect(due(state, 1, 5, 1, 77)).toBe(true);
    expect(due(state, 1, 5, 1, 77)).toBe(false);
    expect(due(state, 1, 5, 2, 77)).toBe(true);
    expect(due(state, 1, 5, 2, 77)).toBe(false);
    expect(due(state, 1, 5, 2, 77, 1000)).toBe(true);
    expect(due(state, 1, 5, 2, 77, 1000)).toBe(false);
  });

  it('a forced scan walks at once and records its keys like any other scan', () => {
    const state = createViewCandidateScanState();
    expect(due(state, 1, 4)).toBe(true);
    expect(
      viewCandidateScanDue(state, 2, 9, { id: 1, targetId: null, pos: { x: 0, z: 0 } }, 6400, true),
    ).toBe(true);
    // The forced frame's keys are the recorded ones: the same inputs rest.
    expect(due(state, 2, 9)).toBe(false);
  });

  it('scans at once when the center jumped (a teleport), not for a running step', () => {
    const state = createViewCandidateScanState();
    expect(due(state)).toBe(true);
    expect(due(state, 1, 4, 1, null, 6400, 0.4, 0)).toBe(false);
    expect(due(state, 1, 4, 1, null, 6400, VIEW_CANDIDATE_RESCAN_MOVE_YD + 1, 0)).toBe(true);
    expect(due(state, 1, 4, 1, null, 6400, VIEW_CANDIDATE_RESCAN_MOVE_YD + 1, 0)).toBe(false);
  });

  it('is fed the roster version and forced by the boot prewarm in the renderer', () => {
    const renderer = codeWithoutLineComments(
      readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
    );
    const method = renderer.slice(renderer.indexOf('private collectMissingViewCandidates('));
    const body = method.slice(0, method.indexOf('\n  }\n'));
    expect(body).toContain('this.sim.entityRosterVersion,');
    expect(body).toContain('this.views.size,');
    expect(body).toContain('if (!scanDue) return;');
    expect(renderer).toContain(
      'this.collectMissingViewCandidates(p, VIEW_PREWARM_RANGE_SQ, false, true);',
    );
  });

  it('never walks the roster on a rested frame', () => {
    const state = createViewCandidateScanState();
    const entities = new Map<number, Entity>();
    const values = vi.spyOn(entities, 'values');
    const player = createPlayer(1, 'warrior', { x: 0, y: 0, z: 0 }, 'Probe');
    const frame = () => {
      if (!viewCandidateScanDue(state, 1, 0, { id: 1, targetId: null, pos: { x: 0, z: 0 } }, 6400))
        return;
      collectMissingViewCandidatesInto([], [], {
        entities,
        views: new Set(),
        questLog: new Map(),
        questObjectHidden: makeQuestObjectGate({}),
        center: player,
        rangeSq: 6400,
        includeRequired: false,
      });
    };
    for (let i = 0; i < VIEW_CANDIDATE_RESCAN_FRAMES * 3; i++) frame();
    expect(values).toHaveBeenCalledTimes(3);
  });
});

describe('collectDoomedViewsInto', () => {
  it('names the views whose entity left, decayed, or moved past the destroy range', () => {
    const player = createPlayer(1, 'warrior', { x: 0, y: 0, z: 0 }, 'Probe');
    const near = mob(10, 5);
    const far = mob(12, 300);
    const corpse = mob(13, 5);
    corpse.dead = true;
    corpse.corpseTimer = 0;
    const entities = new Map([player, near, far, corpse].map((e) => [e.id, e]));
    const doomed = [99];
    // 11 has a view but no entity any more.
    collectDoomedViewsInto(doomed, [1, 10, 11, 12, 13], {
      entities,
      questLog: new Map(),
      questObjectHidden: makeQuestObjectGate({}),
      center: player,
      destroyRangeSq: 96 * 96,
    });
    expect(doomed).toEqual([11, 12, 13]);
  });
});
