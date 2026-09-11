# Festering Venom damage precision

Knifework's Redhanded changes the per-stack contribution. The tooltip now preserves
that value; combat still rounds once after multiplying by the stack count.

| Surface | Before | After |
| --- | --- | --- |
| Level 14, desktop hover | [4 per stack](before-desktop.png) | [4.28 per stack](after-desktop.png) |
| Level 20, mobile long press | [4 per stack](before-mobile.png) | [4.4 per stack](after-mobile.png) |

Baseline: release/v0.42.0 at `797b4f572b02f3cd9ef399d5ba20abb49309896a`, served
from a clean detached worktree. Both sides use the `ability-tooltip` capture recipe
in `scripts/pr_shot_targets.mjs`, Knifework, and the lowest graphics preset.
Mobile uses a real held touch on the spell icon. Desktop is 1600 by 900; mobile
is 844 by 390 CSS pixels at device scale 2.

The capture runner logged existing asset-preload errors on both the clean release
and fixed versions. The spellbook and tooltip rendered on both surfaces.
