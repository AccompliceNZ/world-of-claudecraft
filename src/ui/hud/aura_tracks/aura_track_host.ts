// Composition for the six aura tracks: one view plus one painter per descriptor,
// wired to the host's shared classifiers and localization.
//
// It lives here rather than in hud.ts for the reason the ratchet exists: the
// coordinator's job is to DRIVE the family, not to know how one is assembled. It
// needs the two host facts a pure core must not resolve for itself (who owns an
// aura, what its artwork is) plus a writer facet, and it returns a plain array
// the Hud ticks in a loop. A seventh track is a row in the descriptor table and
// nothing here.
//
// NOT a pure core and deliberately not registered as one: it constructs the
// painter, which is exactly the import the UI_PURE_CORES guard forbids.

import type { PainterHostWriters } from '../../painter_host';
import { AURA_TRACKS, type AuraTrackDescriptor } from './aura_track_descriptors';
import { AuraTrackPainter } from './aura_track_painter';
import {
  type AuraTrackAuraInput,
  type AuraTrackEntityInput,
  type AuraTrackInput,
  type AuraTrackViewCore,
  createAuraTrackView,
} from './aura_track_view';

/** What the host supplies that a track cannot know: the two shared classifiers,
 *  the naming and artwork resolvers, the writer facet and the containers. */
export interface AuraTrackHostDeps<TEntity extends AuraTrackEntityInput> {
  /** Did the LOCAL player cast this aura? The same predicate the aura strips use. */
  isOwn(aura: AuraTrackAuraInput): boolean;
  /** Is this a toggle rather than a timed effect? Also shared with the strips. */
  isMode(aura: AuraTrackAuraInput): boolean;
  auraName(aura: AuraTrackAuraInput): string;
  unitName(entity: TEntity): string;
  iconKey(aura: AuraTrackAuraInput): string;
  iconBackground(iconKey: string): string;
  writers: PainterHostWriters;
  /** Resolve a track's container, called ONCE per track at construction. */
  container(elementId: string): HTMLElement;
  /** "<spell> on <unit>", or just the spell when the row is on the player. */
  rowLabel(auraName: string, unitName: string): string;
  frameLabel(track: AuraTrackDescriptor): string;
  overflowLabel(count: number): string;
  secondsSuffix(): string;
  modeLabel(): string;
}

/** One composed track: its descriptor, its selection core and its painter. */
export interface ComposedAuraTrack<TEntity extends AuraTrackEntityInput> {
  descriptor: AuraTrackDescriptor;
  view: AuraTrackViewCore<TEntity>;
  painter: AuraTrackPainter;
}

/**
 * All six tracks as one thing the coordinator drives with two calls.
 *
 * The reused input container lives here rather than on the Hud for the same
 * reason the composition does: it is an implementation detail of how the family
 * ticks, and the coordinator's business is only WHEN. It is rewritten each frame
 * and never reallocated, which is the allocation-light contract every painter on
 * the per-frame band holds.
 */
export class AuraTrackFamily<TEntity extends AuraTrackEntityInput> {
  readonly tracks: ComposedAuraTrack<TEntity>[];
  private readonly input: AuraTrackInput<TEntity> = {
    player: null,
    allies: [],
    enabled: true,
    includeModes: true,
  };
  /**
   * The allies of THIS tick, collected once into a reused array.
   *
   * THIS IS NOT AN OPTIMIZATION, it is the fix for a real defect. The Hud hands
   * in `sim.entities.values()`, which is an ITERATOR, and an iterator is spent
   * after one pass. Handing the same one to six tracks in a loop meant the first
   * track drained it and the other five saw an empty world: every ally row in
   * the game was invisible, and only the tracks that read the player at all
   * showed anything. Nothing failed, which is why it survived until a screenshot
   * of a priest healing a dummy came back with two auras on the target and not
   * one row anywhere.
   *
   * Collecting once also keeps the per-frame cost honest: the array is reused,
   * so a steady frame allocates nothing, and the six tracks walk a real array
   * rather than re-running the world's iterator six times.
   */
  private readonly allyScratch: TEntity[] = [];

  constructor(deps: AuraTrackHostDeps<TEntity>) {
    this.tracks = composeAuraTracks(deps);
  }

  /**
   * Paint every track for this frame. Each is driven UNCONDITIONALLY and its
   * core answers with an empty state when `enabled` says no, so whether a frame
   * exists is decided in ONE place rather than six gates on the hot path.
   */
  tick(
    player: TEntity | null,
    allies: Iterable<TEntity>,
    enabled: (settingKey: string) => boolean,
    includeModes: boolean,
  ): void {
    this.input.player = player;
    this.allyScratch.length = 0;
    for (const ally of allies) this.allyScratch.push(ally);
    this.input.allies = this.allyScratch;
    this.input.includeModes = includeModes;
    for (const track of this.tracks) {
      this.input.enabled = enabled(track.descriptor.settingKey);
      track.painter.update(track.view.tick(this.input));
    }
  }

  /** Every track caches its accessible name, seconds suffix, mode chip and row
   *  labels, which is exactly the debt a language switch collects. */
  relocalize(): void {
    for (const track of this.tracks) track.painter.relocalize();
  }
}

/** Build all six, in descriptor order. */
function composeAuraTracks<TEntity extends AuraTrackEntityInput>(
  deps: AuraTrackHostDeps<TEntity>,
): ComposedAuraTrack<TEntity>[] {
  return AURA_TRACKS.map((descriptor) => ({
    descriptor,
    view: createAuraTrackView<TEntity>(descriptor, {
      isOwn: deps.isOwn,
      isMode: deps.isMode,
      auraName: deps.auraName,
      unitName: (entity) => deps.unitName(entity as TEntity),
      iconKey: deps.iconKey,
    }),
    painter: new AuraTrackPainter({
      root: () => deps.container(descriptor.elementId),
      writers: deps.writers,
      iconBackground: deps.iconBackground,
      rowLabel: deps.rowLabel,
      frameLabel: () => deps.frameLabel(descriptor),
      overflowLabel: deps.overflowLabel,
      secondsSuffix: deps.secondsSuffix,
      modeLabel: deps.modeLabel,
    }),
  }));
}
