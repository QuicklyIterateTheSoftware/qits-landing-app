import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { tagColour } from '$ui/components/tag/tag-colour';

/** How a tag link looks: a tag (`ui-tag`), or a bubble in a card's bottom-right corner. */
export type TagLinkVariant = 'tag' | 'corner';

/**
 * A small label that is a router link.
 *
 * - `tag`: drawn like `ui-tag`, its background coloured from its text (`tagColour`). Where the
 *   row is too narrow (a card), its text wraps, so it never overflows.
 * - `corner`: the mirror of `ui-board-card`'s kind chip, for the card's `[card-corner]` slot. Only
 *   its top-left corner is rounded, and its negative margins take it flush into the card body's
 *   bottom-right corner (the body has `p-2`). It takes a line of its own, so it never covers text.
 *
 * `shown` is switched by class, never by `@if`, so a server render hydrates as is. The host is
 * positioned, so the link sits above a card's or row's stretched link and takes its own clicks.
 * `describedBy` goes to the link's `aria-describedby` (a `ui-popover`'s `panelId`).
 */
@Component({
  selector: 'ui-tag-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    class: 'relative z-10',
    '[class]': 'hostClasses()',
  },
  template: `
    <a
      class="block text-[0.6875rem] no-underline hover:underline"
      [class]="linkClasses()"
      [style.background-color]="colour()"
      [routerLink]="link()"
      [attr.aria-describedby]="describedBy() ?? null"
      >{{ label() }}</a
    >
  `,
})
export class TagLink {
  readonly label = input.required<string>();
  /** Where the link leads, as a router link. */
  readonly link = input.required<string>();
  readonly variant = input<TagLinkVariant>('tag');
  readonly shown = input(true, { transform: booleanAttribute });
  readonly describedBy = input<string | undefined>(undefined);

  protected readonly hostClasses = computed(() => {
    if (!this.shown()) return 'hidden';
    return this.variant() === 'corner' ? 'mt-1 -mr-2 -mb-2 ml-auto block w-fit' : 'inline-block';
  });

  protected readonly linkClasses = computed(() =>
    this.variant() === 'corner'
      ? 'rounded-tl-md bg-ocean-deep-50 px-[0.65rem] py-[0.1625rem] whitespace-nowrap text-ocean-deep-800'
      : 'px-2.5 leading-4 font-medium wrap-anywhere text-charcoal-brown-950',
  );

  protected readonly colour = computed(() =>
    this.variant() === 'tag' ? tagColour(this.label()) : null,
  );
}
