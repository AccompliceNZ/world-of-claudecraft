// The HISTORY view of the Bank window's Guild pane: a plain-language
// transaction history of what officers have done with the guild's shared
// property, painted from the structured GuildBankLogPaneModel
// (guild_bank_log_view.ts). The pure core decides the pane state, the pressed
// filter chip, which SENTENCE each row is, and what the footer offers; this
// thin consumer crosses the i18n boundary (wording, formatMoney, the date
// formatter) and wires the two controls (the chip strip, the show-older
// button) back to the pane through its deps, nothing else.
//
// Composed by GuildBankTab (guild_bank_window.ts), which owns the Contents/
// History sub-strip, the selected filter, and the on-demand fetch trigger.
// Cold-pane contract (the bank_window cold-bucket rules): no forced-reflow
// layout read, no repeating driver of its own, and no raw hex.
//
// PLAYER-AUTHORED TEXT: a row's actor is a character name. It is spliced into a
// TEXT sink (textContent on a fresh node, never innerHTML), so the DOM escapes
// it by construction and it never passes through t() as a key. That is also why
// the whole row is built node by node rather than as an HTML string: there is
// no markup in a log line worth the risk of getting one esc() wrong on a
// surface whose entire job is to be trusted.
//
// THE THREE NON-ROW STATES ARE ALL RENDERED, and none of them is an empty list:
// loading says it is loading, a refusal says the read was declined, and an
// empty history says so in words (and says "under this filter" when a filter
// is on, because an empty Items slice is not an untouched bank). A drained
// guild bank must never be able to look like an untouched one because a frame
// went missing.

import type { ItemDef } from '../sim/types';
import type { GuildBankLogKind } from '../world_api';
import { itemDisplayName } from './entity_i18n';
import type {
  GuildBankLogFilterModel,
  GuildBankLogFooter,
  GuildBankLogPaneModel,
  GuildBankLogRowKind,
  GuildBankLogRowModel,
} from './guild_bank_log_view';
import { formatDateTime, formatMoney, formatNumber, type TranslationKey, t } from './i18n';

/** The sentence key per row kind. Exhaustive over the core's discriminator, so
 *  a new kind cannot ship without its own line of copy. */
const ROW_KEY: Record<GuildBankLogRowKind, TranslationKey> = {
  depositItem: 'hudChrome.bank.logDepositItem',
  withdrawItem: 'hudChrome.bank.logWithdrawItem',
  depositMoney: 'hudChrome.bank.logDepositMoney',
  withdrawMoney: 'hudChrome.bank.logWithdrawMoney',
  buySlots: 'hudChrome.bank.logBuySlots',
  openBank: 'hudChrome.bank.logOpenBank',
  charterFee: 'hudChrome.bank.logCharterFee',
  adminPurge: 'hudChrome.bank.logAdminPurge',
};

/** The chip label per filter kind. Exhaustive over the seam's vocabulary. */
const FILTER_KEY: Record<GuildBankLogKind, TranslationKey> = {
  all: 'hudChrome.bank.logFilterAll',
  items: 'hudChrome.bank.logFilterItems',
  money: 'hudChrome.bank.logFilterMoney',
};

export interface GuildBankLogPaneDeps {
  /** Item table lookup (knownItemDef, never a raw index: a prototype key
   *  indexes to a truthy Function). Undefined means the def is gone. */
  itemDef(itemId: string): ItemDef | undefined;
  /** A filter chip was pressed: the owner remembers the kind and repaints
   *  (the next read under that kind is what requests it). */
  selectFilter(kind: GuildBankLogKind): void;
  /** The show-older button was pressed: the owner asks the world for the
   *  next page and repaints (the footer flips to its loading line). */
  loadOlder(): void;
}

export class GuildBankLogPane {
  // The pane state the last paint ANNOUNCED, so a repeated repaint (any officer
  // op rebuilds this window) cannot re-announce the same refusal over and over.
  private lastAnnounced: GuildBankLogPaneModel['kind'] | null = null;

  constructor(private readonly deps: GuildBankLogPaneDeps) {}

