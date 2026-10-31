import {
  afterNextRender,
  booleanAttribute,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  type DragEngine,
  type DragEngineFactory,
  type DragOutcome,
  Marker,
  placeholder,
} from './drag';
import { MouseDrag } from './mouse-drag';
import type { ReorderItem } from './reorder-item';
import { REORDER_MESSAGES } from './reorder-messages';
import { gapY, slotFor } from './slots';

/** A move a list reports: the item's index before it (`from`) and after it (`to`); never equal. */
export interface ReorderMove {
  readonly from: number;
  readonly to: number;
}

/**
 * The drag engine for each `pointerType`. A press of any other kind starts nothing; a touch
 * engine, when there is one, goes here.
 */
const ENGINES: Readonly<Record<string, DragEngineFactory>> = {
  mouse: (context, press) => new MouseDrag(context, press),
  pen: (context, press) => new MouseDrag(context, press),
};

/** The keyboard move in progress: the item picked up, where it started and where it would land. */
interface KeyboardMove {
  readonly item: ReorderItem;
  readonly from: number;
  to: number;
  readonly marker: Marker;
  readonly restore: () => void;
}

let nextReorderListId = 0;

/**
 * A list whose items can be put in another order by hand: by dragging an item's handle
 * (`[uiReorderHandle]`, inside a `[uiReorderItem]`), or from the keyboard on a focused handle
 * (Space or Enter picks the item up, the arrows, Home and End move the marker, Space or Enter
 * drops, Escape or Tab cancels). It knows nothing of what the items are.
 *
 * It never moves the DOM or the data. A drop emits `reordered` with the item's index before and
 * after the move, and the owner moves its array; a drop where the item already was, a release
 * outside the list, Escape or a lost pointer emit `reorderCancelled`. Everything drawn during the
 * move is gone before either fires. When focus has fallen to `body` after the owner's render, the
 * handle of the item now at `to` gets it back.
 *
 * Items register through DI with the nearest list, and are indexed in DOM order, so lists nest:
 * a list inside an item moves only its own items. Each list holds a visually hidden polite live
 * region that announces every pick-up, move, drop and cancel (`REORDER_MESSAGES`), and the
 * instructions its handles are described by. The press is handed to the drag engine for its
 * `pointerType` (`mouse-drag.ts` for a mouse or a pen); `reorderDisabled` ignores every handle.
 *
 * ```html
 * <ul uiReorderList reorderLabel="Rows" (reordered)="move($event)">
 *   @for (row of rows(); track row.id) {
 *     <li uiReorderItem [reorderItemLabel]="row.name">
 *       <button type="button" uiReorderHandle aria-label="Move">⠿</button> {{ row.name }}
 *     </li>
 *   }
 * </ul>
 * ```
 */
@Directive({ selector: '[uiReorderList]' })
export class ReorderList {
  /** Whether the handles are ignored. */
  readonly reorderDisabled = input(false, { transform: booleanAttribute });
  /** The list's name in announcements. */
  readonly reorderLabel = input('list');
  /** An item was dropped at a new index. */
  readonly reordered = output<ReorderMove>();
  /** A move ended where it began, or was abandoned. */
  readonly reorderCancelled = output<void>();

  /** The id of the instructions every handle of this list is described by. */
  readonly instructionsId = `ui-reorder-list-${nextReorderListId++}-instructions`;
  /** The item being moved, by the pointer (once it is a drag) or the keyboard. */
  readonly moving = signal<ReorderItem | null>(null);

  private readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly injector = inject(Injector);
  private readonly registered = new Set<ReorderItem>();
  private live?: HTMLElement;
  private gesture?: DragEngine;
  private keyboard?: KeyboardMove;
  private destroyed = false;

