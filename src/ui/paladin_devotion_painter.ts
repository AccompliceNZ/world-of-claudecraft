import type { PainterHostWriters } from './painter_host';
import type { PaladinDevotionState } from './paladin_devotion_view';

const READY_CLASS = 'ready';
const ASCENDED_CLASS = 'ascended';
const LAST_CHARGE_CLASS = 'last-charge';
const CHARGE_ACTIVE_CLASS = 'on';
/** Mirrored onto the frame's HUD host so the cross hotbar's set rail can draw
 *  the same devotion as a meter in pad mode, where the medallion hides. */
const HOST_FILL_PROP = '--devotion-fill';
const HOST_CHARGES_PROP = '--devotion-charges';
const HOST_LIVE_PROP = '--devotion-live';

export class PaladinDevotionPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly frame: HTMLElement,
    private readonly root: HTMLElement,
    private readonly fill: HTMLElement,
    private readonly label: HTMLElement,
    private readonly charges: HTMLCollection,
    private readonly status: HTMLElement,
  ) {
    this.host = frame.parentElement ?? frame;
  }

  private readonly host: HTMLElement;

  paint(state: PaladinDevotionState): void {
    this.writers.setDisplay(this.frame, state.visible ? 'flex' : 'none');
    this.writers.setStyleProp(this.fill, '--devotion-scale', state.fillFrac.toFixed(3));
    this.writers.setText(this.label, state.label);
    this.writers.setAttr(this.root, 'aria-valuenow', String(state.value));
    this.writers.setAttr(this.root, 'aria-valuetext', state.ariaValueText);
    this.writers.setText(this.status, state.announcement);
    this.writers.toggleClass(this.root, READY_CLASS, state.ready);
    this.writers.toggleClass(this.root, ASCENDED_CLASS, state.ascended);
    this.writers.toggleClass(this.root, LAST_CHARGE_CLASS, state.lastCharge);
    for (let index = 0; index < this.charges.length; index++) {
      this.writers.toggleClass(
        this.charges[index] as HTMLElement,
        CHARGE_ACTIVE_CLASS,
        state.ascended && index < state.charges,
      );
    }
    this.writers.setStyleProp(this.host, HOST_LIVE_PROP, state.visible ? '1' : '0');
    this.writers.setStyleProp(this.host, HOST_FILL_PROP, state.fillFrac.toFixed(3));
    this.writers.setStyleProp(
      this.host,
      HOST_CHARGES_PROP,
      String(state.ascended ? state.charges : 0),
    );
  }
}
