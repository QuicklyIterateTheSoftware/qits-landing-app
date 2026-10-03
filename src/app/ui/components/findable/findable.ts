import { Directive, input, output } from '@angular/core';

/**
 * Collapsed content that find-in-page still searches: while `uiFindable` (collapsed) is true the
 * element is `hidden="until-found"`, not hidden by CSS. The browser lays it out as
 * `content-visibility: hidden` (it takes no room and is not drawn), finds text in it, and fires
 * `beforematch` before it shows a match there; the directive emits that as `found`. The owner then
 * opens itself through its normal state, so the attribute follows that state again.
 *
 * The attribute is rendered on the server too, so a collapsed part hydrates as it is.
 */
@Directive({
  selector: '[uiFindable]',
  host: {
    '[attr.hidden]': "uiFindable() ? 'until-found' : null",
    '(beforematch)': 'found.emit()',
  },
})
export class Findable {
  /** Whether the content is collapsed. */
  readonly uiFindable = input.required<boolean>();
  /** Find-in-page is about to show a match inside the collapsed content. */
  readonly found = output<void>();
}
