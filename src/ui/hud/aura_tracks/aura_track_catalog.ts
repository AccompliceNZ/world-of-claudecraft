// Which track each of the player's own beneficial auras belongs to, derived ONCE
// from the merged ability table rather than hand-listed.
//
// WHY A DERIVED CATALOG AND NOT A LIST. A hand-written list of sixty-odd spell
// ids is a second source of truth that goes stale the day someone adds a heal:
// the new spell silently appears in no track and nobody notices, because nothing
// fails. Deriving from ABILITIES means a new HoT joins its track for free, and
// the pins in tests/aura_track_catalog.test.ts assert the DERIVATION rather than
// a copy of its output, so a rule change has to be argued rather than absorbed.
//
// It is built at module load and read as a Map on the frame path, so the
// per-frame cost is a lookup, never a scan of the ability table.
//
// THE DURATION CEILING is what keeps the long buffs out. Everything a track
// shows is 60 seconds or less; the next longest helpful buff in the game is 600
// (Briarguard, Thunder Ward), then 1800 (the raid buffs, aspects, poisons,
// imbues) and 3600 (forms and stances). The cutoff therefore sits in a 10x gap
// and nothing is borderline. Toggles are the deliberate exception: they carry
// 3600 purely so nothing can expire them, and they are admitted by the toggle
// rule below rather than by duration.

import { ABILITIES } from '../../../sim/data';
import type { AbilityDef } from '../../../sim/types';

/** What kind of thing an aura is, which decides its track and its row shape. */
export type AuraTrackCategory = 'hot' | 'guard' | 'absorb' | 'utility' | 'power';

/** How a row reads. A timer drains with the clock; points drain with damage
 *  (an absorb's stored value IS its remaining shield); a mode has no countdown
 *  at all because the sim's long duration is anti-expiry, not a timer. */
export type AuraTrackRowShape = 'timer' | 'points' | 'mode';

export interface AuraTrackEntry {
  /** The ability id, which is also the aura id the sim applies. */
  id: string;
  category: AuraTrackCategory;
  shape: AuraTrackRowShape;
  /** The ability's cooldown in seconds, 0 for none. Separates the emergency
   *  buttons from the rotational mitigation (see DEFENSIVE_COOLDOWN_SEC). */
  cooldown: number;
}

/** Nothing longer than this is a maintained effect; see the header. */
export const AURA_TRACK_DURATION_CEILING_SEC = 60;

/** At or above this cooldown a protective self-buff is an EMERGENCY button
 *  rather than part of a rotation, which is the line between the Defensives
 *  track and the Self track. The data leaves a clean gap around it: the
 *  shortest defensive cooldown is 60s and the longest rotational one is 45s. */
export const DEFENSIVE_COOLDOWN_SEC = 60;

// Aura kinds that read as protection rather than healing or output. buff_armor
// and buff_dodge only qualify at a short duration, which the ceiling handles:
// the 1800s Aspects and armor buffs never reach this table.
const GUARD_KINDS: ReadonlySet<string> = new Set([
  'buff_dr',
  'buff_dr_phys',
  'shield_wall',
  'buff_armor',
  'buff_dodge',
  'buff_block',
  // Total immunity (Cold Coffin, the mage's Ice Block). Its own kind because it
  // is not a reduction at all, and it is the single loudest thing a mage can
  // have running, so a family that showed Barkskin and not this one would be
  // read as broken.
  'stasis',
  // Two more bespoke mitigation kinds the content models on their own rather
  // than as a percentage: the warrior's parry window and the paladin bulwark.
  'die_by_sword',
  'guardian_ward',
]);

// Output buffs. Deliberately NOT protection: a haste window is spent, not
// survived, and mixing the two made Icy Veins homeless in an earlier draft.
const POWER_KINDS: ReadonlySet<string> = new Set([
  'buff_ap',
  'buff_ap_pct',
  'buff_haste',
  'buff_spellhaste',
  'buff_spellpower',
  'buff_spelldmg',
  'buff_spellcrit',
  'buff_crit',
  'buff_healing_done',
  'buff_aura_mastery',
  // The bespoke output windows: the content gives several of these their own
  // kind rather than a stat bonus, and a set that held only the stat kinds
  // would quietly drop half the cooldowns a player actually presses.
  'buff_dmg_done',
  'buff_heal_done',
  'buff_avatar',
  'buff_reckless',
  'combustion',
  'sweeping_strikes',
  'overload',
  'power_echo',
  'aoe_echo',
  'heal_echo',
  'form_lich',
  'hunter_cold_focus',
  'hunter_bloodtrail',
]);

// Movement and concealment. `ice_floes` is here rather than in POWER because
// what it grants is freedom to MOVE while casting, which is the question this
// track answers, not a damage increase.
const UTILITY_KINDS: ReadonlySet<string> = new Set([
  'buff_speed',
  'stealth',
  'form_travel',
  'ice_floes',
]);

