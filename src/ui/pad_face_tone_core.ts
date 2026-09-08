// The face-button colour a printed pad glyph is allowed to carry.
//
// The tone used to be a lookup by raw W3C button index, which paints by
// POSITION while every glyph is printed by BRAND: a DualSense's Cross (index 0)
// came out green because an Xbox A sits in that slot, and a Switch pad's B (also
// index 0) came out green while its letter said B. Deriving the tone from the
// glyph the player actually reads makes the two agree by construction, and a
// brand whose face buttons carry no A/B/X/Y letter simply takes no tone.
//
// Pure and dependency-free (registered in tests/architecture.test.ts
// UI_PURE_CORES): a registered core may not reach into src/game, so the caller
// resolves the brand glyph and hands it here as a string.

export type PadFaceTone = 'a' | 'b' | 'x' | 'y';

const FACE_LETTER_TONES: Readonly<Record<string, PadFaceTone>> = {
  A: 'a',
  B: 'b',
  X: 'x',
  Y: 'y',
};

/**
 * The tone for a resolved button glyph, or null when the glyph is not a lettered
 * face button (a shoulder, a stick click, a d-pad direction, a PlayStation shape,
 * a chord, or nothing bound at all).
 *
 * The generic label family prints both conventions ("A / Cross"), so the leading
 * segment is what the tone follows.
 */
export function padFaceTone(glyph: string): PadFaceTone | null {
  const letter = glyph.split('/')[0]?.trim() ?? '';
  return FACE_LETTER_TONES[letter] ?? null;
}
