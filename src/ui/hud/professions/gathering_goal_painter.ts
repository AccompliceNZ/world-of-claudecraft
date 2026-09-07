// Thin DOM consumer for the persistent gathering goal panel (Intentional
// Gathering PR4). Named *_painter.ts per src/ui/CLAUDE.md's painter-file
// convention, so it is scanned by the raw-write gate in
// tests/hud_perf_budget.test.ts (registered in HOT_PAINTERS). Its whole
// raw-write footprint is exactly TWO lines, both documented allowances there:
// ONE `.style` write (the panel's display flip) and ONE `.innerHTML` write
// (the whole panel body, rebuilt fresh on every call like every other "cold"
// window painter in this family; the controller's own signature gate is what
// keeps an unchanged goal from calling this at all, so nothing here is a
// per-frame path). Every dynamic value, including every focus key, is
// interpolated into that single template through `esc()`/`focusKeyAttr()`,
// so no `.textContent`/`.setAttribute`/`.classList`/`.dataset` write is
// needed anywhere else in the file.
//
// This is NOT a window: it attaches to a parent-supplied root element (the
// root tracker element the parent composition owns) and paints in place,
// with no open/close lifecycle, no dialog role, and no focus trap of its own.
// It does carry the ordinary focus-across-rebuild contract (src/ui/CLAUDE.md):
// a player who just pressed "Set as harvest preference" or "Clear" must not
// have focus dropped to <body> by the repaint that answers their click.
//
// Visibility contract: the panel hides ONLY on true no-selection (goal null
// AND reason null, the sim's own inert shape). A goal of null WITH a reason
// (e.g. reason 'invalid_goal': a persisted selection that no longer resolves)
// still renders, with an explanation and the Clear action, because the
// player has something to act on even though there is no live goal to show.
//
// Renders NO tracking/selection UI of its own: the crafting window's and the
// commission board's own Track controls are what call
// onTrackRecipe/onTrackCommission (owned by those two windows, not here).
// This panel only displays the CURRENT goal and offers Clear plus the
// per-material harvest-preference shortcut (the sole preference write; every
// other callback here only reads or clears the tracked goal).

import type { GatheringGoalUnavailableReason } from '../../../sim/professions/gathering_goal_types';
import { itemDisplayName } from '../../entity_i18n';
import { esc } from '../../esc';
import {
  captureFocusKey,
  findFocusKey,
  focusKeyAttr,
  restoreFirstEnabled,
} from '../../focus_restore';
import { formatNumber, t } from '../../i18n';
import type {
  GatheringGoalMaterialRow,
  GatheringGoalPanelModel,
  GatheringGoalSourceFamilyId,
} from './gathering_goal_view';
import { gatheringProfessionNameKey } from './gathering_profession_name';

export interface GatheringGoalPanelDeps {
  onClearGoal(): void;
  /** `itemId` is always a corpsePreferenceItemId a row actually offered:
   *  never called for any other row. */
  onSetHarvestPreference(itemId: string): void;
}

const REASON_KEY: Record<GatheringGoalUnavailableReason, string> = {
  invalid_goal: 'hudChrome.gatheringGoal.reasonInvalidGoal',
  unknown_recipe: 'hudChrome.gatheringGoal.reasonUnknownRecipe',
  recipe_unavailable: 'hudChrome.gatheringGoal.reasonRecipeUnavailable',
  commission_unavailable: 'hudChrome.gatheringGoal.reasonCommissionUnavailable',
  daily_limit: 'hudChrome.gatheringGoal.reasonDailyLimit',
  batch_limit: 'hudChrome.gatheringGoal.reasonBatchLimit',
};

const STATUS_KEY: Record<GatheringGoalPanelModel['status'], string> = {
  collecting: 'hudChrome.gatheringGoal.statusCollecting',
  ready: 'hudChrome.gatheringGoal.statusReady',
  unavailable: 'hudChrome.gatheringGoal.statusUnavailable',
  delivered: 'hudChrome.gatheringGoal.statusDelivered',
  cancelled: 'hudChrome.gatheringGoal.statusCancelled',
  expired: 'hudChrome.gatheringGoal.statusExpired',
};

/** True only for a genuinely empty tracker: no goal was ever selected, or
 *  the prior one cleared cleanly. A null goal carrying a reason (an invalid
 *  persisted selection) is NOT this case: the player still has something to
 *  read and clear. */
function isTrulyEmpty(model: GatheringGoalPanelModel): boolean {
  return model.goal === null && model.reason === null;
}

/** The localized display name for an unknown/prototype-shaped material or
 *  result id: NEVER the raw itemId or an inherited Object property. Reuses
 *  the harvest preference picker's own "Unavailable material" copy rather
 *  than a second unknown-item string. */
