// The pure core behind the "Unlock interface" Interface option
// (src/ui/interface_unlock_core.ts): the frame table, the option row's label
// swap, and the eligibility rule that decides which frames a flip may loosen.
// DOM-free by construction, so this drives the real module directly.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classGatedFrameActive,
  frameRowSettingKey,
  framesToLock,
  HUD_FRAME_SPECS,
  HUD_FRAME_STORAGE_KEYS,
  interfaceUnlockLabelKey,
  type UnlockCandidate,
} from '../src/ui/interface_unlock_core';

const candidate = (id: string, active: boolean): UnlockCandidate => ({
  id,
  isActive: () => active,
});

describe('HUD_FRAME_SPECS', () => {
  it('covers exactly the frames the option promises, each with a unique id, element and key', () => {
    expect(HUD_FRAME_SPECS.map((s) => s.id)).toEqual([
      'actionBar1',
      'actionBar2',
      'actionBar3',
      'actionBarGroup',
      'castBar',
      'swingBar',
      'steamWishlist',
      'menu',
      'minimap',
      'petFrame',
      'petBar',
      'stanceBar',
      'xpBar',
      'buffBar',
      'debuffBar',
      'targetDots',
      'questTracker',
      'reliquaryTracker',
      'paladinDevotion',
      'doomMeter',
      'procOverlay',
      'damageMeter',
      'deedTracker',
      'delveTracker',
      'riftTracker',
      'swingBarOffhand',
    ]);
    expect(HUD_FRAME_SPECS.map((s) => s.elementId)).toEqual([
      'actionbar',
      'actionbar2',
      'actionbar3',
      'actionbar-group',
      'castbar',
      'swingbar',
      'community-hud',
      'side-buttons',
      'minimap-wrap',
      'pet-frame',
      'petbar',
      'stancebar',
      'xpbar',
      'buff-bar',
      'debuff-bar',
      'target-dots',
      'quest-tracker',
      'reliquary-tracker',
      'paladin-devotion-frame',
      'warlock-doom-frame',
      'proc-overlay',
      'meters-window',
      'deed-tracker',
      'delve-tracker',
      'rift-tracker',
      'swingbar-offhand',
    ]);
    // A duplicated storage key would make two frames overwrite each other's
    // saved box, which is silent and only shows up after a reload.
    expect(new Set(HUD_FRAME_STORAGE_KEYS).size).toBe(HUD_FRAME_SPECS.length);
    // The FULL key list, pinned as literals in spec order: these are persisted
    // player data (localStorage), so renaming any one of them orphans every
    // player's saved layout for that frame with no other test failing. A new
    // frame appends a new key here; an existing key never changes.
    expect(HUD_FRAME_STORAGE_KEYS).toEqual([
      'woc_hud_frame_actionbar',
      'woc_hud_frame_actionbar2',
      'woc_hud_frame_actionbar3',
      'woc_hud_frame_actionbar_group',
      'woc_hud_frame_castbar',
      'woc_hud_frame_swingbar',
      'woc_hud_frame_community',
      'woc_hud_frame_side_buttons',
      'woc_hud_frame_minimap',
      'woc_hud_frame_pet',
      'woc_hud_frame_petbar',
      'woc_hud_frame_stancebar',
      'woc_hud_frame_xpbar',
      'woc_hud_frame_buffbar',
      'woc_hud_frame_debuffbar',
      'woc_hud_frame_target_dots',
      'woc_hud_frame_quest_tracker',
      'woc_hud_frame_reliquary_tracker',
      'woc_hud_frame_paladin_devotion',
      // The doom meter joined the registry AFTER shipping its own mover, so
      // its row keeps the key that mover persisted under (movable frame
      // positions are player data; renaming the key orphans saved layouts).
      'woc_warlock_doom_frame_pos',
      'woc_hud_frame_proc_overlay',
      'woc_hud_frame_meters',
      'woc_hud_frame_deed_tracker',
      'woc_hud_frame_delve_tracker',
      'woc_hud_frame_rift_tracker',
      'woc_hud_frame_swingbar_offhand',
    ]);
  });

  it('marks exactly the frames that can sit under a transformed ancestor for re-homing', () => {
    // The action bars, pet frame, XP bar and doom meter live inside
    // #bottom-bar, whose
    // centering transform becomes the containing block for absolute positioning;
    // the buff/debuff rows live in the #aura-stack flex column (and the buff
    // row can also be re-parented into the player frame at runtime, the Buffs
    // on the Player Frame option), and the two trackers sit inside the
    // positioned #right-tracker-stack flex column, which would otherwise
    // become their containing block AND keep them in its flow. The cast bar,
    // menu rail, minimap and devotion medallion are already positioned #ui
    // children, and the detacher is a no-op for a frame already homed there.
    const detaching = HUD_FRAME_SPECS.filter((s) => s.detachToUiRoot).map((s) => s.id);
    expect(detaching).toEqual([
      'actionBar1',
      'actionBar2',
      'actionBar3',
      'actionBarGroup',
      'petFrame',
      'petBar',
      'stanceBar',
      'xpBar',
      'buffBar',
      'debuffBar',
      'questTracker',
      'reliquaryTracker',
      'doomMeter',
      'damageMeter',
      'deedTracker',
      'delveTracker',
      'riftTracker',
    ]);
  });

  it('reserves box (layout) resize for the frames that genuinely reflow', () => {
    // Everything else is fixed content (46px slots, a minimap canvas, a
    // portrait), where stretching one axis only grew empty space.
    // The Target dots tracker joins the two aura rows: a wider frame is a longer
    // timer bar and more room for the label before it ellipses, which is a real
    // reflow rather than empty space. The meter rows reflow too, and the
    // meters' detached column scrolls inside the box.
    const box = HUD_FRAME_SPECS.filter((s) => s.resizeMode === 'box').map((s) => s.id);
    expect(box).toEqual(['buffBar', 'debuffBar', 'targetDots', 'damageMeter']);
  });

  it('lifts the zoom ceiling for exactly the wishlist chip', () => {
    // Owner request: the Steam Wishlist reminder may grow without limit; every
    // other frame keeps the shared FRAME_SCALE_MAX band so a stray drag cannot
    // swallow the viewport. The FLOOR stays shared (grabbability).
    const unlimited = HUD_FRAME_SPECS.filter((s) => s.maxScale !== undefined);
    expect(unlimited.map((s) => s.id)).toEqual(['steamWishlist']);
    expect(unlimited[0]?.maxScale).toBe(Number.POSITIVE_INFINITY);
  });

  it('declares a resolved stock slot for exactly the rows that share a detaching sibling', () => {
    // A slot remembered at detach time can point at a sibling that has since
    // left its parent. The two player aura rows close that hazard by declaring
    // their slot ('first'/'last' in #aura-stack). The #actionbar-stack rows
    // share the hazard (the stack is all detaching frames plus the
    // runtime-mounted doom bar, whose seat is "before #player-frame", a slot
    // 'first'/'last' cannot spell), and they ACCEPT the captured-slot path
    // instead: the detacher's append fallback keeps release from throwing, at
    // the cost of a possible in-stack drift until reload after a mixed reset,
    // the same drift the base already had. Extending stockHome with a
    // before-sibling slot is the upgrade path if that drift ever matters.
    const declared = HUD_FRAME_SPECS.filter((s) => s.stockHome).map((s) => [s.id, s.stockHome]);
    expect(declared).toEqual([
      ['buffBar', { parentId: 'aura-stack', slot: 'first' }],
      ['debuffBar', { parentId: 'aura-stack', slot: 'last' }],
    ]);
    for (const spec of HUD_FRAME_SPECS) {
      if (spec.stockHome) expect(spec.detachToUiRoot, `${spec.id} declares a home`).toBe(true);
    }
  });

  it('declares stock slots that resolve in both game entries, in column order', () => {
    // A declared parent that the markup does not carry is a SILENT no-op at
    // runtime (resolveStockHome returns null and the row never comes home), so
    // the id is tied to the shipped entries here rather than trusted. The
    // 'first' row must also precede the 'last' row inside that parent.
    for (const entry of ['index.html', 'play.html']) {
      const html = readFileSync(join(import.meta.dirname, '..', entry), 'utf8');
      const declared = HUD_FRAME_SPECS.filter((s) => s.stockHome);
      for (const spec of declared) {
        const parentAt = html.indexOf(`id="${spec.stockHome?.parentId}"`);
        expect(parentAt, `${entry}: ${spec.id} stock parent`).toBeGreaterThan(-1);
        const rowAt = html.indexOf(`id="${spec.elementId}"`, parentAt);
        expect(rowAt, `${entry}: ${spec.id} row inside its stock parent`).toBeGreaterThan(parentAt);
      }
      const first = declared.find((s) => s.stockHome?.slot === 'first');
      const last = declared.find((s) => s.stockHome?.slot === 'last');
      expect(html.indexOf(`id="${first?.elementId}"`)).toBeLessThan(
        html.indexOf(`id="${last?.elementId}"`),
      );
    }
  });

  it('every frame id hud.ts hands to restoreFrameHome is a row of the table', () => {
    // restoreFrameHome treats an unknown id as a no-op by design, so a drift
    // between the literal at the call site and the table would be swallowed
    // silently; the source text is pinned here instead.
    const hud = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'hud.ts'), 'utf8');
    const calls = [...hud.matchAll(/restoreFrameHome\(document, '([^']+)'/g)].map((m) => m[1]);
    expect(calls).toEqual(['buffBar']);
    const ids = new Set(HUD_FRAME_SPECS.map((s) => s.id));
    for (const id of calls) expect(ids.has(id), `hud.ts restores unknown frame ${id}`).toBe(true);
  });

  it('names every frame with a label key so no placeholder is anonymous', () => {
    for (const spec of HUD_FRAME_SPECS) {
      expect(spec.labelKey, `frame ${spec.id} has no name chip key`).toBeTruthy();
    }
  });

  it('gives every frame a positive fallback size for the hidden-frame clamp', () => {
    for (const spec of HUD_FRAME_SPECS) {
      expect(spec.fallbackSize.w).toBeGreaterThan(0);
      expect(spec.fallbackSize.h).toBeGreaterThan(0);
    }
  });
});

