import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { QitsExit, type ExitOutcome } from '@qits/angular';
import { tagColour } from '$ui/components/tag/tag-colour';

/** How a tag link looks: a tag (`ui-tag`), or a bubble in a card's bottom-right corner. */
export type TagLinkVariant = 'tag' | 'corner';

/**
 * A small label that is a link to a declared exit (`exit`, with its `exitParams`): the pattern
 * that draws it declares the exit, and the link carries its mark (`[qitsExit]`).
 *
 * - `tag`: drawn like `ui-tag`, its background coloured from its text (`tagColour`). Where the
 *   row is too narrow (a card), its text wraps, so it never overflows.
 * - `corner`: the mirror of `ui-board-card`'s kind chip, for the card's `[card-corner]` slot. Only
 *   its top-left corner is rounded, and its negative margins take it flush into the card body's
 *   bottom-right corner (the body has `p-2`). It takes a line of its own, so it never covers text.
 *   `--card-corner-inset` (set by the card) moves it that far left of the corner.
 *
 * `shown` is switched by class, never by `@if`, so a server render hydrates as is. The host is
 * positioned, so the link sits above a card's or row's stretched link and takes its own clicks.
 * `describedBy` goes to the link's `aria-describedby` (a `ui-popover`'s `panelId`).
 */
@Component({
  selector: 'ui-tag-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsExit],
  host: {
    class: 'relative z-10',
    '[class]': 'hostClasses()',
  },
  template: `
    <a
      class="block text-[0.6875rem] no-underline hover:underline"
      [class]="linkClasses()"
      [style.background-color]="colour()"
      [qitsExit]="exit()"
      [exitParams]="exitParams()"
      [attr.aria-describedby]="describedBy() ?? null"
      >{{ label() }}</a
    >
  `,
})
export class TagLink {
  readonly label = input.required<string>();
  /** Where the link leads: an exit the pattern drawing it declares. */
  readonly exit = input.required<ExitOutcome>();
  /** The exit's path params. */
  readonly exitParams = input<Readonly<Record<string, string | number>> | undefined>(undefined);
  readonly variant = input<TagLinkVariant>('tag');
  readonly shown = input(true, { transform: booleanAttribute });
  readonly describedBy = input<string | undefined>(undefined);

  protected readonly hostClasses = computed(() => {
    if (!this.shown()) return 'hidden';
    return this.variant() === 'corner'
      ? 'mt-1 mr-[calc(var(--card-corner-inset,0rem)-0.5rem)] -mb-2 ml-auto block w-fit'
      : 'inline-block';
  });

  protected readonly linkClasses = computed(() =>
    this.variant() === 'corner'
      ? 'rounded-tl-md bg-accent-soft px-[0.65rem] py-[0.1625rem] whitespace-nowrap text-accent'
      : 'px-2.5 leading-4 font-medium wrap-anywhere text-fg',
  );

  protected readonly colour = computed(() =>
    this.variant() === 'tag' ? tagColour(this.label()) : null,
  );
}
