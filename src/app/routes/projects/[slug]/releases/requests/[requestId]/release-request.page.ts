import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReleaseRequestView } from '$patterns/release-requests/release-request-view/release-request-view';

/**
 * One release request, at `/projects/<slug>/release-requests/<requestId>`: the release request
 * view (`app-release-request-view`, shared with a repository's route since qits-2506), in the
 * project's scope.
 */
@Component({
  selector: 'app-release-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReleaseRequestView],
  host: { class: 'block' },
  template: `<app-release-request-view />`,
})
export class ReleaseRequestPage {}