describe('classGatedFrameActive', () => {
  it('gives class-conditional frames to exactly the classes that can show them', () => {
    // Pet frame and bar: the three pet classes (hunter beast, warlock demon,
    // the frost mage Water Elemental), per isPetClass.
    for (const id of ['petFrame', 'petBar']) {
      expect(classGatedFrameActive(id, 'hunter')).toBe(true);
      expect(classGatedFrameActive(id, 'mage')).toBe(true);
      expect(classGatedFrameActive(id, 'warlock')).toBe(true);
      expect(classGatedFrameActive(id, 'warrior')).toBe(false);
      expect(classGatedFrameActive(id, 'priest')).toBe(false);
    }
    expect(classGatedFrameActive('stanceBar', 'warrior')).toBe(true);
    expect(classGatedFrameActive('stanceBar', 'paladin')).toBe(true);
    expect(classGatedFrameActive('stanceBar', 'rogue')).toBe(false);
    expect(classGatedFrameActive('paladinDevotion', 'paladin')).toBe(true);
    expect(classGatedFrameActive('paladinDevotion', 'warrior')).toBe(false);
    expect(classGatedFrameActive('doomMeter', 'warlock')).toBe(true);
    expect(classGatedFrameActive('doomMeter', 'mage')).toBe(false);
    // The proc overlay serves the mage birds AND the warlock soul bank and
    // Ruin ritual, so both classes get its placeholder.
    expect(classGatedFrameActive('procOverlay', 'mage')).toBe(true);
    expect(classGatedFrameActive('procOverlay', 'warlock')).toBe(true);
    expect(classGatedFrameActive('procOverlay', 'druid')).toBe(false);
  });

  it('declines the rows whose activity is live state, not class', () => {
    for (const id of ['actionBar1', 'actionBarGroup', 'questTracker', 'damageMeter', 'minimap']) {
      expect(classGatedFrameActive(id, 'warrior')).toBeNull();
    }
  });
});

