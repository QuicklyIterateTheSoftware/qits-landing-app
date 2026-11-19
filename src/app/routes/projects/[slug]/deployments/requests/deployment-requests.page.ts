import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { QitsApiError, QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { QitsBadge } from '@qits/ui-components';
import {
  affectsDeploymentRequests,
  COMPLETED_SHOWN,
  DEPLOYMENT_REQUEST_EVENTS,
  deploymentOutcome,
  deploymentRequestHref,
  formatDayTime,
  gateLabel,
  gateTone,
  isCompletedRequest,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type ShownDeploymentRequests,
} from '$core/deployments/deployment-requests';
import type { DeploymentRequestRow } from '$core/deployments/deployments.consumes';
import { PROJECT_DEPLOYMENT_REQUESTS } from '$core/deployments/deployments.operations';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** One of the page's two sections and its rows. */
interface RequestGroup {
  readonly key: 'pending' | 'completed';
  readonly rows: readonly DeploymentRequestRow[];
}

/**
 * The Deployments section's Requests page, at `/projects/<slug>/deployments/requests` (qits-2315;
 * the section's own address redirects here): every release this project asked the platform for,
 * the gate's record and what became of it. It replaces qits-deployments-frontend's
 * `deployment-requests` page.
 *
 * One read, by the open project's id (`PROJECT_DEPLOYMENT_REQUESTS`, `listDeploymentRequests`
 * `?projectId=`): qits-deployments answers every request it has not finished with and the ten
 * newest settled ones, newest first. The page splits them along `isCompletedRequest` (the server's
 * own `RequestLifecycle` rule): Pending, and Completed ("The last 10, newest first."). A project
 * with none at all says so once instead of drawing two empty sections.
 *
 * Each row: the version, the priority the release announced (blank when none), the application,
 * when it was asked (day and time in UTC, and how long ago), the gate's word, the status of the
 * deployment it handed off to (or what became of it when there is none), and Open, the request's
 * page on the deployments frontend (`deploymentRequestHref`, as the release request page's
 * lifecycle links it) until qits-2322 moves that page here.
 *
 * The read runs in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin`, `qits:desk`, `qits:agent` and
 * `qits:system` may read deployment requests) is said as such; any other failure offers Retry.
 * Marks (qits-2141): both tables are the one read, each row a request by its id.
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `DEPLOYMENT_REQUEST_EVENTS` narrowed by
 * `affectsDeploymentRequests` → the whole list, debounced 1 s. A deployment event
 * (`DeploymentQueued`, `DeploymentStarted`, `DeploymentActive`, `DeploymentFailed`) names an
 * application and a version, never a project: it counts when its `applicationName` is one on screen,
 * or while a request is pending (the new deployment may be that one's). `DeploymentRequestDeclined`
 * counts when its `deploymentRequestId` is on screen. `SoftwareRelease` (which asks for a new
 * deployment) counts when its `repository` is a request's `repoId` on screen or a repository of the
 * project's release requests (`ProjectReleaseRequests`, which the shell already read). Known gap: a
 * gate that settles as a refusal or as a hold sends no event; Refresh reads again.
 */
@Component({
  selector: 'app-deployment-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsBadge,
    QitsEntity,
    QitsEntityList,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Deployment requests" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          Every release this project asked the platform for: the gate’s record, and what became of
          it.
        </p>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading deployment requests needs qits:admin, qits:admin-agent, qits:desk-admin,
          qits:desk, qits:agent or qits:system.
        </p>
        <ui-load-failure
          message="The project’s deployment requests could not be read."
          [class.hidden]="state() !== 'error' || refusal()"
          (retry)="requests.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && rows().length === 0 ? 'block' : 'hidden'"
          >
            No deployment requests yet: no release of this project has asked the platform for a
            deployment.
          </p>
          <div [class.hidden]="rows().length === 0" [qitsEntityList]="requests">
            @for (group of groups(); track group.key) {
              <section class="mb-8" [attr.aria-labelledby]="'deployment-requests-' + group.key">
                @if (group.key === 'pending') {
                  <h2 class="m-0 text-base font-semibold text-fg" id="deployment-requests-pending">
                    Pending
                  </h2>
                  <p class="mt-0.5 mb-3 text-xs text-fg-muted">
                    Everything the platform has not finished with.
                  </p>
                } @else {
                  <h2
                    class="m-0 text-base font-semibold text-fg"
                    id="deployment-requests-completed"
                  >
                    Completed
                  </h2>
                  <p class="mt-0.5 mb-3 text-xs text-fg-muted">
                    The last {{ completedShown }}, newest first.
                  </p>
                }
                @if (group.rows.length === 0) {
                  <p
                    class="m-0 rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-fg-muted"
                  >
                    @if (group.key === 'pending') {
                      Nothing is in flight.
                    } @else {
                      No release of this project has settled here yet.
                    }
                  </p>
                } @else {
                  <div class="overflow-x-auto rounded-md border border-line bg-surface">
                    <table class="w-full border-collapse text-left text-sm">
                      <thead class="bg-surface-muted text-xs text-fg-muted">
                        <tr>
                          <th scope="col" class="px-3 py-2 font-semibold">Version</th>
                          <th scope="col" class="px-3 py-2 font-semibold">Priority</th>
                          <th scope="col" class="px-3 py-2 font-semibold">Application</th>
                          <th scope="col" class="px-3 py-2 font-semibold">Asked</th>
                          <th scope="col" class="px-3 py-2 font-semibold">Gate</th>
                          <th scope="col" class="px-3 py-2 font-semibold">Deployment</th>
                          <th scope="col" class="px-3 py-2"><span class="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-line">
                        @for (request of group.rows; track request.id) {
                          <tr class="align-baseline" [qitsEntity]="request" entityKey="id">
                            <td class="px-3 py-2">
                              <code
                                class="font-mono text-xs whitespace-nowrap text-fg"
                                [fieldOf]="request"
                                qitsField="version"
                                >{{ request.version }}</code
                              >
                            </td>
                            <td class="px-3 py-2">
                              @if (priority(request); as label) {
                                <qits-badge
                                  [label]="label"
                                  [tone]="priorityTone(request.priority)"
                                  [fieldOf]="request"
                                  [qitsField]="{ derived: ['priority'] }"
                                />
                              }
                            </td>
                            <td
                              class="px-3 py-2 whitespace-nowrap text-fg"
                              [fieldOf]="request"
                              qitsField="applicationName"
                            >
                              {{ request.applicationName }}
                            </td>
                            <td
                              class="px-3 py-2 whitespace-nowrap text-fg"
                              [title]="instant(request.createdAt)"
                              [fieldOf]="request"
                              [qitsField]="{ derived: ['createdAt'] }"
                            >
                              {{ dayTime(request.createdAt) }}
                              <span class="ml-1 text-xs text-fg-muted">{{
                                age(request.createdAt)
                              }}</span>
                            </td>
                            <td class="px-3 py-2">
                              <qits-badge
                                [label]="gate(request)"
                                [tone]="gateToneOf(request)"
                                [fieldOf]="request"
                                [qitsField]="{
                                  derived: [
                                    'qualityGate',
                                    'gateSettledAt',
                                    'deployHold',
                                    'gateDetail',
                                  ],
                                }"
                              />
                            </td>
                            <td class="px-3 py-2">
                              @if (request.deploymentStatus; as status) {
                                <qits-badge
                                  [label]="statusWord(status)"
                                  [tone]="statusTone(status)"
                                  [fieldOf]="request"
                                  [qitsField]="{ derived: ['deploymentStatus'] }"
                                />
                              } @else {
                                <span
                                  class="text-xs text-fg-muted"
                                  [fieldOf]="request"
                                  [qitsField]="{
                                    derived: ['deploymentStatus', 'qualityGate', 'gateSettledAt'],
                                  }"
                                  >{{ outcome(request) }}</span
                                >
                              }
                            </td>
                            <td class="px-3 py-2 text-right">
                              @if (href(request.id); as link) {
                                <a
                                  class="text-accent no-underline hover:underline"
                                  [href]="link"
                                  [fieldOf]="request"
                                  [qitsField]="{ derived: ['id'] }"
                                  >Open</a
                                >
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </section>
            }
          </div>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class DeploymentRequestsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly selected = inject(SelectedProject);
  private readonly releaseRequests = inject(ProjectReleaseRequests);
  private readonly origin = inject(PlatformOrigins).page('deployments');

  /** The open project's id, in the browser only: the read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The open project's deployment requests; read again after the events that can change them. */
  protected readonly requests = qitsResource(
    PROJECT_DEPLOYMENT_REQUESTS,
    () => {
      const projectId = this.projectId();
      return projectId ? { query: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: DEPLOYMENT_REQUEST_EVENTS,
        when: (event) => affectsDeploymentRequests(event, this.shown()),
        debounceMs: 1_000,
      },
    },
  );

  /** The answer's requests, newest first; none until it answered. */
  protected readonly rows = computed((): readonly DeploymentRequestRow[] =>
    this.requests.hasValue() ? (this.requests.value()?.deploymentRequests ?? []) : [],
  );

  /** The two sections, split as qits-deployments splits them. */
  protected readonly groups = computed((): readonly RequestGroup[] => [
    { key: 'pending', rows: this.rows().filter((request) => !isCompletedRequest(request)) },
    { key: 'completed', rows: this.rows().filter(isCompletedRequest) },
  ]);

  /** What the staleness rule narrows by: the rows, and the repositories a release of concerns. */
  private readonly shown = computed((): ShownDeploymentRequests => ({
    requests: this.rows(),
    repositories: new Set(
      [
        ...this.rows().map((request) => request.repoId),
        ...this.releaseRequests.requests().map((request) => request.repoName),
      ].filter((name): name is string => !!name),
    ),
  }));

  protected readonly state = computed((): LoadState => loadState(this.requests));

  /** Whether the read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => {
    if (this.requests.status() !== 'error') return false;
    const error = this.requests.error();
    return error instanceof QitsApiError && error.status === 403;
  });

  /** Refresh: reads the requests again (a gate settling as a refusal or a hold sends no event). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.requests.reload() },
  ];

  protected readonly completedShown = COMPLETED_SHOWN;
  protected readonly priorityTone = priorityTone;
  protected readonly statusTone = statusTone;
  protected readonly dayTime = formatDayTime;
  protected readonly instant = formatInstant;

  protected priority(request: DeploymentRequestRow): string {
    return priorityLabel(request.priority);
  }

  protected age(createdAt: string | undefined): string {
    return formatRelativeTime(createdAt);
  }

  protected gate(request: DeploymentRequestRow): string {
    return gateLabel(request);
  }

  protected gateToneOf(request: DeploymentRequestRow) {
    return gateTone(request);
  }

  protected statusWord(status: string): string {
    return statusLabel(status);
  }

  protected outcome(request: DeploymentRequestRow): string {
    return deploymentOutcome(request);
  }

  /** The request's page on the deployments frontend, until qits-2322 moves it here. */
  protected href(id: string | undefined): string | undefined {
    return deploymentRequestHref(this.origin, this.selected.slug() ?? '', id);
  }
}