function unavailableMaterialLabel(): string {
  return t('hudChrome.harvestPreference.unknownMaterial');
}

/** The localized gathering-family name for a material row's source, or ''
 *  when the reverse lookup credited no family (a vendor-only or crafted
 *  intermediate reagent, which names nothing). Reuses the SAME per-profession
 *  key table the character sheet and professions window already localize
 *  gathering names through, plus the one sibling key for the corpse family
 *  (hudChrome.gathering.corpseHarvesting): no separate source registry. */
function sourceFamilyLabel(familyId: GatheringGoalSourceFamilyId | null): string {
  if (familyId === null) return '';
  if (familyId === 'corpseHarvesting') return t('hudChrome.gathering.corpseHarvesting');
  const key = gatheringProfessionNameKey(familyId);
  return key ? t(key) : '';
}

function goalLabel(model: GatheringGoalPanelModel): string {
  if (model.goal === null) {
    return model.reason !== null ? t('hudChrome.gatheringGoal.invalidGoalLabel') : '';
  }
  const name = model.result ? itemDisplayName(model.result) : null;
  if (name === null || model.displayCount === null) {
    return t('hudChrome.gatheringGoal.unknownRecipeLabel');
  }
  const count = formatNumber(model.displayCount, { maximumFractionDigits: 0 });
  return model.goal.kind === 'commission'
    ? t('hudChrome.gatheringGoal.commissionGoalLabel', { name, count })
    : t('hudChrome.gatheringGoal.recipeGoalLabel', { name, count });
}

/** Shown only when the recipe's own resultCount makes the tracked craft
 *  count diverge from the displayed total output (a multi-output recipe),
 *  so the output figure in the title is never mistaken for how many crafts
 *  are queued. */
function craftCountLineHtml(model: GatheringGoalPanelModel): string {
  if (model.craftCount === null || model.displayCount === null) return '';
  if (model.craftCount === model.displayCount) return '';
  return `<p class="gathering-goal-craft-count">${esc(
    t('hudChrome.gatheringGoal.craftCountLine', {
      count: formatNumber(model.craftCount, { maximumFractionDigits: 0 }),
    }),
  )}</p>`;
}

function materialLineHtml(row: GatheringGoalMaterialRow): string {
  const name = row.item ? itemDisplayName(row.item) : unavailableMaterialLabel();
  const line = t('hudChrome.gatheringGoal.materialLine', {
    name,
    reachable: formatNumber(row.reachable, { maximumFractionDigits: 0 }),
    required: formatNumber(row.required, { maximumFractionDigits: 0 }),
  });
  // Carried/stored are the row's own allocation breakdown: always rendered,
  // never gated on a nonzero count (unlike the shortfall chips below).
  const carried = ` ${t('hudChrome.gatheringGoal.materialCarried', {
    count: formatNumber(row.carried, { maximumFractionDigits: 0 }),
  })}`;
  const stored = ` ${t('hudChrome.gatheringGoal.materialStored', {
    count: formatNumber(row.stored, { maximumFractionDigits: 0 }),
  })}`;
  const missing =
    row.missing > 0
      ? ` ${t('hudChrome.gatheringGoal.materialMissing', { count: formatNumber(row.missing, { maximumFractionDigits: 0 }) })}`
      : '';
  const inaccessible =
    row.inaccessible > 0
      ? ` ${t('hudChrome.gatheringGoal.materialInaccessible', { count: formatNumber(row.inaccessible, { maximumFractionDigits: 0 }) })}`
      : '';
  const familyLabel = sourceFamilyLabel(row.sourceFamilyId);
  const familyHtml = familyLabel
    ? `<span class="gathering-goal-material-family">${esc(familyLabel)}</span>`
    : '';
  // isCurrentHarvestPreference comes from the AUTHORITATIVE world mirror
  // (gathering_goal_controller.ts), never guessed here: a row whose target
  // is already the active preference gets a disabled, read-only "current"
  // state instead of a redundant Set action.
  const isCurrentPreference = row.isCurrentHarvestPreference === true;
  const preferenceBtn =
    row.corpsePreferenceItemId !== null
      ? `<button type="button" class="gathering-goal-pref-btn${
          isCurrentPreference ? ' current' : ''
        }" data-set-pref${focusKeyAttr(`pref:${row.corpsePreferenceItemId}`)}${
          isCurrentPreference ? ' disabled aria-disabled="true"' : ''
        } aria-label="${esc(
          isCurrentPreference
            ? t('hudChrome.gatheringGoal.currentPreferenceAria', { name })
            : t('hudChrome.gatheringGoal.setPreferenceButtonAria', { name }),
        )}">${esc(
          isCurrentPreference
            ? t('hudChrome.gatheringGoal.currentPreferenceLabel')
            : t('hudChrome.gatheringGoal.setPreferenceButton'),
        )}</button>`
      : '';
  // The family badge and preference button ride a SEPARATE row below the
  // material text (never beside it): at the rail's ~240px width a same-row
  // layout squeezes the text span toward zero, wrapping it one character per
  // line. Omit the row entirely rather than emit an empty wrapper.
  const metaHtml =
    familyHtml || preferenceBtn
      ? `<div class="gathering-goal-material-meta">${familyHtml}${preferenceBtn}</div>`
      : '';
  return (
    `<li class="gathering-goal-material${row.satisfied ? ' satisfied' : ''}">` +
    `<span class="gathering-goal-material-line">${esc(line)}${esc(carried)}${esc(stored)}${esc(missing)}${esc(inaccessible)}</span>` +
    `${metaHtml}</li>`
  );
}

