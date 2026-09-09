// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  panelLineDurationMs,
  routeSpeech,
  SPEAKER_BUBBLE_RANGE_YD,
  SPEAKER_EDGE_MARGIN_PX,
  speakerInView,
  TALKING_HEAD_ID,
  TalkingHeadController,
} from '../src/ui/hud/talking_head';
import { HUD_FRAME_SPECS } from '../src/ui/interface_unlock_core';

const view = { viewportWidth: 1600, viewportHeight: 900, distanceYd: 10 };

describe('talking_head_core: bubble when the speaker can be seen, panel otherwise', () => {
  it('routes an on-screen, near speaker to a world bubble', () => {
    const visible = speakerInView({ ...view, anchor: { x: 800, y: 450, behind: false } });
    expect(visible).toBe(true);
    expect(routeSpeech(visible)).toBe('bubble');
  });

  it('routes a speaker behind the camera to the panel', () => {
    expect(speakerInView({ ...view, anchor: { x: 800, y: 450, behind: true } })).toBe(false);
    expect(routeSpeech(false)).toBe('panel');
  });

  it('treats an anchor inside the edge margin as off screen', () => {
    const m = SPEAKER_EDGE_MARGIN_PX;
    expect(speakerInView({ ...view, anchor: { x: m - 1, y: 450, behind: false } })).toBe(false);
    expect(speakerInView({ ...view, anchor: { x: 800, y: 900 - m + 1, behind: false } })).toBe(
      false,
    );
    expect(speakerInView({ ...view, anchor: { x: m, y: 900 - m, behind: false } })).toBe(true);
  });

  it('gives up the bubble past the rig cull range', () => {
    const anchor = { x: 800, y: 450, behind: false };
    expect(speakerInView({ ...view, anchor, distanceYd: SPEAKER_BUBBLE_RANGE_YD })).toBe(true);
    expect(speakerInView({ ...view, anchor, distanceYd: SPEAKER_BUBBLE_RANGE_YD + 1 })).toBe(false);
  });

  it('scales the panel reading time with the line, inside a floor and a cap', () => {
    expect(panelLineDurationMs('Hi.')).toBe(4000);
    expect(panelLineDurationMs('x'.repeat(60))).toBeGreaterThan(4000);
    expect(panelLineDurationMs('x'.repeat(400))).toBe(12000);
  });
});

describe('TalkingHeadController: mounts once at the top of the bottom stack and clears on time', () => {
  let now = 1000;
  beforeEach(() => {
    now = 1000;
    document.body.innerHTML = '<div id="ui"><div id="actionbar-stack"></div></div>';
  });

  it('uses the standing panel in #ui (minting one only when the entry lacks it), paints name and line, and hides on expiry', () => {
    const c = new TalkingHeadController(() => now);
    c.say({ speakerId: 'ferryman_odo', speakerName: 'Ferryman Odo', text: 'Welcome ashore.' });
    const el = document.getElementById(TALKING_HEAD_ID) as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.parentElement?.id).toBe('ui');
    expect(el.hidden).toBe(false);
    expect(el.getAttribute('role')).toBe('status');
    expect(el.querySelector('.th-name')?.textContent).toBe('Ferryman Odo');
    expect(el.querySelector('.th-text')?.textContent).toBe('Welcome ashore.');
    expect(el.querySelector('canvas.th-portrait')).not.toBeNull();
    c.hide();
    expect(el.hidden).toBe(true);
    expect(c.current).toBeNull();
  });

  it('reuses the one panel for the next line instead of minting another', () => {
    const c = new TalkingHeadController(() => now);
    c.say({ speakerId: 'ferryman_odo', speakerName: 'Ferryman Odo', text: 'One.' });
    c.say({ speakerId: 'ferryman_odo', speakerName: 'Ferryman Odo', text: 'Two.' });
    expect(document.querySelectorAll(`#${TALKING_HEAD_ID}`).length).toBe(1);
    expect(document.querySelector('.th-text')?.textContent).toBe('Two.');
  });

  it('escapes the line text (player-visible text is inert markup)', () => {
    const c = new TalkingHeadController(() => now);
    c.say({ speakerId: 'ferryman_odo', speakerName: 'Odo', text: '<b>x</b>' });
    expect(document.querySelector('.th-text')?.querySelector('b')).toBeNull();
  });
});

describe('talking head stylesheet seat', () => {
  const hud = readFileSync(join(__dirname, '../src/styles/hud.css'), 'utf8');
  const mobile = readFileSync(join(__dirname, '../src/styles/hud.mobile.css'), 'utf8');
  it('seats a fifth of the way down the screen, centred, and is a movable HUD frame', () => {
    expect(hud).toContain(
      '.talking-head {\n    position: absolute;\n    left: 50%;\n    top: 20%;\n    translate: -50% 0;',
    );
    // A saved editor spot writes inline left/top; the centring translate must
    // not keep shifting it.
    expect(hud).toContain('#talking-head.hud-frame-detached {\n    translate: none;');
    expect(hud).toContain('.talking-head[hidden] {\n    display: none;');
    expect(hud).not.toContain('.tut-voice {');
    expect(mobile).toContain('body.mobile-touch .talking-head {\n    position: fixed;');
  });

  it('is registered in the movable-frame table so the frames editor can seat it', () => {
    const spec = HUD_FRAME_SPECS.find((s) => s.id === 'talkingHead');
    expect(spec?.elementId).toBe('talking-head');
    expect(spec?.storageKey).toBe('woc_hud_frame_talking_head');
    expect(spec?.labelKey).toBe('hudChrome.talkingHead.label');
    // Hidden between lines, so editing has to force the placeholder like the
    // devotion medallion's, or there is nothing to grab.
    expect(hud).toContain(
      'body.interface-unlocked #talking-head.tf-unlocked {\n    display: flex !important;',
    );
    expect(hud).toContain('#talking-head.tf-unlocked {\n    pointer-events: auto;');
  });
});
