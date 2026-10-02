import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One ring: its radius, the dashes of its moving arc, and how long one turn takes. */
interface Ring {
  readonly r: number;
  readonly dash: string;
  readonly seconds: number;
}

/**
 * Shows that what it wraps is still loading: while `loading` is true, the spinner icon sits
 * centred over the content, on a 30% white veil, and the content is marked busy.
 *
 * ```html
 * <ui-spinner [loading]="count() === undefined">
 *   <ui-stat label="Components">{{ count() ?? '–' }}</ui-stat>
 * </ui-spinner>
 * ```
 *
 * The content keeps its size, so nothing moves when the answer arrives. The icon is drawn from
 * `spinner-multiple-2.svg` (five rings turning at their own speeds), inline rather than as an
 * `<img>` so that it takes the text colour and a screenshot test can stop it (the browser test
 * setup pauses every SVG). It is an image named "Loading", the alt text of an `<img>`.
 */
@Component({
  selector: 'ui-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block', '[attr.aria-busy]': 'loading()' },
  template: `
    <ng-content />
    @if (loading()) {
      <div class="absolute inset-0 flex items-center justify-center bg-white/30 text-gray-500">
        <svg viewBox="0 0 1000 1000" role="img" [attr.aria-label]="label()" class="block size-8">
          @for (ring of rings; track ring.r) {
            <circle
              cx="500"
              cy="500"
              [attr.r]="ring.r"
              fill="none"
              stroke="currentColor"
              stroke-width="5"
            />
            <circle
              cx="500"
              cy="500"
              [attr.r]="ring.r"
              fill="none"
              stroke="currentColor"
              stroke-width="20"
              stroke-linecap="square"
              [attr.stroke-dasharray]="ring.dash"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 500 500"
                to="-360 500 500"
                [attr.dur]="ring.seconds + 's'"
                repeatCount="indefinite"
              />
            </circle>
          }
        </svg>
      </div>
    }
  `,
})
export class Spinner {
  /** Whether the content is still loading. */
  readonly loading = input(true);

  /** What the icon says to assistive technology. */
  readonly label = input('Loading');

  protected readonly rings: readonly Ring[] = [
    { r: 160, dash: '500 2013', seconds: 5 },
    { r: 240, dash: '1000 1513', seconds: 4 },
    { r: 320, dash: '320 320', seconds: 2 },
    { r: 400, dash: '1500 1013', seconds: 5 },
    { r: 480, dash: '2000 513', seconds: 5 },
  ];
}
