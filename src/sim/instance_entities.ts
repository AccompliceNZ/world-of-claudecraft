// The entities an instance slot owns, for the raid readouts: a raid boss and
// its trash only ever spawn inside a claimed dungeon slot (`InstanceSlot.mobIds`
// is what enterDungeon fills and what every encounter module resolves its
// instance through), so a readout that walks the slots' mob lists instead of
// the whole roster does the same work inside the instance and none of it in
// the open field, where the world has thousands of entities and no raid. A
// free slot holds no mob ids, and a stale id resolves to nothing.
import type { SimContext } from './sim_context';
import type { Entity } from './types';

/** Every live entity in every instance slot, slot by slot, in spawn order. */
export function* instanceEntities(ctx: SimContext): Generator<Entity> {
  for (const inst of ctx.instances) {
    for (const id of inst.mobIds) {
      const entity = ctx.entities.get(id);
      if (entity) yield entity;
    }
  }
}