  /** Append the history view's sections to the pane root. */
  renderInto(el: HTMLElement, model: GuildBankLogPaneModel): void {
    const wrap = document.createElement('div');
    wrap.className = 'gbank-log';
    // The chip strip renders on EVERY state, so a viewer can leave an empty
    // slice or a refusal by pressing another chip, and so the strip never
    // jumps in and out between paints.
    wrap.appendChild(this.buildFilters(model.filters));
    if (model.kind !== 'rows') {
      const notice = this.buildNotice(model);
      wrap.appendChild(notice);
      el.appendChild(wrap);
      this.announce(notice, model.kind);
      return;
    }
    this.lastAnnounced = model.kind;
    // The scope line is always-visible TEXT, not a tooltip: a player reading a
    // trust surface has to know how many rows are on screen and that they run
    // newest first; the FOOTER says whether older rows exist, so an absent row
    // never reads as proof that nothing happened.
    const note = document.createElement('div');
    note.className = 'gbank-log-note';
    note.textContent = t('hudChrome.bank.logShowing', { count: this.count(model.rows.length) });
    wrap.appendChild(note);
    // .bank-scroll is the window's one scroll-region class; BankWindow captures
    // and restores its offset (and scopes that restore to one pane), so the log
    // list must use it rather than inventing a second scroller. The footer
    // rides INSIDE the scroller, after the rows: "show older" belongs at the
    // bottom of the list a reader has just scrolled to the end of.
    const scroll = document.createElement('div');
    scroll.className = 'bank-scroll';
    const list = document.createElement('ul');
    list.className = 'gbank-log-list';
    list.setAttribute('aria-label', t('hudChrome.bank.logAria'));
    for (const row of model.rows) list.appendChild(this.buildRow(row));
    scroll.appendChild(list);
    scroll.appendChild(this.buildFooter(model.footer));
    wrap.appendChild(scroll);
    el.appendChild(wrap);
  }