function panelBodyHtml(model: GatheringGoalPanelModel): string {
  const reasonLine =
    model.reason !== null
      ? `<p class="gathering-goal-reason">${esc(t(REASON_KEY[model.reason] as never))}</p>`
      : '';
  const readyHint =
    model.status === 'ready'
      ? `<p class="gathering-goal-ready-hint">${esc(t('hudChrome.gatheringGoal.readyHint'))}</p>`
      : '';
  const payableLine =
    model.payableCrafts > 0
      ? `<p class="gathering-goal-payable">${esc(
          t('hudChrome.gatheringGoal.payableCraftsLine', {
            count: formatNumber(model.payableCrafts, { maximumFractionDigits: 0 }),
          }),
        )}</p>`
      : '';
  const storageNote = model.storageRestricted
    ? `<p class="gathering-goal-storage-note">${esc(t('hudChrome.gatheringGoal.storageRestrictedNote'))}</p>`
    : '';
  return (
    `<div class="gathering-goal-header">` +
    // The title rides its OWN full-width row so a long goal name wraps
    // instead of truncating: sharing a row with the status badge and Clear
    // button left it almost no width (the header truncated to a few
    // characters at the rail's ~240px width).
    `<span class="gathering-goal-title" role="heading" aria-level="3">${esc(goalLabel(model))}</span>` +
    `<div class="gathering-goal-header-controls">` +
    `<span class="gathering-goal-status" data-status="${esc(model.status)}">${esc(t(STATUS_KEY[model.status] as never))}</span>` +
    // Visible label is short (rail-width); the aria-label keeps the full
    // sentence so the accessible name never regresses.
    `<button type="button" class="gathering-goal-clear-btn" data-clear${focusKeyAttr('clear')} aria-label="${esc(
      t('hudChrome.gatheringGoal.close'),
    )}">${esc(t('hudChrome.gatheringGoal.clearButton'))}</button>` +
    `</div>` +
    `</div>` +
    `${craftCountLineHtml(model)}${reasonLine}${readyHint}${payableLine}${storageNote}` +
    `<ul class="gathering-goal-materials">${model.materials.map(materialLineHtml).join('')}</ul>`
  );
}

/** Paint the panel from a prepared model into `el`, the parent-owned root.
 *  Hides the panel ONLY on true no-selection (see isTrulyEmpty); an invalid
 *  persisted selection (goal null, reason set) still renders its
 *  explanation and Clear. */
export function renderGatheringGoalPanel(
  el: HTMLElement,
  model: GatheringGoalPanelModel,
  deps: GatheringGoalPanelDeps,
): void {
  const focusKey = captureFocusKey(el);
  const empty = isTrulyEmpty(model);
  el.style.display = empty ? 'none' : 'flex';
  el.innerHTML = empty ? '' : panelBodyHtml(model);
  if (empty) return;

  el.querySelector('[data-clear]')?.addEventListener('click', () => deps.onClearGoal());
  const prefButtons = [...el.querySelectorAll<HTMLButtonElement>('[data-set-pref]')];
  const prefRows = model.materials.filter((row) => row.corpsePreferenceItemId !== null);
  prefRows.forEach((row, i) => {
    const btn = prefButtons[i];
    const preferenceItemId = row.corpsePreferenceItemId;
    if (!btn || preferenceItemId === null) return;
    // The `disabled` attribute already stops an ordinary click on the
    // already-current row; this closure-captured guard is the backstop
    // against a stale reference or a direct/programmatic `.click()` that
    // bypasses it. The render itself never writes a preference: this is
    // the sole path to onSetHarvestPreference, and it never fires for a
    // row already reading as the current preference.
    btn.addEventListener('click', () => {
      if (row.isCurrentHarvestPreference) return;
      deps.onSetHarvestPreference(preferenceItemId);
    });
  });

  if (focusKey !== null) restoreFirstEnabled([findFocusKey(el, focusKey)]);
}
