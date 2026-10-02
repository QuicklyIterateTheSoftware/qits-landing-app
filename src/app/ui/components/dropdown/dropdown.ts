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
 * click outside or the button itself closes it too.
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
      class="absolute top-full right-0 z-20 mt-1 w-80 rounded-xl border border-gray-200 bg-white shadow-lg outline-none"
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
