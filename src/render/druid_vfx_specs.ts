import type { AbilityVfxFullSpec, AbilityVfxSpec } from './ability_vfx_core';

// Wildfang kit pass 2 (Pin, Lunge, Hamstring Bite) placeholder identities.
// Every spec here is a clearly labelled PLACEHOLDER borrowed from the nearest
// shipped druid read (Bruin Rush's dash, Slinkstrike's claw strike, Hobbling
// Cut's victim-worn speedlines) so the new actions are not silent while the
// VFX retune pass, which owns their final visuals, replaces them. They land in
// this class-owned module and resolve through ability_vfx_registry.ts, never
// in the generated gallery tables (src/render/ability_vfx/CLAUDE.md).
//
// VFX retune pending: the Pin snare worn by the Bruin Rush victim. Mirrors the
// Hobbling Cut victim read (dragging ankle speedlines for the snare's 4 sec);
// the aura id is the bare `pin`, so the band resolves by exact id rather than
// the `_slow` suffix map.
export const PIN_VFX_SPEC = {
  c: '#dfe6ee',
  p: 'physical',
  pw: 0.8,
  sp: 6,
  sm: 1,
  li: 0.3,
  lg: 1,
  bo: 'speedlines',
  a: 'cc',
} satisfies AbilityVfxSpec;

export const PIN_VFX_FULL_SPEC = {
  archetype: 'cc',
  palette: 'physical',
  power: 0.8,
  windupStyle: 'none',
  impact: { flipbook: false, ring: false, sparks: 6, debris: true, smoke: true, light: 0.3 },
  debuff: { orbit: 'speedlines', o: { n: 3, rate: 1.5, size: 0.2, radius: 1.15 } },
  linger: 1,
} satisfies AbilityVfxFullSpec;
