import { tEntity } from './entity_i18n';
import { type TranslationKey, t } from './i18n';
import { type PadFaceTone, padFaceTone } from './pad_face_tone_core';

export type InteractionPromptVerb =
  | 'talk'
  | 'loot'
  | 'open'
  | 'gather'
  | 'mail'
  | 'bank'
  | 'use'
  | 'harvest';

export type InteractPromptGamepadKind = 'xbox' | 'playstation' | 'nintendo' | 'generic';

export interface InteractPromptGamepadBinding {
  button: number;
  action: string;
}

export interface InteractPromptCandidateInput {
  verb: InteractionPromptVerb | null;
  targetKind: 'mob' | 'npc' | 'gather' | 'bed' | 'raw' | null;
  targetId: string;
  targetName: string;
  holdProgress: number | null;
}

export interface InteractPromptState {
  visible: boolean;
  padActive: boolean;
  padTone: PadFaceTone | null;
  verb: string;
  targetName: string;
  keycap: string;
  holdProgress: number;
  holding: boolean;
}

function gamepadAction(
  bindings: readonly InteractPromptGamepadBinding[],
): { action: string; button: number } | null {
  return (
    bindings.find((entry) => entry.action === 'confirm') ??
    bindings.find((entry) => entry.action === 'interact') ??
    null
  );
}

export interface InteractPromptView {
  tick(
    candidate: InteractPromptCandidateInput | null,
    padActive: boolean,
    keyboardBinding: string,
    gamepadBindings: readonly InteractPromptGamepadBinding[] | null,
    gamepadKind: InteractPromptGamepadKind,
  ): InteractPromptState;
}

const VERB_KEYS: Record<InteractionPromptVerb, TranslationKey> = {
  talk: 'hudChrome.interactPrompt.talk',
  loot: 'hudChrome.interactPrompt.loot',
  open: 'hudChrome.interactPrompt.open',
  gather: 'hudChrome.interactPrompt.gather',
  mail: 'hudChrome.interactPrompt.mail',
  bank: 'hudChrome.interactPrompt.bank',
  use: 'hudChrome.interactPrompt.use',
  harvest: 'hudChrome.interactPrompt.harvest',
};

const GATHER_TARGET_KEYS: Record<string, TranslationKey> = {
  ore: 'hudChrome.gathering.nodeName.ore',
  wood: 'hudChrome.gathering.nodeName.wood',
  herb: 'hudChrome.gathering.nodeName.herb',
};

function targetName(candidate: InteractPromptCandidateInput): string {
  if (candidate.targetKind === 'mob') {
    return tEntity({ kind: 'mob', id: candidate.targetId, field: 'name' });
  }
  if (candidate.targetKind === 'npc') {
    return tEntity({ kind: 'npc', id: candidate.targetId, field: 'name' });
  }
  // A garden bed is content, not an entity, so it has no wire name to print:
  // the family's own word stands in.
  if (candidate.targetKind === 'bed') return t('hudChrome.interactPrompt.gardenBed');
  if (candidate.targetKind === 'gather') {
    const key = GATHER_TARGET_KEYS[candidate.targetId];
    return key ? t(key) : candidate.targetName;
  }
  return candidate.targetName;
}

export function createInteractPromptView(
  formatKeyCap: (binding: string) => string,
  formatGamepadAction: (
    bindings: readonly InteractPromptGamepadBinding[],
    action: string,
    kind: InteractPromptGamepadKind,
  ) => string | null,
): InteractPromptView {
  const state: InteractPromptState = {
    visible: false,
    padActive: false,
    padTone: null,
    verb: '',
    targetName: '',
    keycap: '',
    holdProgress: 0,
    holding: false,
  };

  return {
    tick(candidate, padActive, keyboardBinding, gamepadBindings, gamepadKind) {
      const padBinding =
        padActive && gamepadBindings !== null ? gamepadAction(gamepadBindings) : null;
      state.visible = candidate?.verb != null;
      state.padActive = padActive;
      state.verb = candidate?.verb ? t(VERB_KEYS[candidate.verb]) : '';
      state.targetName = candidate ? targetName(candidate) : '';
      state.keycap =
        padBinding && gamepadBindings
          ? (formatGamepadAction(gamepadBindings, padBinding.action, gamepadKind) ?? '')
          : padActive
            ? ''
            : formatKeyCap(keyboardBinding);
      // The tone follows the BRAND-mapped glyph the player is reading, never the
      // raw button index: index 0 prints Cross on a DualSense and B on a Switch
      // pad, and painting either of those the Xbox A green is the colour lying.
      state.padTone = padBinding ? padFaceTone(state.keycap) : null;
      state.holdProgress = Math.max(0, Math.min(1, candidate?.holdProgress ?? 0));
      state.holding = state.holdProgress > 0;
      return state;
    },
  };
}
