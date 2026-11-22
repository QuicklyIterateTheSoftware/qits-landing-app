import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ReleaseRequestView } from '$patterns/release-requests/release-request-view/release-request-view';

/**
 * One release request under its repository, at
 * `/projects/<slug>/repositories/<repo>/release-requests/<requestId>` (qits-2506): the same view
 * as the project's request page (`app-release-request-view`), mounted with the repository, so its
 * back link and the other requests it names stay under the repository, and so do the trail and
 * the repository sidebar.
 */
@Component({
  selector: 'app-repository-release-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReleaseRequestView],
  host: { class: 'block' },
  template: `<app-release-request-view [repo]="repo()" />`,
})
export class RepositoryReleaseRequestPage {
  private readonly route = inject(ActivatedRoute);
  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The address's repository name. */
  protected readonly repo = computed(() => this.paramMap().get('repo') ?? '');
}
