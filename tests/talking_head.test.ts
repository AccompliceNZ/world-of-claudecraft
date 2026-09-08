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
    document.body.innerHTML =
      '<div id="ui"><div id="actionbar-stack"><div id="pet-cluster"></div></div></div>';
  });

  it('prepends the panel to the stack, paints name and line, and hides on expiry', () => {
    const c = new TalkingHeadController(() => now);
    c.say({ speakerId: 'ferryman_odo', speakerName: 'Ferryman Odo', text: 'Welcome ashore.' });
    const el = document.getElementById(TALKING_HEAD_ID) as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.previousElementSibling).toBeNull();
    expect(el.nextElementSibling?.id).toBe('pet-cluster');
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
  it('rides the bottom stack above the frames on desktop and the top lane on touch', () => {
    expect(hud).toContain('.talking-head {\n    display: flex;');
    expect(hud).toContain('margin-bottom: var(--unit-frame-bar-gap);');
    expect(hud).toContain('.talking-head[hidden] {\n    display: none;');
    expect(hud).not.toContain('.tut-voice {');
    expect(hud).toContain(
      '#ui:has(.talking-head:not([hidden])) #interact-prompt {\n    bottom: calc(210px + 90px);',
    );
    expect(mobile).toContain('body.mobile-touch .talking-head {\n    position: fixed;');
  });
});
