import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

let nextDropdownId = 0;

/**
 * A button that opens a panel below it: the top bar's menus.
 *
 * ```html
 * <ui-dropdown label="Notifications" panelLabel="Recent events" (opened)="load()">
 *   <svg dropdown-trigger …></svg>
 *   <div dropdown-panel>…</div>
 * </ui-dropdown>
 * ```
 *
 * It knows nothing about what it shows: the trigger's content (an icon, a badge) and the panel's
 * content are projected. `opened` fires each time the panel opens, so a menu can load what it shows
 * the first time and not before.
 *
 * The panel is always rendered and shown or hidden by class, so a server-rendered page hydrates
 * without leftovers. The button carries `aria-haspopup`, `aria-expanded` and `aria-controls`.
 * Opening moves the focus into the panel; Escape closes it and returns the focus to the button; a
 * click outside or the button itself closes it too. A link in the panel calls `close()` as it
 * navigates.
 *
 * `align` says which edge of the button the panel hangs from. `end` (the default, the top bar's
 * menus at the right end) lines its right edge up with the button's and gives it a fixed width.
 * `start` lines its left edge up with the button's and lets it take the width of its content, but
 * never more than the window less a margin, so a panel opened near the left edge stays on screen.
 *
 * Below 768px either way the panel leaves the button: it is fixed to the window as a sheet under
 * the top bar, the window's full width, from `--app-header-h` down (0 where that is unset), no
 * taller than the rest of the window and scrolling within itself, square and without side borders.
 * A 320px panel hung from a menu at a phone's right end would start off the screen's left edge.
 */
@Component({
  selector: 'ui-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-flex',
    '(document:click)': 'closeIfOutside($event)',
    '(document:keydown.escape)': 'closeAndFocus()',
  },
  template: `
    <button
      #button
      type="button"
      class="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 aria-expanded:bg-gray-100 aria-expanded:text-gray-900"
      [attr.aria-label]="label()"
      aria-haspopup="true"
      [attr.aria-controls]="panelId()"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      <ng-content select="[dropdown-trigger]" />
    </button>
    <div
      #panel
      [id]="panelId()"
      tabindex="-1"
      class="absolute top-full z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg outline-none max-md:fixed max-md:inset-x-0 max-md:top-(--app-header-h,0px) max-md:mt-0 max-md:max-h-[calc(100dvh_-_var(--app-header-h,0px))] max-md:w-auto max-md:max-w-none max-md:overflow-y-auto max-md:rounded-none max-md:border-x-0"
      [class]="align() === 'start' ? 'left-0 w-max max-w-[calc(100vw-4rem)]' : 'right-0 w-80'"
      [class.hidden]="!open()"
      role="region"
      [attr.aria-label]="panelLabel()"
    >
      <ng-content select="[dropdown-panel]" />
    </div>
  `,
})
export class Dropdown {
  /** The button's accessible name. */
  readonly label = input.required<string>();

  /** The panel's accessible name. */
  readonly panelLabel = input.required<string>();

  /** The panel's id, which the button's `aria-controls` names; unique unless given. */
  readonly panelId = input(`dropdown-${nextDropdownId++}`);

  /** Which edge of the button the panel lines up with: `end` (fixed width) or `start` (fits). */
  readonly align = input<'start' | 'end'>('end');

  /** Fires each time the panel opens. */
  readonly opened = output<void>();

  protected readonly open = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected toggle(): void {
    const opening = !this.open();
    this.open.set(opening);
    if (opening) {
      this.opened.emit();
      queueMicrotask(() => this.panel().nativeElement.focus());
    }
  }

  /** Closes the panel; the focus stays where it is. */
  close(): void {
    this.open.set(false);
  }

  protected closeIfOutside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected closeAndFocus(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.button().nativeElement.focus();
  }
}
