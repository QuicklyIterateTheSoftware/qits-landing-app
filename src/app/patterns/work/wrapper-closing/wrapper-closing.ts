import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { exit, itemMark, outcomes, QitsExit, sourceMark } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { closingLineOf } from '$core/work/wrapper-closing';
import { WrapperClosings } from '$core/work/wrapper-closings';
import { WRAPPER_CLOSINGS } from '$core/work/wrapper-closings.operations';

/**
 * A VERIFIED ticket's quiet line on how it will close (qits-1873), in place of a finish button
 * (qits-150): its row of the open project's wrapper closings (`WrapperClosings`, matched by
 * the ticket's qualified id), in words (`closingLineOf`): "Closes with <request>, pending", "Closes
 * now: <request> finalized", "Waits for its wrapper release request", or, in the warning tone, "Its
 * wrapper request <request> ended without proof, so it cannot close by itself". The request links
 * to its page, `/projects/<slug>/release-requests/<qualified id>`, through the declared exit
 * `open-closing-request` `open` (epic qits-2000). While the closings are not
 * loaded, failed, or name no row for the ticket: "Closes once its release lands".
 *
 * The line asks for the open project's closings itself (`WrapperClosings.want`, one root
 * `qitsResource`, in the browser only: the server render holds no token to send), once per project
 * however many lines show: drawn only for a VERIFIED ticket, it is what makes a page read them. The
 * list item and the ticket's page draw it; the page or layout around them keeps the closings
 * current (`WrapperClosings.follow`).
 *
 * The link is positioned above the rest (`relative z-10`), so in a list item it sits over the
 * card's stretched link and takes its own clicks.
 *
 * `display: contents`, so its one span is itself the item of the row it is put in; the font size
 * is the host's (`class="text-[0.6875rem]"` in a list).
 */
@Component({
  selector: 'app-wrapper-closing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsExit],
  host: { class: 'contents' },
  template: `
    @let l = line();
    <span
      [attr.data-qits-source]="source"
      [attr.data-qits-item]="item()"
      data-qits-derived="verdict step requestQualifiedId requestState approval"
      [class]="l.warning ? 'text-warning' : 'text-fg-muted'"
      [attr.data-warning]="l.warning || null"
      >{{ l.before
      }}<a
        class="relative z-10 text-accent underline"
        data-qits-field="requestQualifiedId"
        [class.hidden]="!l.request"
        [qitsExit]="opening.open"
        [exitParams]="params()"
        >{{ l.request }}</a
      >{{ l.after }}</span
    >
  `,
})
export class WrapperClosingLine {
  /** The ticket's qualified id, e.g. `qits-1873`. */
  readonly qualifiedId = input.required<string>();

  private readonly selected = inject(SelectedProject);
  private readonly closings = inject(WrapperClosings);

  protected readonly line = computed(() =>
    closingLineOf(this.closings.closingOf(this.qualifiedId())),
  );

  /**
   * Its data marks (qits-2141), as plain attributes (the closings are a root service's read): the
   * ticket's row of `WRAPPER_CLOSINGS` (by `ticket`, its qualified id), the line derived from it.
   */
  protected readonly source = sourceMark(WRAPPER_CLOSINGS);
  protected readonly item = computed(() => itemMark('ticket', this.qualifiedId()));

  protected readonly opening = outcomes('open-closing-request', {
    open: exit('projects/:slug/release-requests/:requestId'),
  });

  /** The request's page's params; the link is hidden while the line names no request. */
  protected readonly params = computed(() => ({
    slug: this.selected.slug() ?? '',
    requestId: this.line().request ?? '',
  }));

  constructor() {
    this.closings.want();
  }
}
