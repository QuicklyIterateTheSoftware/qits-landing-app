import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { closingLineOf } from '$core/work/wrapper-closing';
import { WrapperClosingsStore } from '$core/work/wrapper-closings.store';
import { releaseRequestPath } from '$core/workspaces/agent-attention';

/**
 * A VERIFIED ticket's quiet line on how it will close (qits-1873), in place of a finish button
 * (qits-150): its row of the open project's wrapper closings (`WrapperClosingsStore`, matched by
 * the ticket's qualified id), in words (`closingLineOf`): "Closes with <request>, pending", "Closes
 * now: <request> finalized", "Waits for its wrapper release request", or, in the warning tone, "Its
 * wrapper request <request> ended without proof, so it cannot close by itself". The request links
 * to its page, `/projects/<slug>/release-requests/<qualified id>`. While the closings are not
 * loaded, failed, or name no row for the ticket: "Closes once its release lands".
 *
 * The line asks for the open project's closings itself, in the browser only (the server render
 * holds no token to send), once per project however many lines show: drawn only for a VERIFIED
 * ticket, it is what makes a page read them. The list item and the ticket's page draw it; the page
 * or layout around them keeps the closings current (`WrapperClosingsStore.follow`).
 *
 * `display: contents`, so its one span is itself the item of the row it is put in; the font size
 * is the host's (`class="text-[0.6875rem]"` in a list).
 */
@Component({
  selector: 'app-wrapper-closing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `
    @let l = line();
    <span
      [class]="l.warning ? 'text-sunflower-gold-800' : 'text-charcoal-brown-500'"
      [attr.data-warning]="l.warning || null"
      >{{ l.before
      }}<a
        class="text-ocean-deep-700 underline"
        [class.hidden]="!l.request"
        [routerLink]="link()"
        >{{ l.request }}</a
      >{{ l.after }}</span
    >
  `,
})
export class WrapperClosingLine {
  /** The ticket's qualified id, e.g. `qits-1873`. */
  readonly qualifiedId = input.required<string>();

  private readonly selected = inject(SelectedProject);
  private readonly store = inject(WrapperClosingsStore);

  protected readonly line = computed(() => {
    const projectId = this.selected.project()?.id;
    return closingLineOf(
      projectId ? this.store.closingOf(projectId, this.qualifiedId()) : undefined,
    );
  });

  /** The request's page; null while the line names none. */
  protected readonly link = computed(() => {
    const request = this.line().request;
    return request ? releaseRequestPath(this.selected.slug() ?? '', request) : null;
  });

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    // Only the project id is tracked: `load` reads the store's state.
    effect(() => {
      const id = this.selected.project()?.id;
      if (browser && id) untracked(() => void this.store.load(id));
    });
  }
}
