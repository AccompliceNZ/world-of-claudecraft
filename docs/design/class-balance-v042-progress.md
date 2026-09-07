# v0.42.0 class balance implementation

Reuben authorized the complete [proposal](class-balance-v042.md) on 7 September 2026, using Sonnet implementation workers with Codex integration and review.

Base: release/v0.42.0 at 357b1932c2ca5eee11cadf520b7caaf61c141196.
Feature branch: feature/v042-class-rebalance.

## Scope and ownership

Sonnet implemented offensive tuning, primary/custom healing, Priest mechanics, Rogue/Hunter mechanics and tooltip calculations. Codex integrated shared effects, reviewed each slice, reproduced defects and requested corrections. A further Sonnet slice shares resolved ability presentation across offline and online worlds.

All work is isolated from unrelated user changes. The release-locked dependencies are installed separately; the initial reused dependency tree had stale Three.js types.

## Progress

- [x] Confirm release baseline and create feature branch in the separate research worktree.
- [x] Freeze an unchanged baseline simulation bundle before gameplay edits.
- [x] Dispatch bounded Sonnet implementation assignments.
- [x] Implement all numerical changes and shared primary-heal paths.
- [x] Integrate actual-stealth opener, Dirge refresh, Doctrine rescue and wand damage.
- [x] Review and correct Dirge extension carry, rejected applications and copied-heal target modifiers.
- [x] Measure the numerical damage package and sibling controls across 24 seeds.
- [x] Measure the actual-stealth profile across 24 seeds.
- [x] Calibrate Groveheart's complete engine budget across 24 seeds.
- [x] Finish Coldsight lifecycle review and combined budget measurement.
- [x] Finish tooltip and world-resolution parity corrections.
- [x] Consolidate focused tests, typecheck, formatting and required content generation.
- [x] Prepare the reviewable feature PR with exact checks and outstanding validation.

## Decisions and evidence

[Measured results and limitations](class-balance-v042-results.md) are authoritative for final calibration. Groveheart uses a 1.05 primary factor plus corrected Wildbloom replants, producing approximately 20% full-engine gain; direct-only spells gain approximately 5%. This supersedes the proposal's initial 1.20 trial factor.

Coordinator-confirmed checks during implementation:

- Primary healing packet integration and tuning tables: 38 tests passed after Groveheart calibration.
- Actual-stealth dispatcher/behind gate: 5 tests passed, after reproducing 3 failures.
- Doctrine wand output and sibling controls: 3 tests passed, after reproducing its missing buff.
- Coldsight charge visibility under Low graphics overflow: 8 tests passed, after reproducing its hidden indicator.
- Architecture and monolith guards: 131 tests passed before the final world-resolution extraction.

The final combined run covered every changed test file plus architecture, client-fixture, spellbook and talent-state guards: 864 passed, with one stale Ashveil expectation. After re-deriving that expectation from the new coefficients, the entire Ashveil file passed all 17 tests. Every test in the 865-test selection now has a passing result; the whole selection was not repeated after the test-only correction. Separate localization and guide checks passed 144 tests with three existing skips. Earlier tooltip-helper passes missed real rendered-value defects; the corrected tests now exercise actual online snapshots and rendered values.

The client, server and headless bundles compile. Typecheck is clean. Explicit Biome validation covers all 74 changed/new source and test files; `ci:changed` initially checked zero files while the branch was uncommitted. The deterministic malware gate passes with no high flags after repository priors. Full Gate, browser screenshots, release translations and broader PBE scenarios remain outstanding.

## Final review corrections

Sonnet's final content review confirmed all 13 specs and found no missing new-item, Deed or Reliquary obligations. Codex verified the two follow-ups: existing translations retain old mechanics because reword detection is dormant, and Coldsight's internal markers rendered as misleading one-day buffs.

The translation worklist is explicit in the results document. Sonnet fixed marker visibility with an exact-ID, kind-qualified filter at the shared aura-view seam. The real ten-second Read and other classes' internal-cooldown buffs remain visible. Focused aura checks passed all 72 tests after reproducing the defect and correcting one overbroad fixture assertion. No combat math changed in this final correction.

Implementation and focused review are complete for a draft handoff. Release QA is NOT READY until the documented Gate, browser, translation and PBE work is completed. Publication as a draft PR was explicitly authorized on 7 September 2026; merge and deployment remain separate.

## Delivery contract

Feature defects are fixed before delivery. Reuben's recorded preference prioritizes a reviewable feature PR with focused validation; broad Gate/CI cleanup is deferred and known failures/unrun checks are disclosed. No merge or deployment is authorized.
