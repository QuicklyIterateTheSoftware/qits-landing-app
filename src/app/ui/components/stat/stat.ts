import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One labelled figure: a light tile with the label in a folder tab at its top left, and the value
 * large and right-aligned below it.
 *
 * ```html
 * <ui-stat label="Components">52</ui-stat>
 * ```
 *
 * The value is projected content, so it can be a number, a loading text or something richer.
 * Label and value are a `<dt>`/`<dd>` pair. The tab's sloped edge is an inline SVG next to the
 * label, hidden from assistive technology: it scales with the label's height and needs no CSS of
 * its own, which a clip-path or a pseudo-element could not offer as simply.
 */
@Component({
  selector: 'ui-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <dl class="rounded-md bg-gray-200">
      <div>
        <dt class="flex items-stretch">
          <span
            class="rounded-tl-md bg-gray-300 py-0.5 pl-2 text-xs leading-4 font-semibold text-gray-800"
          >
            {{ label() }}
          </span>
          <svg
            aria-hidden="true"
            class="w-5 shrink-0 text-gray-300"
            viewBox="0 0 20 20"
            preserveAspectRatio="none"
          >
            <path d="M0 0 H6 C13 0 9 20 20 20 H0 Z" fill="currentColor" />
          </svg>
        </dt>
        <dd class="px-3 pt-1 pb-2 text-right text-2xl leading-8 font-semibold tabular-nums">
          <ng-content />
        </dd>
      </div>
    </dl>
  `,
})
export class Stat {
  readonly label = input.required<string>();
}
