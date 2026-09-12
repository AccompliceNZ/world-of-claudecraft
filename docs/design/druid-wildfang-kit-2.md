# Druid Wildfang kit pass 2: engage, control, opener

Companion to `druid-v029-class-design.md` (the Wildfang engine) and the Wolf Form
mobility pass (a separate branch). This pass gives Wolf Form an in-combat engage, an
out-of-stealth opener, and in-combat control. Before it, the only Wolf stun
(Slinkstrike) was gated on stealth and Bruin Rush's 1 sec stun expired before a Bruin
to Wolf shift could land.

## The five changes

1. **Loping Stride is baseline.** Every form shift grants 60% movement speed for 3 sec,
   once per 20 sec, with no talent check. The row 5 slot keeps its option id
   (`dru_r5_ferocity`, so saved allocations still resolve) and becomes **Longstride**
   (mechanic `druid_longstride`): 5 sec on a 12 sec cooldown. The engine reads both
   numbers from the row option's `metrics`, so the talent tooltip and the sim share one
   source. Pinned by `tests/druid_wildfang_kit.test.ts` and
   `tests/talent_tooltip_accuracy.test.ts`.
2. **Pin.** Landing Bruin Rush opens a 3 sec window: Wolf Form costs 0 mana and Pins the
   Rush target (a 50% slow for 4 sec on the target that was Rushed, never the current
   target). The window is an aura on the druid (`bruin_rush_window`, kind `internal_cd`,
   value = the target id), the Colossal Might cap precedent, rather than a new Entity
   field: it rides the ordinary aura wire so the shared cost tail
   (`combat/ability_resolution.ts`) shows the free cost in BOTH worlds' tooltips, it
   expires through the aura tick, a death wipes it, the engaged pass closes it on
   leaving combat, and it adds no field to the parity trace. Slows carry no
   diminishing-returns ladder in this sim (`combat/effect_dispatch.ts` 'slow'), and Pin
   follows the same rule.
3. **Stalk moves at full speed** (stealth value 0.95 to 1.0). Rogue Duskveil keeps 0.5.
4. **Lunge**, the out-of-stealth shape of the Slinkstrike button: 12 yd gap closer,
   40 energy, 12 sec cooldown, 60% weapon damage, 1 combo point, no stun. The
   `actionReplacement` rule shape gained `absentAuraKind`; an absence-only rule is a
   MODE of the button and keeps the replacement's own cooldown key, so a restealth
   Slinkstrike is never locked behind the Lunge it followed. The strike lands at cast
   (the way Bruin Rush's stun does) and the body then runs the charge route. Lunge is
   never learned as a second action and does not bank Old Blood.
5. **Hamstring Bite**, the Wolf control finisher (learn 12, 30 energy, 20 sec cooldown):
   `finisherStun` 0.5 sec plus 0.5 sec per combo point (1 sec at 1 up to 3 sec at 5).
   It sits in the controlled-stun diminishing category with Concuss and Low Blow. The
   sim keeps from-stealth openers (Slinkstrike) on their own ladder, the classic rogue
   rule `stun_dr.ts` documents, so Hamstring Bite cannot share a ladder with both
   Slinkstrike and Concuss; the finisher it is modelled on (Low Blow) decided.

## Placeholders owned by other passes

- **Icons:** `lunge` and `hamstring_bite` ship procedural glyphs. They are parked in
  `ABILITY_ART_PENDING` (`src/ui/icons.ts`, the `ITEM_ART_PENDING` shape), which the
  painted-census guards treat as parked rather than painted; the art pass removes the
  entry when it paints them.
- **VFX:** `src/render/druid_vfx_specs.ts` carries clearly labelled placeholder specs
  for Lunge, Hamstring Bite, and Pin, registered through `ability_vfx_registry.ts`
  (never the generated gallery tables). The VFX retune replaces them.
- **Default bars:** the Wolf default bar is full (12 slots), so Hamstring Bite is
  dragged from the spellbook.

## Balance

Lunge is the only DPS-touching addition, and the Wildfang probe rotation does not press
it, so the single-target probe is unchanged versus `main` (see the PR body for the
measured numbers). Nothing in this pass draws rng.