  constructor() {
    afterNextRender(() => this.regions());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.gesture?.cancel();
      this.endKeyboard();
    });
  }

  /** The registered items, in DOM order. */
  items(): ReorderItem[] {
    return [...this.registered].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  }

  /** @internal An item joins the list (`ReorderItem`). */
  register(item: ReorderItem): void {
    this.registered.add(item);
  }

  /** @internal An item leaves the list; a move of it is cancelled. */
  unregister(item: ReorderItem): void {
    if (this.moving() === item) {
      this.gesture?.cancel();
      if (this.keyboard?.item === item) this.cancelKeyboard();
    }
    this.registered.delete(item);
  }

  /** @internal A `pointerdown` on `item`'s handle. */
  press(item: ReorderItem, handle: HTMLElement, event: PointerEvent): void {
    if (this.reorderDisabled() || !this.browser || this.gesture) return;
    if (this.keyboard) this.cancelKeyboard();
    const engine = ENGINES[event.pointerType];
    if (!engine || event.button !== 0) return;
    const from = this.items().indexOf(item);
    if (from < 0) return;
    this.gesture = engine(
      {
        document: this.document,
        list: this.element,
        item: item.element,
        handle,
        from,
        rects: () => this.items().map((each) => each.element.getBoundingClientRect()),
        started: () => this.moving.set(item),
        end: (outcome) => {
          this.gesture = undefined;
          this.moving.set(null);
          this.settle(item, from, outcome);
        },
      },
      event,
    );
  }

  /** @internal A `keydown` on `item`'s handle. */
  key(item: ReorderItem, event: KeyboardEvent): void {
    if (this.reorderDisabled() || !this.browser || this.gesture) return;
    const move = this.keyboard;
    const pick = event.key === ' ' || event.key === 'Enter';
    if (move?.item !== item) {
      if (!pick) return;
      event.preventDefault();
      if (event.repeat) return;
      if (move) this.cancelKeyboard();
      this.pickUp(item);
      return;
    }
    const last = this.registered.size - 1;
    switch (event.key) {
      case 'ArrowUp':
        return this.moveTo(event, move.to - 1);
      case 'ArrowDown':
        return this.moveTo(event, move.to + 1);
      case 'Home':
        return this.moveTo(event, 0);
      case 'End':
        return this.moveTo(event, last);
      case 'Escape':
        event.preventDefault();
        return this.cancelKeyboard();
      case 'Tab':
        // Focus moves on as usual; the move ends here.
        return this.cancelKeyboard();
    }
    if (!pick) return;
    event.preventDefault();
    if (event.repeat) return;
    const { from, to } = move;
    this.endKeyboard();
    this.settle(item, from, to === from ? { kind: 'cancel' } : { kind: 'drop', to });
  }

  /** @internal Focus left `item`'s handle: a keyboard move of it is cancelled. */
  blurred(item: ReorderItem): void {
    if (this.keyboard?.item === item) this.cancelKeyboard();
  }

  private pickUp(item: ReorderItem): void {
    const items = this.items();
    const from = items.indexOf(item);
    if (from < 0) return;
    this.keyboard = {
      item,
      from,
      to: from,
      marker: new Marker(this.document),
      restore: placeholder(item.element),
    };
    this.moving.set(item);
    this.document.defaultView?.addEventListener('scroll', this.drawKeyboard, { passive: true });
    this.drawKeyboard();
    this.announce(
      REORDER_MESSAGES.pickedUp(item.label(), from + 1, items.length, this.reorderLabel()),
    );
  }

  private moveTo(event: KeyboardEvent, to: number): void {
    event.preventDefault();
    const move = this.keyboard!;
    const items = this.items();
    move.to = Math.max(0, Math.min(items.length - 1, to));
    // The item just past the marker's gap, so the marker comes into view with it.
    const next = items[Math.min(slotFor(move.from, move.to), items.length - 1)];
    next?.element.scrollIntoView?.({ block: 'nearest' });
    this.drawKeyboard();
    this.announce(REORDER_MESSAGES.moved(move.to + 1, items.length));
  }

  /** Draws the keyboard marker at the gap the item would land in; its own gap is the one above it. */
  private readonly drawKeyboard = () => {
    const move = this.keyboard;
    if (!move) return;
    const rects = this.items().map((each) => each.element.getBoundingClientRect());
    const y = gapY(rects, slotFor(move.from, move.to));
    if (y === undefined) move.marker.hide();
    else move.marker.show(this.element.getBoundingClientRect(), y);
  };

  private cancelKeyboard(): void {
    const move = this.keyboard;
    if (!move) return;
    this.endKeyboard();
    this.settle(move.item, move.from, { kind: 'cancel' });
  }

  /** Takes the keyboard move's marker and placeholder away. */
  private endKeyboard(): void {
    const move = this.keyboard;
    if (!move) return;
    this.keyboard = undefined;
    this.document.defaultView?.removeEventListener('scroll', this.drawKeyboard);
    move.marker.remove();
    move.restore();
    this.moving.set(null);
  }

  /** Announces and reports a finished move; a click reports nothing. */
  private settle(item: ReorderItem, from: number, outcome: DragOutcome): void {
    if (this.destroyed || outcome.kind === 'click') return;
    if (outcome.kind === 'cancel') {
      this.announce(REORDER_MESSAGES.cancelled(item.label()));
      this.reorderCancelled.emit();
      return;
    }
    const { to } = outcome;
    this.announce(REORDER_MESSAGES.dropped(item.label(), to + 1, this.registered.size));
    this.reordered.emit({ from, to });
    afterNextRender(
      () => {
        const active = this.document.activeElement;
        if (active && active !== this.document.body) return;
        this.items()[to]?.handle?.focus();
      },
      { injector: this.injector },
    );
  }

  private announce(text: string): void {
    this.regions();
    if (this.live) this.live.textContent = text;
  }

  /** Adds the live region and the instructions to the host, once, in the browser. */
  private regions(): void {
    if (!this.browser || this.live || this.destroyed) return;
    const hidden = (tag: string) => {
      const node = this.document.createElement(tag);
      node.className = 'sr-only';
      node.setAttribute('data-reorder-region', '');
      this.element.append(node);
      return node;
    };
    const instructions = hidden('span');
    instructions.id = this.instructionsId;
    instructions.textContent = REORDER_MESSAGES.instructions;
    this.live = hidden('span');
    this.live.setAttribute('aria-live', 'polite');
  }
}
