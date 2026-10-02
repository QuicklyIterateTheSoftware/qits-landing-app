import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One ring: its radius, the dashes of its moving arc, and how long one turn takes. */
interface Ring {
  readonly r: number;
  readonly dash: string;
  readonly seconds: number;
}

/**
 * The loading indicator: five rings, each with an arc turning at its own speed.
 *
 * ```html
 * <ui-spinner class="size-8 text-gray-500" />
 * ```
 *
 * Size and colour come from the host's classes (the rings draw in `currentColor`). It is an image
 * named "Loading" (`role="img"`, `aria-label`), the alt text of an `<img>`. Drawn from
 * `spinner-multiple-2.svg`, inline rather than as an `<img>` so that it takes the text colour, and
 * so that a screenshot test can stop its animation (the browser test setup pauses every SVG).
 */
@Component({
  selector: 'ui-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    <svg viewBox="0 0 1000 1000" role="img" [attr.aria-label]="label()" class="block size-full">
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
  `,
})
export class Spinner {
  /** What the image says to assistive technology. */
  readonly label = input('Loading');

  protected readonly rings: readonly Ring[] = [
    { r: 160, dash: '500 2013', seconds: 5 },
    { r: 240, dash: '1000 1513', seconds: 4 },
    { r: 320, dash: '320 320', seconds: 2 },
    { r: 400, dash: '1500 1013', seconds: 5 },
    { r: 480, dash: '2000 513', seconds: 5 },
  ];
}
