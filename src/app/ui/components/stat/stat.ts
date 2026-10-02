import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

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
          class="w-fit min-w-1/2 bg-gray-300 py-0.5 text-xs leading-4 font-semibold text-gray-800"
          [class]="mirrored() ? 'ml-auto rounded-bl-lg pr-2 pl-3' : 'rounded-br-lg pr-3 pl-2'"
        >
          {{ label() }}
        </dt>
        <dd
          class="px-3 pt-1 pb-2 text-2xl leading-8 font-semibold tabular-nums"
          [class]="mirrored() ? 'text-left' : 'text-right'"
        >
          <ng-content />
        </dd>
      </div>
    </dl>
  `,
})
export class Stat {
  readonly label = input.required<string>();

  /** Mirrors the tile: the tab at the top right, rounded at its bottom left, the value on the left. */
  readonly mirrored = input(false, { transform: booleanAttribute });
}
