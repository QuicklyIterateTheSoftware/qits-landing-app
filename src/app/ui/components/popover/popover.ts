import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

let nextPopoverId = 0;

/** Which edge of the trigger the panel lines up with. */
export type PopoverAlign = 'start' | 'end';

/** The kind of pointer a press came from: a mouse, or a finger or pen. */
type PointerKind = 'fine' | 'coarse';

/**
 * A small panel below its trigger. It shows while the pointer is over the trigger, or while the
 * keyboard focus is in it. For text that explains the trigger, not for things to click.
 *
 * ```html
 * <ui-popover #popover align="end">
 *   <button type="button" [attr.aria-describedby]="popover.panelId()">Dispatch</button>
 *   <div popover-content>…what it explains…</div>
 * </ui-popover>
 * ```
 *
 * The projected content is the trigger; `[popover-content]` goes in the panel. The panel is a
 * `role="tooltip"` with the id `panelId`: give it to the trigger's `aria-describedby`, so a screen
 * reader reads the panel as the trigger's description.
 *
 * CSS alone opens it (`group-hover`, `group-focus-within`). The panel is always rendered, so the
 * server and the browser render the same markup, and it works before hydration. It is `absolute`
 * below the host, and the pointer can move onto it without closing it. `align="end"` keeps the
 * panel of a trigger at the window's right edge inside the window. Escape closes it until the
 * pointer or the focus comes back.
 *
 * `tapToOpen` is for a trigger that is a link to what the panel previews (a work reference): a
 * finger or a pen has no hover, so there a **tap opens the panel** and is consumed —
 * `preventDefault()` and `stopPropagation()`, in the capture phase, so neither the trigger link
 * nor a link or row around the popover follows it. A second tap on the trigger, or a press
 * anywhere outside the popover, closes it; a link inside the panel navigates. A mouse and the
 * keyboard are left as above. The same behaviour as `@qits/ui-components`' `<qits-work-ref>`, so
 * a work reference behaves the same everywhere on the platform. A press tells its pointer by its
 * `pointerType` (`touch` or `pen`); a click without one (the keyboard) by
 * `matchMedia('(pointer: coarse)')`.
 */
@Component({
  selector: 'ui-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'group/popover relative inline-flex hover:z-20 focus-within:z-20',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointercancel)': 'pressing = undefined',
    '(pointerenter)': 'onPointerEnter($event)',
    '(focusin)': 'dismissed.set(false)',
    '(click)': 'onPanelClick($event)',
    '(document:keydown.escape)': 'onEscape()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
  template: `
    <ng-content />
    <div class="absolute top-full z-20 pt-1" [class]="panelClasses()" data-popover-panel>
      <div
        [id]="panelId()"
        role="tooltip"
        class="w-max max-w-xs rounded-lg border border-charcoal-brown-200 bg-white px-3 py-2 text-left text-sm font-normal whitespace-normal text-charcoal-brown-900 shadow-lg"
      >
        <ng-content select="[popover-content]" />
      </div>
    </div>
  `,
})
export class Popover {
  /** The panel's id, for the trigger's `aria-describedby`; unique unless given. */
  readonly panelId = input(`popover-${nextPopoverId++}`);

  /** The trigger's edge the panel lines up with: `start` (left) or `end` (right). */
  readonly align = input<PopoverAlign>('start');

  /** On a finger or a pen, a tap on the trigger opens the panel instead of following it. */
  readonly tapToOpen = input(false, { transform: booleanAttribute });

  protected readonly dismissed = signal(false);

  /** The pointer the latest press came from; `fine` until a finger or a pen presses. */
  private readonly pointer = signal<PointerKind>('fine');
  /** Opened by a tap (`tapToOpen`), until a second tap, a press outside or Escape. */
  private readonly tapped = signal(false);
  /** The kind of the press in progress, from its `pointerdown` until its `click`. */
  protected pressing: PointerKind | undefined;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly doc = inject(DOCUMENT);

  /** Whether the panel is open by a tap: what a spec, and the panel's classes, read. */
  readonly openedByTap = computed(() => this.tapped() && !this.dismissed());

  protected readonly panelClasses = computed(() => {
    const edge = this.align() === 'end' ? 'right-0' : 'left-0';
    if (this.dismissed()) return `${edge} hidden`;
    // After a finger's press, hover and focus are the tap's leftovers (a touch screen keeps
    // `:hover` on what it tapped): only the tap opens and closes the panel.
    if (this.tapToOpen() && this.pointer() === 'coarse') {
      return `${edge} ${this.tapped() ? 'block' : 'hidden'}`;
    }
    return `${edge} hidden group-focus-within/popover:block group-hover/popover:block`;
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // The capture phase, so the tap is consumed before the trigger link (a `routerLink`) sees it.
    const host = this.host.nativeElement;
    const capture = (event: MouseEvent) => this.onTriggerClick(event);
    host.addEventListener('click', capture, { capture: true });
    inject(DestroyRef).onDestroy(() =>
      host.removeEventListener('click', capture, { capture: true }),
    );
  }

  protected onPointerDown(event: PointerEvent): void {
    this.pressing = isCoarse(event.pointerType) ? 'coarse' : 'fine';
    this.pointer.set(this.pressing);
  }

  protected onPointerEnter(event: PointerEvent): void {
    this.dismissed.set(false);
    if (event.pointerType === 'mouse') this.pointer.set('fine');
  }

  protected onEscape(): void {
    this.tapped.set(false);
    this.dismissed.set(true);
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.tapped()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.tapped.set(false);
  }

  /** A click on the trigger (capture phase): a tap opens or closes the panel, and goes no further. */
  private onTriggerClick(event: MouseEvent): void {
    const kind = this.pressing ?? (this.coarseDevice() ? 'coarse' : 'fine');
    this.pressing = undefined;
    if (!this.tapToOpen() || kind !== 'coarse' || this.inPanel(event)) return;
    event.preventDefault();
    event.stopPropagation();
    this.pointer.set('coarse');
    this.dismissed.set(false);
    this.tapped.set(!this.tapped());
  }

  /**
   * A click inside an open panel (bubbling, so the panel's own link has had it): it goes no further
   * than the popover, so a link or row around it does not follow it as well. A link in the panel
   * navigates and closes the panel; anything else in it does nothing.
   */
  protected onPanelClick(event: MouseEvent): void {
    if (!this.tapped() || !this.inPanel(event)) return;
    event.stopPropagation();
    if ((event.target as Element).closest?.('a')) this.tapped.set(false);
    else event.preventDefault();
  }

  /** Whether `event` happened in this popover's own panel (not in a popover nested in it). */
  private inPanel(event: Event): boolean {
    const target = event.target as Node | null;
    const panel = this.host.nativeElement.querySelector(':scope > [data-popover-panel]');
    return !!target && !!panel?.contains(target);
  }

  private coarseDevice(): boolean {
    return !!this.doc.defaultView?.matchMedia?.('(pointer: coarse)').matches;
  }
}

function isCoarse(pointerType: string): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}
