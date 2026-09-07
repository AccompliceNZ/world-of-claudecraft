import type { PadHintRow, PadHintStripState, PadHintTone } from './pad_hint_strip_view';
import type { PainterHostWriters } from './painter_host';

/** One glyph-plus-label pair, in either readout. */
export interface PadHintRowElements {
  root: HTMLElement;
  glyph: HTMLElement;
  label: HTMLElement;
}

export interface PadHintStripElements {
  strip: HTMLElement;
  legend: HTMLElement;
  rows: readonly PadHintRowElements[];
  legendRows: readonly PadHintRowElements[];
}

const TONES: readonly Exclude<PadHintTone, null>[] = ['a', 'b', 'x', 'y'];
const TONE_CLASSES: Record<Exclude<PadHintTone, null>, string> = {
  a: 'pad-glyph--a',
  b: 'pad-glyph--b',
  x: 'pad-glyph--x',
  y: 'pad-glyph--y',
};

/**
 * Paints the pad hint strip and the launcher legend. Deliberately writes NO
 * display on the two roots: whether the readouts show at all is the stylesheet's
 * call (body.xhb-mode:not(.mobile-touch)), and an inline display here would beat
 * that rule and strand them on screen for a keyboard player.
 */
export class PadHintStripPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly elements: PadHintStripElements,
  ) {}

  private paintRow(els: PadHintRowElements | undefined, row: PadHintRow | undefined): void {
    if (!els || !row) return;
    this.writers.setDisplay(els.root, row.visible ? 'flex' : 'none');
    this.writers.setText(els.glyph, row.glyph);
    this.writers.setText(els.label, row.label);
    for (const tone of TONES) {
      this.writers.toggleClass(els.glyph, TONE_CLASSES[tone], row.tone === tone);
    }
  }

  paint(state: PadHintStripState): void {
    this.writers.setAttr(this.elements.strip, 'aria-label', state.label);
    this.writers.setAttr(this.elements.legend, 'aria-label', state.label);
    for (let i = 0; i < this.elements.rows.length; i++) {
      this.paintRow(this.elements.rows[i], state.rows[i]);
    }
    for (let i = 0; i < this.elements.legendRows.length; i++) {
      this.paintRow(this.elements.legendRows[i], state.legend[i]);
    }
  }
}
