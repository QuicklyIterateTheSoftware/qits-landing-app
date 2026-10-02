import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One ring: its radius, the dashes of its moving arc, and how long one turn takes. */
interface Ring {
  readonly r: number;
  readonly dash: string;
  readonly seconds: number;
}

/** Where the wrapped content's data is: still coming, failed, or there. */
export type LoadState = 'loading' | 'error' | 'loaded';

/**
 * Shows the load state of what it wraps. While `state` is `loading`, the spinner icon sits centred
 * over the content on a 30% white veil, and the content is marked busy; on `error`, an error icon
 * takes its place and the content stays as it was before it loaded. On `loaded`, nothing is drawn.
 *
 * ```html
 * <ui-spinner [state]="state()">
 *   <ui-stat label="Components">{{ count() ?? '–' }}</ui-stat>
 * </ui-spinner>
 * ```
 *
 * The content keeps its size, so nothing moves when the answer arrives. Errors are told by the
 * icon (named "Failed to load"), never by text in the content. The icon is drawn from
 * `spinner-multiple-2.svg` (five rings turning at their own speeds), inline rather than as an
 * `<img>` so that it takes the text colour and a screenshot test can stop it (the browser test
 * setup pauses every SVG). It is an image named "Loading", the alt text of an `<img>`.
 */
@Component({
  selector: 'ui-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block', '[attr.aria-busy]': "state() === 'loading'" },
  template: `
    <ng-content />
    @if (state() === 'error') {
      <div class="absolute inset-0 flex items-center justify-center bg-white/30 p-1 text-red-600">
        <svg
          viewBox="0 0 24 24"
          role="img"
          [attr.aria-label]="errorLabel()"
          class="block size-12 max-h-full max-w-full"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 7v6" />
          <path d="M12 17h.01" />
        </svg>
      </div>
    } @else if (state() === 'loading') {
      <div class="absolute inset-0 flex items-center justify-center bg-white/30 p-1 text-gray-500">
        <svg
          viewBox="0 0 1000 1000"
          role="img"
          [attr.aria-label]="label()"
          class="block size-12 max-h-full max-w-full"
        >
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
  /** The content's load state. */
  readonly state = input<LoadState>('loading');

  /** What the loading icon says to assistive technology. */
  readonly label = input('Loading');

  /** What the error icon says to assistive technology. */
  readonly errorLabel = input('Failed to load');

  protected readonly rings: readonly Ring[] = [
    { r: 160, dash: '500 2013', seconds: 5 },
    { r: 240, dash: '1000 1513', seconds: 4 },
    { r: 320, dash: '320 320', seconds: 2 },
    { r: 400, dash: '1500 1013', seconds: 5 },
    { r: 480, dash: '2000 513', seconds: 5 },
  ];
}
