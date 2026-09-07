# v0.42.0 class balance measurements

Implementation targets [the approved proposal](class-balance-v042.md). Measurements below use the actual simulation, fixed legal fixtures, finite resources and paired random seeds. They describe these fixtures, not live population balance or an optimized rotation.

Baseline: release/v0.42.0 at 357b1932c2ca5eee11cadf520b7caaf61c141196. An unchanged baseline bundle was compiled before any gameplay edits. All 24-seed matrices use seeds 4242 + i * 7919 for i = 0..23. Ambient camps, NPCs and ground objects are empty.

## Offensive numerical package

180 seconds, 24 seeds per specialization. Owned-class rows use the existing level-22 Nythraxis single-target profile and exact PBE fixtures. Warlock rows use the existing heroic Nythraxis prepared-pull fixture. Rogue rows use the existing 798-armor dummy fixture. The arm uses a frozen candidate bundle; no prototype damage wrappers are installed.

| Spec | Before DPS | After DPS | Change |
| --- | ---: | ---: | ---: |
| Wildfang | 128.866 | 142.546 | +10.62% |
| Thundercall | 136.214 | 149.580 | +9.81% |
| Fieldcraft | 143.256 | 157.518 | +9.96% |
| Ruination | 188.994 | 207.585 | +9.84% |
| Knifework | 198.931 | 218.596 | +9.89% |
| Necromancy | 177.634 | 212.264 | +19.50% |
| Vespers, one target | 156.529 | 160.629 | +2.62% |
| Skulduggery, generic rogue policy | 184.277 | 161.240 | -12.50% |
| Warspirit control | 164.904 | 164.904 | 0.00% |
| Packlord control | 159.652 | 159.652 | 0.00% |
| Moongrove control | 137.732 | 137.732 | 0.00% |
| Hexcraft control | 192.544 | 192.544 | 0.00% |
| Thuggery control | 210.041 | 210.041 | 0.00% |

The Vespers row isolates the complete Dirge power-scaling fix; it does not measure the pack-refresh benefit. Coldsight's combined numerical and shot-choice package is measured separately below. Doctrine's complete spell and wand packets are covered by integration tests; a level-20 encounter healing ceiling is not inferred from the supplied low-level parses.

Reproduction uses the existing owned_class_balance_probe.ts, warlock_balance_probe.ts and rogue_dps_probe.ts functions with the listed settings. The exact frozen-bundle runner and raw records are /tmp/woc-v042-measure.mjs, /tmp/woc-v042-measure-baseline.jsonl and /tmp/woc-v042-measure-numeric-candidate.jsonl. These temporary receipts are session evidence; the protocol and aggregate values are preserved here.

## Skulduggery stealth identity

A separate actual-implementation comparison uses the ordinary equipment IDs and legal talents from public fight 78192, character 116838, without external raid buffs. It starts behind a stationary level-20 training dummy with 798 armor. Rotation: Gloam/Veil Lurker's Strike, Tempo refresh at two combo points, otherwise Red Ribbon; no offensive cooldowns. Both arms use the same inputs.

Across 24 seeds, the first actual-stealth Lurker's Strike averages 262.875 before and 407.833 after, a 55.14% increase. Its stronger weapon and flat components land immediately.

| Start | Window | Before DPS | After DPS | Change |
| --- | ---: | ---: | ---: | ---: |
| Actual stealth | 15 sec | 306.12 | 278.74 | -8.95% |
| Actual stealth | 120 sec | 220.77 | 197.85 | -10.38% |
| Actual stealth | 180 sec | 221.54 | 197.68 | -10.77% |
| No stealth | 15 sec | 164.39 | 154.21 | -6.19% |
| No stealth | 120 sec | 210.46 | 187.40 | -10.96% |
| No stealth | 180 sec | 213.86 | 189.98 | -11.17% |

A stronger first strike does not imply higher aggregate damage throughout the opening 15 seconds: weaker repeatable strikes and ordinary output already contribute during that window. The generic rogue policy above loses more than this live-gear policy; neither is claimed to cover every build or PvP burst case.

Receipts: /tmp/woc-v042-stealth-accepted.mjs and /tmp/woc-v042-stealth-{baseline,candidate}.jsonl. Each arm contains 144 runs.

## Coldsight combined budget

24 paired seeds, 180 seconds, the same owned-class level-22 Nythraxis profile as the baseline. Numerical tuning and the actual Read lifecycle together increase mean DPS from 142.812 to 157.845. Mean paired gain is **10.53%**, with a conditional 95% t interval of 10.30-10.75% and a seed range of 9.57-11.76%.

Every pair preserves gear, talents, stats, resources, casts, cooldown uses, idle time and outcomes. Long Draw contributes +11.941 DPS, Fevered Draw +1.824 and Measured Shot +1.269; both autoattack sources remain unchanged. A read-only trace of seed 4242 records 14 grants, 14 accepted Long Draw reservations and 14 actual 1.5x primary hits. Its aggregate result exactly matches the uninstrumented run.

The mechanic is included in the approximately 10% budget. This stationary policy does not measure Fell Shot choices, movement-heavy encounters or every gear profile. Lifecycle integration tests separately cover the two spending choices and interruptions.

Receipts: /tmp/woc-v042-coldsight-summary.json, /tmp/woc-v042-final-coldsight-candidate.jsonl and /tmp/woc-v042-coldsight-state-proof.json.

## Groveheart calibration

The starting 1.20 primary factor, combined with correcting the omitted Healing Power multipliers on Wildbloom replants, produced roughly 36-39% more engine healing. The approved proposal explicitly counts this correction toward the total budget, so the final primary factor is 1.05.