// DELIBERATELY IN NO SET, so the omission is a decision rather than an oversight:
// the NEXT-CAST family (`cast_shield`, `next_cast_free`, `next_cast_instant`,
// `next_attack_crit`, `overpower_charge`). Each changes the next thing you press
// rather than your current state, so a bar counting one down says nothing about
// what is happening to you. Enemy debuff kinds (`mortal_wound`, `melting_acid`,
// `resource_sap`, `paladin_debt_of_light`) are out for the plainer reason that
// this family is the helpful side; the enemy side is src/ui/hud/target_dots/.

// Effect shapes that leave an absorb, across the several spellings the content
// uses (a plain `absorb` effect, a `shield`, the percentage-of-max variants, and
// the group version).
const ABSORB_TYPES: ReadonlySet<string> = new Set([
  'absorb',
  'shield',
  'selfAbsorbPctMax',
  'aoeAllyAbsorb',
]);

/**
 * Abilities that carry a helpful aura this family must NOT show, for a reason
 * the duration and kind rules cannot see. Kept explicit and short: a silent
 * exclusion is how a tracker loses a spell nobody notices is missing.
 */
const EXCLUDED_IDS: ReadonlySet<string> = new Set([
  // Permanent until death or replacement (`permanent: true`), so there is no
  // timer to draw and no refresh to schedule.
  'devotion_ward',
  // An attack that happens to grant dodge on a 20 second rotation. Tracking it
  // would put a damage button in a protection track.
  'ghostly_strike',
  // A damage spell that grants 3 seconds of speed as a side effect. Utility is
  // the things you PRESS to move; a rotational nudge is not one of them.
  'scorch',
]);

/**
 * Abilities whose helpful aura the shape rules cannot see, because the content
 * models them with a bespoke effect type rather than a kind. Each names why.
 */
const FORCED: ReadonlyMap<string, AuraTrackCategory> = new Map([
  // A 20 second vanish on a 120 second cooldown, modelled as its own effect
  // type. It is a real timer, not a toggle: auras_view lists it in TIMED_IDS
  // for exactly the same reason.
  ['greater_invisibility', 'utility'],
]);

function firstAuraEffect(def: AbilityDef): Record<string, unknown> | null {
  const ranked = (def as { ranks?: Array<{ effects?: unknown[] }> }).ranks ?? [];
  const all = [...((def.effects ?? []) as unknown[]), ...ranked.flatMap((r) => r.effects ?? [])];
  for (const raw of all) {
    const eff = raw as Record<string, unknown>;
    const type = String(eff.type ?? '');
    const kind = String(eff.kind ?? '');
    const duration = Number(eff.duration ?? 0);
    if (type === 'hot') return eff;
    if (ABSORB_TYPES.has(type)) return eff;
    if (!duration) continue;
    if (GUARD_KINDS.has(kind) || POWER_KINDS.has(kind) || UTILITY_KINDS.has(kind)) return eff;
  }
  return null;
}

function categoryOf(eff: Record<string, unknown>): AuraTrackCategory | null {
  const type = String(eff.type ?? '');
  const kind = String(eff.kind ?? '');
  if (type === 'hot') return 'hot';
  if (ABSORB_TYPES.has(type)) return 'absorb';
  if (GUARD_KINDS.has(kind)) return 'guard';
  if (UTILITY_KINDS.has(kind)) return 'utility';
  if (POWER_KINDS.has(kind)) return 'power';
  return null;
}

/** A toggle carries a long finite duration purely so nothing can expire it, so
 *  it is admitted past the ceiling and drawn as a mode. Mirrors the classifier
 *  the aura strips already use (auras_view isToggleAura). */
function isModeDuration(duration: number, kind: string): boolean {
  return duration > AURA_TRACK_DURATION_CEILING_SEC && UTILITY_KINDS.has(kind);
}

function buildCatalog(): ReadonlyMap<string, AuraTrackEntry> {
  const out = new Map<string, AuraTrackEntry>();
  for (const [id, def] of Object.entries(ABILITIES as Record<string, AbilityDef>)) {
    if (EXCLUDED_IDS.has(id)) continue;
    const forced = FORCED.get(id);
    if (forced) {
      out.set(id, {
        id,
        category: forced,
        shape: 'timer',
        cooldown: Number((def as { cooldown?: number }).cooldown ?? 0),
      });
      continue;
    }
    const eff = firstAuraEffect(def);
    if (!eff) continue;
    const category = categoryOf(eff);
    if (!category) continue;

    const duration = Number(eff.duration ?? 0);
    const kind = String(eff.kind ?? '');
    const mode = isModeDuration(duration, kind);
    if (!mode && (duration <= 0 || duration > AURA_TRACK_DURATION_CEILING_SEC)) continue;

    out.set(id, {
      id,
      category,
      shape: mode ? 'mode' : category === 'absorb' ? 'points' : 'timer',
      cooldown: Number((def as { cooldown?: number }).cooldown ?? 0),
    });
  }
  return out;
}

/** Every trackable aura, keyed by its id. Built once at module load. */
export const AURA_TRACK_CATALOG: ReadonlyMap<string, AuraTrackEntry> = buildCatalog();

/** The catalog entry for an aura id, or undefined when nothing tracks it. */
export function auraTrackEntry(auraId: string): AuraTrackEntry | undefined {
  return AURA_TRACK_CATALOG.get(auraId);
}
