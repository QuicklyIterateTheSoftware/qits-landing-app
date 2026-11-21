import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
  type QitsFieldMark,
} from '@qits/angular';
import { QitsBadge } from '@qits/ui-components';
import { map } from 'rxjs';
import {
  affectsDeploymentRequest,
  DEPLOYMENT_REQUEST_EVENTS,
  gateLabel,
  gateTone,
  isDeclined,
  isHeldForApproval,
  requestLifecycle,
  statusLabel,
  statusTone,
  type LifecycleDeployment,
  type LifecycleState,
  type ShownDeploymentRequest,
  type TileRead,
} from '$core/deployments/deployment-requests';
import type {
  DeploymentRequestAnswer,
  DeploymentRequestDetail,
} from '$core/deployments/deployments.consumes';
import {
  APPROVE_DEPLOYMENT_REQUEST,
  DECLINE_DEPLOYMENT_REQUEST,
  DEPLOYMENT_REQUEST,
  ENVIRONMENTS,
  TIER_DEPLOYMENTS,
} from '$core/deployments/deployments.operations';
import { OpenDeploymentRequest } from '$core/deployments/open-deployment-request';
import { valueMarks } from '$core/marks/value-marks';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import {
  describeRefusal,
  formatInstant,
  NONE,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import { refusedBy } from '$core/release-requests/release-request-writes';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

type Decision = 'approve' | 'decline';

/** The request's marks, by what each value is derived from (`qits/data-through-fields`). */
const MARKS = {
  lifecycle: {
    derived: [
      'version',
      'createdAt',
      'environmentId',
      'applicationName',
      'repoId',
      'qualityGate',
      'gateSettledAt',
      'deployHold',
      'gateDetail',
      'deploymentStatus',
    ],
  },
  gate: { derived: ['qualityGate', 'gateSettledAt', 'deployHold', 'gateDetail'] },
  approved: { derived: ['approvedBy', 'approvedAt'] },
  declined: { derived: ['declinedBy', 'declinedAt'] },
  variants: { derived: ['variants'] },
} satisfies Record<string, QitsFieldMark<DeploymentRequestDetail>>;

/** Each tile state's tile classes, written out for Tailwind. */
const TILE: Readonly<Record<LifecycleState, string>> = {
  reached: 'border-success-line bg-success-soft',
  pending: 'border-line bg-surface',
  stopped: 'border-warning-line bg-warning-soft',
};

/** Each tile state's glyph colour. */
const MARK_TONE: Readonly<Record<LifecycleState, string>> = {
  reached: 'text-success-strong',
  pending: 'text-fg-muted',
  stopped: 'text-warning-strong',
};

/**
 * One deployment request, end to end, at `/projects/<slug>/deployments/requests/<requestId>`
 * (qits-2322, the retired qits-deployments-frontend's `deployment-requests/<id>` page): what was
 * asked for, what the gate said, what ran, and whether the change it carried reached main. The
 * sidebar keeps Deployments › Requests current below it, and the trail ends with
 * `<version> · <applicationName>` (`OpenDeploymentRequest`, which this page tells what it shows).
 *
 * Four reads, and only the first can fail the page. The request and its deployment
 * (`DEPLOYMENT_REQUEST`, `getDeploymentRequest`); the tier's deployments (`TIER_DEPLOYMENTS`,
 * `listDeployments?environmentId=`, by the request's `environmentId`) and every tier
 * (`ENVIRONMENTS`, for the tier's name), each deciding the lifecycle's middle tile only; and the
 * project's release requests (`ProjectReleaseRequests`, the shell's own read of
 * `PROJECT_RELEASE_REQUESTS`: the open ones and the ten newest released), deciding the merge tile
 * only. A failed one of those three says so on its tile. The lifecycle is `requestLifecycle`
 * (`core/deployments/deployment-requests.ts`): Released, Running in <tier>, Merged to main.
 *
 * Under it the request's facts (gate, the hold's settlement, package, variant, when asked and
 * answered) and its deployment's (status, commit, container, started, finished, detail), or "No
 * deployment was queued for this request." While the request is held for approval the page offers
 * Approve and Decline (with an optional note), each asking once ("Confirm …?") and sent on the
 * second press through `qitsMutation` (`APPROVE_DEPLOYMENT_REQUEST`, `DECLINE_DEPLOYMENT_REQUEST`).
 * The answer is the same envelope the read gives, so it takes the shown request's place (no read
 * again for it); a decline clears the note. A refusal (409, 404, 502) is said beside the buttons;
 * a 409 means somebody settled it first, so the page reads the request again.
 *
 * Reads run in the browser only (the server has no session). A refused request read (403: only
 * `qits:admin`, `qits:admin-agent`, `qits:desk-admin`, `qits:desk`, `qits:agent` and `qits:system`
 * may read deployment requests) is said as such, an unknown id (404) as "No deployment request
 * <id>.", any other failure offers Retry. Marks (qits-2141): the request and the deployment are
 * entities of the request's read, by `id`.
 *
 * Staleness (qits-1270): the request's and the tier's resources' `refreshOn`,
 * `DEPLOYMENT_REQUEST_EVENTS` narrowed by `affectsDeploymentRequest` to this request → the request
 * and the tier's deployments, debounced 1 s: a deployment event whose `applicationName` is the
 * request's, `DeploymentRequestDeclined` whose `deploymentRequestId` is this one, a
 * `SoftwareRelease` whose `repository` is its `repoId`. The tiers follow no event (a tier is not
 * made while a container starts); the release requests follow `ProjectReleaseRequests`' own. Known
 * gap: a gate that settles as a refusal or as a hold sends no event; Refresh reads all four again.
 */
@Component({
  selector: 'app-deployment-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    LoadFailure,
    PageLayoutComponent,
    QitsBadge,
    QitsEntity,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [titleMarks]="titleMarks()" [actions]="actions">
        <p class="mt-0 mb-4 text-sm">
          <a
            class="text-accent no-underline hover:underline"
            [qitsExit]="leaving.list"
            [exitParams]="{ slug: slug() }"
            [exitCurrent]="null"
            >← Deployment requests</a
          >
        </p>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading deployment requests needs qits:admin, qits:admin-agent, qits:desk-admin,
          qits:desk, qits:agent or qits:system.
        </p>
        <p class="m-0 text-sm text-fg-soft" [class.hidden]="!missing()">
          No deployment request {{ requestId() }}.
        </p>
        <ui-load-failure
          message="This deployment request could not be read."
          [class.hidden]="state() !== 'error' || refusal() || missing()"
          (retry)="refresh()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          @if (request(); as request) {
            <div class="contents" [qitsEntity]="request" entityKey="id" [entitySource]="read">
              <ol
                class="m-0 mb-6 flex list-none flex-wrap items-stretch gap-2 p-0"
                aria-label="How far this version got"
                [fieldOf]="request"
                [qitsField]="marks.lifecycle"
              >
                @for (stage of stages(); track stage.id; let last = $last) {
                  <li class="flex items-center gap-2" [attr.data-stage]="stage.id">
                    <div
                      class="flex min-w-40 flex-col gap-0.5 rounded-md border px-3 py-2"
                      [class]="tile[stage.state]"
                    >
                      <span class="text-sm" [class]="markTone[stage.state]" aria-hidden="true">{{
                        glyph(stage.state)
                      }}</span>
                      <span class="font-semibold text-fg">{{ stage.title }}</span>
                      <span class="text-sm text-fg-muted">{{ stage.meta }}</span>
                      @if (stage.detail) {
                        <span class="text-sm text-warning-strong">{{ stage.detail }}</span>
                      }
                      <span class="sr-only">{{ reading(stage.state) }}</span>
                    </div>
                    @if (!last) {
                      <span class="text-fg-faint" aria-hidden="true">→</span>
                    }
                  </li>
                }
              </ol>

              <section class="mb-6" aria-labelledby="deployment-request-facts">
                <h2 class="m-0 mb-2 text-base font-semibold text-fg" id="deployment-request-facts">
                  The request
                </h2>
                <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt class="text-fg-muted">Gate</dt>
                  <dd class="m-0 flex flex-col items-start gap-2">
                    <span class="flex flex-wrap items-center gap-2">
                      <qits-badge
                        [label]="gate(request)"
                        [tone]="gateToneOf(request)"
                        [fieldOf]="request"
                        [qitsField]="marks.gate"
                      />
                      @if (request.gateDetail) {
                        <span class="text-fg-soft" [fieldOf]="request" qitsField="gateDetail">{{
                          request.gateDetail
                        }}</span>
                      }
                    </span>
                    @if (held(request)) {
                      @if (request.releaseRequestQualifiedId) {
                        <span class="text-fg-soft"
                          >release request
                          <code
                            class="font-mono text-xs"
                            [fieldOf]="request"
                            qitsField="releaseRequestQualifiedId"
                            >{{ request.releaseRequestQualifiedId }}</code
                          ></span
                        >
                      }
                      <div class="flex flex-wrap items-center gap-2">
                        <ui-action-button [action]="approve()" />
                        <input
                          class="h-8 min-w-48 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                          type="text"
                          [value]="note()"
                          [disabled]="inFlight() !== null"
                          (input)="noteTyped($event)"
                          placeholder="A note (optional)"
                          aria-label="A note on the decline"
                        />
                        <ui-action-button [action]="decline()" />
                      </div>
                      <span class="text-xs text-fg-muted">
                        A decline is final — the release request ends WITHDRAWN.
                      </span>
                    } @else if (request.approvedBy) {
                      <span class="text-fg-soft" [fieldOf]="request" [qitsField]="marks.approved"
                        >Approved by {{ request.approvedBy }} ·
                        {{ instant(request.approvedAt) }}</span
                      >
                    } @else if (declined(request)) {
                      <span class="text-fg-soft" [fieldOf]="request" [qitsField]="marks.declined"
                        >Declined by {{ request.declinedBy }} at
                        {{ instant(request.declinedAt) }}</span
                      >
                    }
                    @if (refused(); as refused) {
                      <p class="m-0 text-sm text-danger" role="alert">{{ refused }}</p>
                    }
                  </dd>

                  <dt class="text-fg-muted">Package</dt>
                  <dd class="m-0">
                    <code
                      class="font-mono text-xs"
                      [fieldOf]="request"
                      [qitsField]="{ derived: ['packageName'] }"
                      >{{ request.packageName || none }}</code
                    >
                  </dd>

                  @if (request.variant) {
                    <dt class="text-fg-muted">Variant</dt>
                    <dd class="m-0">
                      <code class="font-mono text-xs" [fieldOf]="request" qitsField="variant">{{
                        request.variant
                      }}</code>
                    </dd>
                  }

                  @if (variantsOf(request); as variants) {
                    <dt class="text-fg-muted">Variants</dt>
                    <dd class="m-0" [fieldOf]="request" [qitsField]="marks.variants">
                      {{ variants }}
                    </dd>
                  }

                  <dt class="text-fg-muted">Asked</dt>
                  <dd class="m-0" [fieldOf]="request" [qitsField]="{ derived: ['createdAt'] }">
                    {{ instant(request.createdAt) }}
                  </dd>

                  <dt class="text-fg-muted">Gate answered</dt>
                  <dd class="m-0" [fieldOf]="request" [qitsField]="{ derived: ['gateSettledAt'] }">
                    {{ instant(request.gateSettledAt) }}
                  </dd>
                </dl>
              </section>
            </div>

            <section aria-labelledby="deployment-request-deployment">
              <h2
                class="m-0 mb-2 text-base font-semibold text-fg"
                id="deployment-request-deployment"
              >
                The deployment
              </h2>
              @if (deployment(); as deployment) {
                <div
                  class="contents"
                  [qitsEntity]="deployment"
                  entityKey="id"
                  [entitySource]="read"
                >
                  <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt class="text-fg-muted">Status</dt>
                    <dd class="m-0">
                      @if (deployment.status; as status) {
                        <qits-badge
                          [label]="statusWord(status)"
                          [tone]="statusTone(status)"
                          [fieldOf]="deployment"
                          [qitsField]="{ derived: ['status'] }"
                        />
                      }
                    </dd>

                    <dt class="text-fg-muted">Commit</dt>
                    <dd class="m-0">
                      <code
                        class="font-mono text-xs"
                        [title]="deployment.commitSha ?? ''"
                        [fieldOf]="deployment"
                        [qitsField]="{ derived: ['commitSha'] }"
                        >{{ sha(deployment.commitSha) }}</code
                      >
                    </dd>

                    <dt class="text-fg-muted">Container</dt>
                    <dd class="m-0">
                      <code
                        class="font-mono text-xs"
                        [fieldOf]="deployment"
                        [qitsField]="{ derived: ['containerName'] }"
                        >{{ deployment.containerName || none }}</code
                      >
                    </dd>

                    <dt class="text-fg-muted">Started</dt>
                    <dd class="m-0" [fieldOf]="deployment" [qitsField]="{ derived: ['createdAt'] }">
                      {{ instant(deployment.createdAt) }}
                    </dd>

                    <dt class="text-fg-muted">Finished</dt>
                    <dd
                      class="m-0"
                      [fieldOf]="deployment"
                      [qitsField]="{ derived: ['finishedAt'] }"
                    >
                      {{ instant(deployment.finishedAt) }}
                    </dd>
                  </dl>
                  @if (deployment.detail) {
                    <pre
                      class="mt-3 mb-0 overflow-x-auto rounded-md border border-line bg-surface-muted p-3 font-mono text-xs whitespace-pre-wrap text-fg"
                      [fieldOf]="deployment"
                      qitsField="detail"
                      >{{ deployment.detail }}</pre>
                  }
                </div>
              } @else {
                <p
                  class="m-0 rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-fg-muted"
                >
                  No deployment was queued for this request.
                </p>
              }
            </section>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class DeploymentRequestPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly selected = inject(SelectedProject);
  private readonly releaseRequests = inject(ProjectReleaseRequests);
  private readonly open = inject(OpenDeploymentRequest);
  private readonly approving = qitsMutation(APPROVE_DEPLOYMENT_REQUEST);
  private readonly declining = qitsMutation(DECLINE_DEPLOYMENT_REQUEST);

  /** The back link (epic qits-2000). */
  protected readonly leaving = outcomes('leave-deployment-request', {
    list: exit('projects/:slug/deployments/requests'),
  });

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The request's id in the URL. */
  protected readonly requestId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('requestId') ?? '')),
    { initialValue: '' },
  );

  /** The request and its deployment; read again after the events about it. */
  protected readonly read = qitsResource(
    DEPLOYMENT_REQUEST,
    () => {
      const id = this.requestId();
      return this.browser && id ? { path: { id } } : undefined;
    },
    {
      refreshOn: {
        names: DEPLOYMENT_REQUEST_EVENTS,
        when: (event) => affectsDeploymentRequest(event, this.shown()),
        debounceMs: 1_000,
      },
    },
  );

  /** The read's answer, kept while a read again is on its way. */
  private readonly answer = computed((): DeploymentRequestAnswer | undefined =>
    this.read.hasValue() ? this.read.value() : undefined,
  );

  /** The request, once read. */
  protected readonly request = computed(() => this.answer()?.deploymentRequest ?? undefined);

  /** Its deployment; null when it queued none. */
  protected readonly deployment = computed(() => this.answer()?.deployment ?? null);

  /** What the events are narrowed by. */
  private readonly shown = computed((): ShownDeploymentRequest | undefined => this.request());

  /** The request's tier: what the tier's deployments are read by. */
  private readonly environmentId = computed(() => this.request()?.environmentId ?? '');

  /** The tier's deployments: is this version what the tier runs. */
  private readonly tierDeployments = qitsResource(
    TIER_DEPLOYMENTS,
    () => {
      const environmentId = this.environmentId();
      return environmentId ? { query: { environmentId } } : undefined;
    },
    {
      refreshOn: {
        names: DEPLOYMENT_REQUEST_EVENTS,
        when: (event) => affectsDeploymentRequest(event, this.shown()),
        debounceMs: 1_000,
      },
    },
  );

  /** Every tier, for the request's tier's name; read once the request is. */
  private readonly environments = qitsResource(ENVIRONMENTS, () =>
    this.environmentId() ? {} : undefined,
  );

  /** The lifecycle's three tiles. */
  protected readonly stages = computed(() => {
    const request = this.request();
    if (!request) return [];
    const tier = this.tierDeployments;
    const deployments: TileRead<readonly LifecycleDeployment[]> =
      tier.status() === 'error'
        ? { status: 'error' }
        : tier.hasValue()
          ? { status: 'loaded', value: tier.value()?.deployments ?? [] }
          : { status: 'loading' };
    const releaseState = this.releaseRequests.state();
    return requestLifecycle({
      request,
      deployments,
      environments: this.environments.hasValue()
        ? (this.environments.value()?.environments ?? [])
        : [],
      releaseRequests:
        releaseState === 'error'
          ? { status: 'error' }
          : releaseState === 'loaded'
            ? { status: 'loaded', value: this.releaseRequests.requests() }
            : { status: 'loading' },
    });
  });

  protected readonly state = computed((): LoadState => loadState(this.read));

  /** Whether the read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => {
    if (this.read.status() !== 'error') return false;
    const error = this.read.error();
    return error instanceof QitsApiError && error.status === 403;
  });

  /** Whether no request has the URL's id. */
  protected readonly missing = computed(() => isMissing(this.read));

  /** The page's heading: `<version> · <applicationName>` once read. */
  protected readonly title = computed(() => {
    const request = this.request();
    return request
      ? [request.version, request.applicationName].filter(Boolean).join(' · ')
      : 'Deployment request';
  });

  protected readonly titleMarks = computed(() => {
    const request = this.request();
    return request
      ? valueMarks(DEPLOYMENT_REQUEST, request, 'id', { derived: ['version', 'applicationName'] })
      : undefined;
  });

  /** Refresh: reads all four again (a gate settling as a refusal or a hold sends no event). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.refresh() },
  ];

  /** The decision pressed once, waiting for its confirmation. */
  protected readonly pending = signal<Decision | null>(null);
  /** The decision on its way. */
  protected readonly inFlight = signal<Decision | null>(null);
  /** The decline's optional note. */
  protected readonly note = signal('');
  /** Why the last decision was not taken, said beside the buttons. */
  protected readonly refused = signal<string | null>(null);

  protected readonly approve = computed((): Action => ({
    label: this.pending() === 'approve' ? 'Confirm approve?' : 'Approve',
    variant: 'success',
    disabled: this.inFlight() !== null,
    callback: () => void this.press('approve'),
  }));

  protected readonly decline = computed((): Action => ({
    label: this.pending() === 'decline' ? 'Confirm decline?' : 'Decline',
    variant: 'muted',
    disabled: this.inFlight() !== null,
    details: {
      title: 'A decline is final',
      items: [
        'Nothing un-declines it, and the release request ends WITHDRAWN.',
        'Ship the work again from a new branch off the release’s tag and a new release request.',
      ],
    },
    callback: () => void this.press('decline'),
  }));

  protected readonly marks = MARKS;
  protected readonly tile = TILE;
  protected readonly markTone = MARK_TONE;
  protected readonly none = NONE;
  protected readonly instant = formatInstant;
  protected readonly sha = shortShaOrNone;
  protected readonly statusTone = statusTone;
  protected readonly statusWord = statusLabel;
  protected readonly held = isHeldForApproval;
  protected readonly declined = isDeclined;

  constructor() {
    // The trail names the request on show (`OpenDeploymentRequest`), until the page closes.
    effect(() => {
      const request = this.request();
      if (request?.id) this.open.show({ ...request, id: request.id });
    });
    inject(DestroyRef).onDestroy(() => {
      const id = this.request()?.id;
      if (id) this.open.clear(id);
    });
  }

  protected gate(request: DeploymentRequestDetail): string {
    return gateLabel(request);
  }

  protected gateToneOf(request: DeploymentRequestDetail) {
    return gateTone(request);
  }

  /** The variants the release declares, comma-joined; `''` when it declares none. */
  protected variantsOf(request: DeploymentRequestDetail): string {
    return (request.variants ?? []).join(', ');
  }

  protected glyph(state: LifecycleState): string {
    if (state === 'reached') return '✓';
    return state === 'stopped' ? '⚠' : '·';
  }

  protected reading(state: LifecycleState): string {
    if (state === 'reached') return 'reached';
    return state === 'stopped' ? 'stopped' : 'not yet';
  }

  protected noteTyped(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  /** Reads the request, the tier's deployments, the tiers and the release requests again. */
  protected refresh(): void {
    this.read.reload();
    this.tierDeployments.reload();
    this.environments.reload();
    this.releaseRequests.resource.reload();
  }

  /**
   * A decision's press: the first asks to confirm, the second sends it. The answer takes the shown
   * request's place; a refusal is said beside the buttons, and a 409 (somebody settled it first)
   * reads the request again.
   */
  protected async press(decision: Decision): Promise<void> {
    this.refused.set(null);
    if (this.pending() !== decision) {
      this.pending.set(decision);
      return;
    }
    const id = this.request()?.id;
    if (!id) return;
    this.pending.set(null);
    this.inFlight.set(decision);
    try {
      const note = this.note().trim();
      const answer =
        decision === 'approve'
          ? await this.approving.run({ path: { id } })
          : await this.declining.run({ path: { id }, ...(note ? { body: { note } } : {}) });
      if (answer?.deploymentRequest) {
        this.read.set(answer);
        if (decision === 'decline') this.note.set('');
      } else {
        this.read.reload();
      }
    } catch (error) {
      const { status, message } = refusedBy(error);
      this.refused.set(refusalOf(decision, status, message));
      if (status === 409) this.read.reload();
    } finally {
      this.inFlight.set(null);
    }
  }
}

/** Why a decision was refused, for a person to read. */
function refusalOf(decision: Decision, status: number, message: string | undefined): string {
  const verb = decision === 'approve' ? 'approve' : 'decline';
  if (status === 409)
    return `This request is no longer held: somebody settled it first. Reading it again.`;
  if (status === 404) return `Could not ${verb}: no such deployment request.`;
  if (status === 502)
    return `Could not ${verb}: qits-deployments could not read the released spec.`;
  return `Could not ${verb} — ${describeRefusal(status, message)}.`;
}
