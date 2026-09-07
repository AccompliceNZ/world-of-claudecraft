import type { InteractPromptState } from './interact_prompt_view';
import type { PainterHostWriters } from './painter_host';

export interface InteractPromptElements {
  root: HTMLElement;
  keycap: HTMLElement;
  verb: HTMLElement;
  name: HTMLElement;
}

export class InteractPromptPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly elements: InteractPromptElements,
  ) {}

  paint(state: InteractPromptState): void {
    this.writers.setDisplay(this.elements.root, 'flex');
    this.writers.toggleClass(this.elements.root, 'is-visible', state.visible);
    this.writers.toggleClass(this.elements.root, 'is-pad', state.padActive);
    this.writers.toggleClass(this.elements.root, 'is-pad-a', state.padTone === 'a');
    this.writers.toggleClass(this.elements.root, 'is-pad-b', state.padTone === 'b');
    this.writers.toggleClass(this.elements.root, 'is-pad-x', state.padTone === 'x');
    this.writers.toggleClass(this.elements.root, 'is-pad-y', state.padTone === 'y');
    this.writers.setText(this.elements.keycap, state.keycap);
    this.writers.toggleClass(this.elements.keycap, 'is-holding', state.holding);
    this.writers.setStyleProp(
      this.elements.keycap,
      '--interact-hold-progress',
      state.holdProgress.toFixed(3),
    );
    this.writers.setText(this.elements.verb, state.verb);
    this.writers.setText(this.elements.name, state.targetName);
  }
}