describe('frameRowSettingKey', () => {
  it('routes exactly the frames with a real master switch to that switch', () => {
    // One state per surface: a frame whose visibility already has an options
    // setting must drive that setting from its frames-menu row too, or the
    // two checkboxes desync (the reliquary precedent, and the 0.42 release's
    // Target dots tracker joined with its own showTargetDots switch).
    expect(frameRowSettingKey('actionBar2')).toBe('showSecondaryActionBar');
    expect(frameRowSettingKey('actionBar3')).toBe('showThirdActionBar');
    expect(frameRowSettingKey('reliquaryTracker')).toBe('showReliquaryTracker');
    expect(frameRowSettingKey('targetDots')).toBe('showTargetDots');
    for (const id of ['actionBar1', 'questTracker', 'damageMeter', 'petFrame', 'minimap']) {
      expect(frameRowSettingKey(id), `${id} has no master switch`).toBeNull();
    }
  });
});

describe('interfaceUnlockLabelKey', () => {
  it('names the action the press performs, not the current state', () => {
    expect(interfaceUnlockLabelKey(false)).toBe('hudChrome.interfaceUnlock.unlock');
    expect(interfaceUnlockLabelKey(true)).toBe('hudChrome.interfaceUnlock.lock');
  });
});

describe('framesToLock', () => {
  it('unlocks only the frames that are live right now', () => {
    const decisions = framesToLock(
      [candidate('actionBar1', true), candidate('petFrame', false), candidate('castBar', true)],
      true,
    );
    expect(decisions).toEqual([
      { id: 'actionBar1', unlocked: true },
      // A hunter with no pet out cannot move the pet frame.
      { id: 'petFrame', unlocked: false },
      { id: 'castBar', unlocked: true },
    ]);
  });

  it('locks every frame unconditionally, including ones that went inactive', () => {
    // The pet was dismissed while the interface was unlocked: the frame must
    // still be told to lock, or its drag gesture stays armed behind a hidden
    // element and fires the next time the pet is summoned.
    const decisions = framesToLock(
      [candidate('actionBar1', true), candidate('petFrame', false)],
      false,
    );
    expect(decisions).toEqual([
      { id: 'actionBar1', unlocked: false },
      { id: 'petFrame', unlocked: false },
    ]);
  });

  it('preserves registration order and reports one decision per candidate', () => {
    const ids = HUD_FRAME_SPECS.map((s) => s.id);
    const decisions = framesToLock(
      ids.map((id) => candidate(id, true)),
      true,
    );
    expect(decisions.map((d) => d.id)).toEqual(ids);
    expect(decisions.every((d) => d.unlocked)).toBe(true);
  });

  it('returns nothing when no frame is registered', () => {
    expect(framesToLock([], true)).toEqual([]);
  });
});
