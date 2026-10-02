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
 * Label and value are a `<dt>`/`<dd>` pair. The tile is square; only the tab's bottom-right
 * corner is rounded.
 */
@Component({
  selector: 'ui-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <dl class="bg-gray-200">
      <div>
        <dt
          class="w-fit rounded-br-lg bg-gray-300 py-0.5 pr-3 pl-2 text-xs leading-4 font-semibold text-gray-800"
        >
          {{ label() }}
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
