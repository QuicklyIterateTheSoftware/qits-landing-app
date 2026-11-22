import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { sourceMark } from '@qits/angular';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { PROJECT_RELEASE_REQUESTS } from '$core/projects/projects.operations';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner } from '$ui/components/spinner/spinner';
import { ReleaseRequestRow } from '$patterns/release-requests/release-request-row/release-request-row';

/**
 * The open project's release requests, at `/projects/<slug>/release-requests`: everything still
 * open across its repositories, then the last few finalized, as qits-projects answers them (open
 * ones first, each part most recently changed first). A request is open until its release is
 * finalized, so a released row is still in flight.
 *
 * Each row (`app-release-request-row`) shows one request: its state, priority, logical id, what it
 * carries, its freeze, its lifecycle, what in it needs a person, and Withdraw (see the row).
 *
 * The requests are the shell's (`ProjectReleaseRequests`, qits-2146): the same `qitsResource` the
 * top bar's release menu and the sidebar entry read, one request for all of them. A read that
 * fails says so, with Retry. The list names that read as its source (`data-qits-source`, a plain
 * attribute: the page holds no resource of its own to mark it with), and each row marks its
 * request, traced from the row's input.
 *
 * Staleness (qits-1270): `RELEASE_REQUEST_EVENTS` about the open project → its release requests,
 * the shell's resource's `refreshOn` (`ProjectReleaseRequests`, which lives at least as long as
 * the page). The page subscribes no second time: the same answer read twice per burst would only
 * double the call. A refresh keeps the rows on show (no spinner).
 */
@Component({
  selector: 'app-release-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadFailure, PageLayoutComponent, ReleaseRequestRow, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Release Requests">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The open requests plus the last finalized ones, across all of this project’s repositories.
          A request stays open until its release is finalized.
        </p>
        <ui-load-failure
          message="This project’s release requests could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul class="m-0 flex list-none flex-col gap-2 p-0" [attr.data-qits-source]="source">
            @for (request of requests(); track request.id) {
              <li app-release-request-row [request]="request" [slug]="slug()"></li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && requests().length === 0 ? 'block' : 'hidden'"
          >
            Nothing is open in this project, and no release has been finalized recently.
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ReleaseRequestsPage {
  private readonly selected = inject(SelectedProject);
  private readonly shared = inject(ProjectReleaseRequests);

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The read the list shows, as its data mark names it. */
  protected readonly source = sourceMark(PROJECT_RELEASE_REQUESTS);

  protected readonly requests = this.shared.requests;

  protected readonly state = this.shared.state;

  /** Reads the list again after a failed read. */
  protected retry(): void {
    this.shared.resource.reload();
  }
}