24 paired seeds, 180 seconds, four level-20 warrior party allies, exact legal equipment, finite mana, Seedspread/Nature's Echo/Lifesap. The rotation casts Overbloom at five Verdance, maintains Wildbloom and Second Bloom, and uses Wildmend as filler. Capacity testing continually supplies missing health; it is not an encounter-survival forecast.

| Gear profile | Before effective HPS | After effective HPS | Mean paired gain | Conditional 95% interval |
| --- | ---: | ---: | ---: | --- |
| Nonset | 220.63 | 261.94 | +18.72% | 18.67-18.77% |
| Grovespring 4pc | 250.84 | 303.25 | +20.89% | 20.82-20.97% |

Pooled effective gain is 19.88%; observed gross gain is 19.92%. All 96 runs completed. Every pair retained identical equipment, talents, stats, cast counts, mana endpoint and starvation time. Plain/set rotations cast 13/14 Overblooms respectively. The intervals measure combat RNG conditional on these fixtures, not confidence about live players.

The tradeoff is explicit: direct-only healing and a fresh normal Wildbloom gain about 5%. The corrected replants supply the rest of the full engine's approximately 20% increase. Replanting now matches a normal application at the same stats:

| Healing Power | Old normal tick | Old replant tick | New normal and replant tick |
| --- | ---: | ---: | ---: |
| 149 | 167 | 129 | 175 |
| 190 | 194 | 145 | 204 |

Two-seed finite-mana diagnostics put Spiritmend and Sunmender direct gross healing close to +10%, with Benison and Chronomancy controls identical. Effective HPS under fixed encounter pressure varies with overhealing, deaths and mana; raw spell factors do not promise the same percentage on a healing meter.

Receipts: /tmp/woc-v042-healer-24-summary.json, /tmp/woc-v042-healer-24.mjs, /tmp/woc-v042-healer-24-part{0,1}.jsonl and /tmp/woc-v042-grove-packets.jsonl. The calibrated scratch bundle changes only the Groveheart branch from 1.20 to 1.05; production uses that same calibrated value.

## Validation and release limits

The final changed-test consolidation ran every modified/new test plus architecture, bare-client defaults, spellbook repaint, client talent authority and saved loadouts. It passed 864 tests; one Ashveil 2pc expectation still used the removed Skulduggery bonuses. The corrected Ashveil file then passed all 17 tests. Every test in the selection now has a passing result; the whole selection was not repeated after that test-only correction. Separate localization and guide checks passed 144 tests, with three existing skips.

Commands and observed outcomes:

- `node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism <changed tests and listed guards>`: 35 files, 864 passed and one stale expectation; JSON receipt `/tmp/woc-v042-resume-integrated-tests.json` and explicit file list `/tmp/woc-v042-final-test-files.json`.
- `npx vitest run tests/ignivar_set_bonus_rogue.test.ts --maxWorkers=1`: all 17 tests passed after correcting the stale expectation; receipt /tmp/woc-v042-resume-ashveil-tests.log.
- `node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism tests/localization_fixes.test.ts tests/guide.test.ts`: 144 passed, three skipped.
- `npx vitest run tests/v042_coldsight_visibility.test.ts tests/auras_view.test.ts tests/aura_overflow_priority.test.ts --maxWorkers=1`: all 72 tests passed after fixing hidden-marker presentation.
- `npx tsc --noEmit`: passed after correcting the client helper import and test fixture narrowing.
- `npm run ci:changed`: exited successfully but checked zero uncommitted files. Explicit `node_modules/.bin/biome ci --no-errors-on-unmatched <changed/new TypeScript files>` passed across 74 files, with one existing fixture `any` warning. Exact paths: `/tmp/woc-v042-format-files.json`.
- `npm run i18n:gen` and `npm run wiki:content`: passed. No locale overlays were hand-edited.
- `npm run build:bundle`, `npm run build:server` and `npm run build:env`: passed. Vite reported existing admin-locale dynamic/static import warnings.
- `npm run security:gate`: passed, zero high findings after repository priors. This scanner result is not a whole-release contextual malware audit.
- `git diff --check` and an added-line copy scan covering new files: passed.
- `pnpm audit --json`: reported four moderate and five high advisories in the unchanged release dependency lock; none critical. No dependency updates are part of this feature.

The full Gate, browser regression suite, desktop/mobile screenshot review and release translation gate have not been run. New English keys remain pending translation; M16 and release i18n work must be completed before shipping. Existing translated keys also need an explicit refresh: the current scanner does not mark reworded English keys stale. Verified examples are the old fixed Scouring Mercy numbers in French and the missing Dirge refresh in German. The maintainer worklist must include smite, shadow_word_pain, power_word_shield, scouring_mercy, ambush.specNote_subtlety, aimed_shot, rapid_fire, the new arcane_shot.specNote_marksmanship, Ashveil bonus4 and the new aura text. A clean pending-key list alone will not prove these translations current. Broad Gate/CI cleanup follows Reuben's separate release workflow. This feature is not represented as merge-ready.

PBE still needs to cover PvP/critical-hit stealth burst, practiced versus simple Rogue policies, moving/Fell Shot and target-swap Hunter policies, all gear/set combinations, additional Wildfang Bruin scenarios, and Doctrine 1/5/10-player demand and survival across capstones. Dirge pack behavior has integration coverage, but these results do not measure its full large-pack DPS/mana benefit. Profession-gear comparisons also remain separate. No live production change has been made.
