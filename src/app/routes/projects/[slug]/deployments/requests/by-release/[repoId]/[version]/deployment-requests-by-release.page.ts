import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { QitsBadge } from '@qits/ui-components';
import {
  affectsDeploymentRequests,
  DEPLOYMENT_REQUEST_EVENTS,
  deploymentOutcome,
  formatDayTime,
  gateLabel,
  gateTone,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  variantsToCome,
  type ShownDeploymentRequests,
} from '$core/deployments/deployment-requests';
import type { ReleaseDeploymentRequestRow } from '$core/deployments/deployments.consumes';
import { RELEASE_DEPLOYMENT_REQUESTS } from '$core/deployments/deployments.operations';
import { SelectedProject } from '$core/projects/selected-project';
import { PROJECT_REPOSITORIES } from '$core/repositories/repositories.operations';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** `rows`, newest first by `createdAt` (the server's order kept among equals). */
function newestFirst(
  rows: readonly ReleaseDeploymentRequestRow[],
): readonly ReleaseDeploymentRequestRow[] {
  const time = (row: ReleaseDeploymentRequestRow) => Date.parse(row.createdAt ?? '') || 0;
  return [...rows].sort((left, right) => time(right) - time(left));
}

/**
 * The deployment requests one release produced, at
 * `/projects/<slug>/deployments/requests/by-release/<repoId>/<version>` (qits-2323). It replaces
 * qits-deployments-frontend's `deployment-requests/by-release/:repoId/:version` resolver, which
 * opened the first match and never asked for the variants' requests. The release request page's
 * "The deployment of this release" leads here; the sidebar keeps Deployments › Requests current.
 *
 * One read (`RELEASE_DEPLOYMENT_REQUESTS`, `listDeploymentRequests?repoId=&version=` with
 * `includeVariants=true`): the main application's requests and its variants' (redeploys among
 * them). Exactly one → its page (`deployments/requests/<id>`) in the URL's place
 * (`replaceUrl`, the exit `follow-release-deployment-request`), so Back skips this address.
 * Several → a table, newest first, with the Requests page's columns and a Variant column (blank for
 * the main application); each row's Open leads to the request's page
 * (`open-release-deployment-requests-row`). A main application's row whose `variants` names a
 * variant no row deploys says that variant's request is still to come. None → why that may be
 * (the release deploys nothing, a library or an SPA, or it has not reached qits-deployments yet)
 * and Look again, which reads again.
 *
 * The heading names the release `<repository>@<version>`: the repository's name from the open
 * project's repositories (`PROJECT_REPOSITORIES`, by `entries[].repository.id`, or by name when the
 * request's `repoId` is one), else the `repoId` as the URL has it.
 *
 * The reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin`, `qits:desk`, `qits:agent` and
 * `qits:system` may read deployment requests) is said as such; any other failure offers Retry. A
 * failed repositories read only leaves the heading with the `repoId`. Marks (qits-2141): the table
 * is the one read, each row a request by its id.
 *
 * Staleness (qits-1270): the requests' `refreshOn`, `DEPLOYMENT_REQUEST_EVENTS` narrowed by
 * `affectsDeploymentRequests` → the whole list, debounced 1 s: a deployment event whose
 * `applicationName` is on screen (or any while a request is pending), a `DeploymentRequestDeclined`
 * whose `deploymentRequestId` is on screen, a `SoftwareRelease` whose `repository` is this
 * `repoId` (it may ask for this release's first request). The repositories follow no event here.
 * Known gap: a gate that settles as a refusal or as a hold sends no event; Refresh reads again.
 */
@Component({
  selector: 'app-deployment-requests-by-release-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    LoadFailure,
    PageLayoutComponent,
    QitsBadge,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [actions]="actions">
        <!-- The release, repository and version; it may break anywhere (a phone is narrow). -->
        <h1 slot="header" class="m-0 min-w-0 text-3xl leading-[1.1] font-bold wrap-anywhere">
          @if (repository(); as repository) {
            <span [qitsEntity]="repository" entityKey="id" [entitySource]="repositories"
              ><span [fieldOf]="repository" qitsField="name">{{ repository.name }}</span></span
            >&#64;{{ version() }}
          } @else {
            {{ repoId() }}&#64;{{ version() }}
          }
        </h1>
        <p class="mt-0 mb-4 text-sm">
          <a
            class="text-accent no-underline hover:underline"
            [qitsExit]="leaving.list"
            [exitParams]="{ slug: slug() }"
            [exitCurrent]="null"
            >← Deployment requests</a
          >
        </p>
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The deployment requests this release produced: the main application’s and its variants’.
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
          message="The release’s deployment requests could not be read."
          [class.hidden]="state() !== 'error' || refusal()"
          (retry)="requests.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          <div
            class="flex-col items-center gap-3 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && rows().length === 0 ? 'flex' : 'hidden'"
          >
            <p class="m-0">
              No deployment request exists for
              @if (repository(); as repository) {
                <span [qitsEntity]="repository" entityKey="id" [entitySource]="repositories"
                  ><span [fieldOf]="repository" qitsField="name">{{ repository.name }}</span></span
                >&#64;{{ version() }}:
              } @else {
                {{ repoId() }}&#64;{{ version() }}:
              }
              the release may deploy nothing (a library or an SPA), or it has not reached
              qits-deployments yet.
            </p>
            <ui-action-button [action]="lookAgain" />
          </div>
          <!-- One request: its page takes this address's place, so no table for it. -->
          <div
            class="overflow-x-auto rounded-md border border-line bg-surface"
            [class.hidden]="rows().length < 2"
            [qitsEntityList]="requests"
          >
            <table class="w-full border-collapse text-left text-sm">
              <thead class="bg-surface-muted text-xs text-fg-muted">
                <tr>
                  <th scope="col" class="px-3 py-2 font-semibold">Application</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Variant</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Priority</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Asked</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Gate</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Deployment</th>
                  <th scope="col" class="px-3 py-2"><span class="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                @for (request of rows(); track request.id) {
                  <tr class="align-baseline" [qitsEntity]="request" entityKey="id">
                    <td class="px-3 py-2 text-fg">
                      <span
                        class="whitespace-nowrap"
                        [fieldOf]="request"
                        qitsField="applicationName"
                        >{{ request.applicationName }}</span
                      >
                      @for (variant of toCome(request); track variant) {
                        <span
                          class="mt-0.5 block text-xs text-fg-muted"
                          [fieldOf]="request"
                          [qitsField]="{ derived: ['variants'] }"
                          >The {{ variant }} variant’s request is still to come.</span
                        >
                      }
                    </td>
                    <td class="px-3 py-2">
                      @if (request.variant) {
                        <code
                          class="font-mono text-xs whitespace-nowrap text-fg"
                          [fieldOf]="request"
                          qitsField="variant"
                          >{{ request.variant }}</code
                        >
                      }
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
                      [title]="instant(request.createdAt)"
                      [fieldOf]="request"
                      [qitsField]="{ derived: ['createdAt'] }"
                    >
                      {{ dayTime(request.createdAt) }}
                      <span class="ml-1 text-xs text-fg-muted">{{ age(request.createdAt) }}</span>
                    </td>
                    <td class="px-3 py-2">
                      <qits-badge
                        [label]="gate(request)"
                        [tone]="gateToneOf(request)"
                        [fieldOf]="request"
                        [qitsField]="{
                          derived: ['qualityGate', 'gateSettledAt', 'deployHold', 'gateDetail'],
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
                      @if (request.id; as id) {
                        <a
                          class="text-accent no-underline hover:underline"
                          [qitsExit]="opening.request"
                          [exitParams]="{ slug: slug(), requestId: id }"
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
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class DeploymentRequestsByReleasePage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly selected = inject(SelectedProject);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);

  /** The release's repository as the URL names it (qits-deployments' `repoId`). */
  protected readonly repoId = computed(() => this.params()?.get('repoId') ?? '');
  /** The release's version. */
  protected readonly version = computed(() => this.params()?.get('version') ?? '');

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The open project's id, in the browser only: the repositories' read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The release's requests, its variants' included; read again after the events about them. */
  protected readonly requests = qitsResource(
    RELEASE_DEPLOYMENT_REQUESTS,
    () => {
      const repoId = this.repoId();
      const version = this.version();
      return this.browser && repoId && version
        ? { query: { repoId, version, includeVariants: true } }
        : undefined;
    },
    {
      refreshOn: {
        names: DEPLOYMENT_REQUEST_EVENTS,
        when: (event) => affectsDeploymentRequests(event, this.shown()),
        debounceMs: 1_000,
      },
    },
  );

  /** The open project's repositories, for the name of the release's. */
  protected readonly repositories = qitsResource(PROJECT_REPOSITORIES, () => {
    const projectId = this.projectId();
    return projectId ? { path: { projectId } } : undefined;
  });

  /** The answer's requests, newest first; none until it answered. */
  protected readonly rows = computed((): readonly ReleaseDeploymentRequestRow[] =>
    this.requests.hasValue() ? newestFirst(this.requests.value()?.deploymentRequests ?? []) : [],
  );

  /** What the staleness rule narrows by: the rows, and the release's repository. */
  private readonly shown = computed((): ShownDeploymentRequests => ({
    requests: this.rows(),
    repositories: new Set([this.repoId()].filter(Boolean)),
  }));

  /** The release's repository among the project's, by id, else by name. */
  protected readonly repository = computed(() => {
    if (!this.repositories.hasValue()) return undefined;
    const repoId = this.repoId();
    const repositories = (this.repositories.value()?.entries ?? []).flatMap((entry) =>
      entry.repository ? [entry.repository] : [],
    );
    return (
      repositories.find((repository) => repository.id === repoId) ??
      repositories.find((repository) => repository.name === repoId)
    );
  });

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

  /** None yet: read again (the release may have reached qits-deployments since). */
  protected readonly lookAgain: Action = {
    label: 'Look again',
    variant: 'muted',
    callback: () => this.requests.reload(),
  };

  /** The back link (epic qits-2000). */
  protected readonly leaving = outcomes('leave-release-deployment-requests', {
    list: exit('projects/:slug/deployments/requests'),
  });

  /** A row's Open: the request's own page (qits-2322). */
  protected readonly opening = outcomes('open-release-deployment-requests-row', {
    request: exit('projects/:slug/deployments/requests/:requestId'),
  });

  /** The one request of a release, opened in this address's place (no trigger: the read decides). */
  private readonly following = outcomes(
    'follow-release-deployment-request',
    { request: exit('projects/:slug/deployments/requests/:requestId') },
    { triggered: false },
  );

  protected readonly priorityTone = priorityTone;
  protected readonly statusTone = statusTone;
  protected readonly dayTime = formatDayTime;
  protected readonly instant = formatInstant;

  constructor() {
    if (!this.browser) return;
    // Exactly one request: its page, in this address's place, once.
    let gone = false;
    effect(() => {
      const rows = this.rows();
      const slug = this.slug();
      const requestId = rows.length === 1 ? rows[0].id : undefined;
      if (gone || !slug || !requestId) return;
      gone = true;
      untracked(() => void this.following.request.go({ slug, requestId }, { replaceUrl: true }));
    });
  }

  protected toCome(request: ReleaseDeploymentRequestRow): readonly string[] {
    return variantsToCome(request, this.rows());
  }

  protected priority(request: ReleaseDeploymentRequestRow): string {
    return priorityLabel(request.priority);
  }

  protected age(createdAt: string | undefined): string {
    return formatRelativeTime(createdAt);
  }

  protected gate(request: ReleaseDeploymentRequestRow): string {
    return gateLabel(request);
  }

  protected gateToneOf(request: ReleaseDeploymentRequestRow) {
    return gateTone(request);
  }

  protected statusWord(status: string): string {
    return statusLabel(status);
  }

  protected outcome(request: ReleaseDeploymentRequestRow): string {
    return deploymentOutcome(request);
  }
}
