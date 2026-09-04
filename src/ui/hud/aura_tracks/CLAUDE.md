# src/ui/hud/aura_tracks/

Six opt-in HUD frames that answer six questions about the beneficial auras the
LOCAL player has out: am I covered, what is my rotation keeping up, what is
boosting me, how am I moving, who am I keeping up, and how much shield is left.
The enemy-side sibling is `src/ui/hud/target_dots/`; the two families share their
classifiers rather than each keeping a list.

| File | What it is |
|---|---|
| `aura_track_catalog.ts` | Which track each aura belongs to, DERIVED from `ABILITIES` at module load. |
| `aura_track_descriptors.ts` | The six tracks as data: element id, storage key, setting key, label, row shape, `accepts()`. |
| `aura_track_view.ts` | The one pure selection core all six share. Registered in `UI_PURE_CORES`. |
| `aura_track_painter.ts` | The one painter all six share. Three row shapes, writes only through `PainterHostWriters`. |
| `index.ts` | The barrel. The Hud imports from here, never from a file. |

## The rules that are load-bearing

- **Membership is derived, never listed.** A hand-written list of spell ids is a
  second source of truth that goes stale the day someone adds a heal: the new
  spell joins no track and nothing fails. `buildCatalog()` reads `ABILITIES`, and
  `tests/aura_track_catalog.test.ts` pins the DERIVATION RULES (the duration
  ceiling, the cooldown line, each kind set) rather than a copy of the output, so
  a rule change has to be argued rather than absorbed. New content needs no edit
  here. A spell the rules cannot see gets a row in `EXCLUDED_IDS` or `FORCED`
  **with the reason written down**.
- **`AURA_TRACK_DURATION_CEILING_SEC = 60` is what keeps the long buffs out.**
  Everything shown is 60s or less; the next longest helpful buff is 600s, then
  1800s and 3600s, so the cutoff sits in a 10x gap and nothing is borderline.
  Toggles are the deliberate exception: they carry 3600s purely as anti-expiry
  and are admitted as MODE rows.
- **`DEFENSIVE_COOLDOWN_SEC = 60` is the Defensives / Self line.** At or above it
  a protective self-buff is an emergency button; below it, rotational. The data
  leaves a clean gap: shortest defensive cooldown 60s, longest rotational 45s.
- **Order is stable, never by remaining time.** A tracker that re-sorts as timers
  tick moves the row you are reaching for, which is the one thing a refresh
  readout must not do. Self rows first, then allies; within a unit, by aura id.
- **Three row shapes, because the data has three.** `timer` drains with the
  clock. `points` drains with DAMAGE: an absorb's stored `value` IS its remaining
  shield (`src/sim/types.ts`), and its duration runs in parallel, so the points
  lead and the seconds ride behind them dimmed. `mode` has no number at all: a
  countdown under stealth is a lie the player reads as "this is about to leave
  me".
- **A points bar needs a denominator the sim does not store.** The core keeps a
  per-row high-water `peakPoints` and fills against it, pruned when the row goes
  away so it cannot grow across a session.
- **Never a second classifier.** Ownership comes from `isOwnAura`
  (`src/sim/aura_classify.ts`), the toggle test from `isToggleAura` and the final
  seconds from `isAuraExpiring` (both `src/ui/auras_view.ts`), all injected as
  deps. If you find yourself writing a list of toggles or a "who cast it" check,
  you are forking a classifier the aura strips already own.
- **Nothing here is graphics-tier gated.** These are timers a player acts on, so
  the track's own setting is the only switch (root CLAUDE.md, gameplay-neutral
  graphics). The FPS governor must never reach them.
- **Every track is off by default.** Six frames appearing unasked would bury the
  world; each is opted into under INTERFACE > COMBAT.

## Adding a seventh track

A row in `AURA_TRACKS`, its container in `index.html` and `play.html`, its
`BOOL_SETTINGS` key, its options row, its `hudChrome.auraTracks.*` label, and its
CSS `--at-fill` colour. Nothing in `hud.ts`, `interface_unlock_core.ts` or either
of the two shared modules: the Hud composes by LOOPING the table and the frame
specs are generated from it. If a change needs an edit in `hud.ts`, the
descriptor is missing a field.
