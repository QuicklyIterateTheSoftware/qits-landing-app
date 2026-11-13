import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { qitsResource } from '@qits/angular';
import { loadState } from '$core/resources/load-state';
import type { LoadState } from '$ui/components/spinner/spinner';
import { isPendingRelease, type ReleaseRequestEntry } from './projects.consumes';
import { PROJECT_RELEASE_REQUESTS } from './projects.operations';
import { affectsReleaseRequests, RELEASE_REQUEST_EVENTS } from './release-request-events';
import { SelectedProject } from './selected-project';

/**
 * The open project's release requests, as the shell reads them (qits-2146): the sidebar's Release
 * Requests line (its newest request), the trail's request crumb, and what an agent's wait on a
 * request shows (the agents menu, `app-agent-status`). One root service holding one `qitsResource`
 * over `PROJECT_RELEASE_REQUESTS`, read once the open project is known, in the browser only (the
 * server render has no session to send). A failed read again keeps the requests shown.
 *
 * The lightning menu and the Release Requests pages still read the same answer through
 * `ProjectsStore`, until they move over too (qits-2146's release request group); until then the
 * two reads are made apart.
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `RELEASE_REQUEST_EVENTS` about the open
 * project (`affectsReleaseRequests`: its `projectId`; a deployment while one of its requests is
 * RELEASED) → the requests, debounced 1 s, as the lightning menu reads `ProjectsStore`'s again.
 */
@Injectable({ providedIn: 'root' })
export class ProjectReleaseRequests {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The open project's id, in the browser only: the read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The open project's release requests. */
  readonly resource = qitsResource(
    PROJECT_RELEASE_REQUESTS,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: RELEASE_REQUEST_EVENTS,
        when: (event) => {
          const projectId = this.projectId();
          return !!projectId && affectsReleaseRequests(event, projectId, this.pending());
        },
      },
    },
  );

  /** Every request of the answer, in qits-projects' order; none until it answered. */
  readonly requests = computed((): readonly ReleaseRequestEntry[] =>
    this.resource.hasValue() ? (this.resource.value()?.requests ?? []) : [],
  );

  /** The ones still open ({@link isPendingRelease}), in the same order. */
  readonly pending = computed(() => this.requests().filter(isPendingRelease));

  /** The read: loading until it answered, an error when the first read failed. */
  readonly state = computed((): LoadState => loadState(this.resource));
}