  // The filter chip strip: a labelled GROUP of toggle buttons (aria-pressed),
  // the armory_inspect mode-toggle family, never a third nested tablist (the
  // pane already sits inside two) and never colour alone for the pressed state
  // (the attribute carries it; the class only styles it).
  private buildFilters(filters: GuildBankLogFilterModel[]): HTMLElement {
    const strip = document.createElement('div');
    strip.className = 'gbank-log-filters';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', t('hudChrome.bank.logFilterAria'));
    for (const filter of filters) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `gbank-log-filter${filter.selected ? ' on' : ''}`;
      chip.dataset.kind = filter.kind;
      chip.setAttribute('aria-pressed', filter.selected ? 'true' : 'false');
      chip.textContent = t(FILTER_KEY[filter.kind]);
      chip.addEventListener('click', () => {
        if (!filter.selected) this.deps.selectFilter(filter.kind);
      });
      strip.appendChild(chip);
    }
    return strip;
  }

  // The list's tail: the show-older control, its in-flight line, or the
  // start-of-history line. All three are TEXT a reader meets at the end of
  // the rows, so "the list stopped here" is never ambiguous.
  private buildFooter(footer: GuildBankLogFooter): HTMLElement {
    const foot = document.createElement('div');
    foot.className = `gbank-log-foot gbank-log-foot-${footer}`;
    if (footer === 'older') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gbank-log-older';
      btn.textContent = t('hudChrome.bank.logOlder');
      btn.addEventListener('click', () => this.deps.loadOlder());
      foot.appendChild(btn);
      return foot;
    }
    foot.textContent =
      footer === 'loading' ? t('hudChrome.bank.logOlderLoading') : t('hudChrome.bank.logEnd');
    if (footer === 'loading') {
      foot.setAttribute('role', 'status');
      foot.setAttribute('aria-live', 'polite');
    }
    return foot;
  }

  // The loading / refused / empty line. One node shape for all three so the
  // pane's height and focus behaviour do not jump between them.
  private buildNotice(model: Exclude<GuildBankLogPaneModel, { kind: 'rows' }>): HTMLElement {
    const line = document.createElement('div');
    line.className = `bank-empty gbank-log-notice gbank-log-${model.kind}`;
    line.textContent = this.noticeText(model);
    if (model.kind !== 'empty') {
      line.setAttribute('role', 'status');
      line.setAttribute('aria-live', 'polite');
    }
    return line;
  }

  private noticeText(model: Exclude<GuildBankLogPaneModel, { kind: 'rows' }>): string {
    switch (model.kind) {
      case 'loading':
        return t('hudChrome.bank.logLoading');
      case 'refused':
        return t('hudChrome.bank.logUnavailable');
      case 'empty':
        // An empty FILTERED slice is worded as such: "nothing has been moved"
        // would be false about a bank whose money moved while Items is pressed.
        return model.filtered ? t('hudChrome.bank.logEmptyFiltered') : t('hudChrome.bank.logEmpty');
      default: {
        const unreachable: never = model;
        return String(unreachable);
      }
    }
  }

  // Make the refusal ACTUALLY announce. A live region is announced when its
  // content CHANGES while the region is already in the accessibility tree; a
  // region inserted already-populated (which is what a full window rebuild
  // produces every time) generally is not announced at all, so the attributes
  // alone were decoration. Re-writing the same text one task later is a real
  // mutation on a live region that by then exists, and it is invisible to
  // sighted players because no paint happens in between.
  //
  // Only on a CHANGE of pane state, and only for the refusal: the refusal is
  // the one that can replace a history somebody is reading (a demotion
  // mid-view), and this window repaints on any officer's op, so announcing
  // unconditionally would nag. A one-shot timeout, never a repeating driver.
  // A late fire onto a node the next repaint already detached is harmless.
  private announce(node: HTMLElement, kind: GuildBankLogPaneModel['kind']): void {
    const changed = this.lastAnnounced !== kind;
    this.lastAnnounced = kind;
    if (!changed || kind !== 'refused') return;
    const text = t('hudChrome.bank.logUnavailable');
    window.setTimeout(() => {
      node.textContent = '';
      node.appendChild(document.createTextNode(text));
    }, 0);
  }

  private buildRow(row: GuildBankLogRowModel): HTMLElement {
    const li = document.createElement('li');
    li.className = 'gbank-log-row';
    const time = document.createElement('span');
    time.className = 'gbank-log-time';
    // Through the i18n date formatter, so the locale decides ordering,
    // separators, and the 12/24 hour clock. Never a hand-built string.
    time.textContent = formatDateTime(row.at, { dateStyle: 'short', timeStyle: 'short' });
    const text = document.createElement('span');
    text.className = 'gbank-log-text';
    // textContent: the character name inside this sentence is player-authored
    // and is spliced verbatim into a text sink, which is the escape.
    text.textContent = this.sentence(row);
    li.append(time, text);
    return li;
  }

  private sentence(row: GuildBankLogRowModel): string {
    // A missing actor is a LOCALIZED stand-in, never an empty splice: a row
    // reading "  deposited 5 Iron Ore" would look like a rendering bug on the
    // one surface that has to look trustworthy. adminPurge has no actor slot in
    // its sentence at all (the operator is described, not named).
    const actor = row.actor ?? t('hudChrome.bank.logFormerMember');
    const key = ROW_KEY[row.kind];
    // EXHAUSTIVE, with no default arm: a default would silently route a future
    // kind into the money sentence and render formatMoney(0) for it.
    switch (row.kind) {
      case 'depositItem':
      case 'withdrawItem':
        return t(key, { actor, count: this.count(row.count), item: this.itemName(row.itemId) });
      case 'adminPurge':
        return t(key, { count: this.count(row.count), item: this.itemName(row.itemId) });
      case 'depositMoney':
      case 'withdrawMoney':
      case 'buySlots':
      case 'openBank':
      case 'charterFee':
        return t(key, { actor, amount: formatMoney(row.copper) });
      default: {
        const unreachable: never = row.kind;
        return String(unreachable);
      }
    }
  }

  private count(count: number): string {
    return formatNumber(count, { maximumFractionDigits: 0 });
  }

  // The item's localized display name; an id whose def a content update
  // removed falls back to the raw id, the bank-grid precedent (the id is the
  // only name that exists for it, and dropping the row would hide a movement).
  private itemName(itemId: string | null): string {
    if (itemId === null) return '';
    const def = this.deps.itemDef(itemId);
    return def ? itemDisplayName(def) : itemId;
  }
}
