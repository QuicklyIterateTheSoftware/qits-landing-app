import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  type QitsDomainEvent,
} from '@qits/angular';
import { repositoryNamed } from '$core/ci/repository-ci';
import { payloadIds } from '$core/events/refresh-on';
import { RELEASE_REQUEST_EVENTS } from '$core/projects/release-request-events';
import { requestTone } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import {
  filterRequests,
  REQUEST_FILTERS,
  requestFilterOf,
  REQUESTS_CHUNK,
  stateQueryOf,
} from '$core/release-requests/repository-release-requests';
import type {
  RepositoryReleaseRequest,
  RepositoryReleaseRequests,
} from '$core/release-requests/repository-release-requests.consumes';
import { REPOSITORY_RELEASE_REQUESTS } from '$core/release-requests/repository-release-requests.operations';
import { PROJECT_REPOSITORY_PAGE } from '$core/repositories/repositories.operations';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** No requests yet. */
const NO_REQUESTS: RepositoryReleaseRequests = { requests: [] };

/**
 * One repository's release requests, at `/projects/<slug>/repositories/<repo>/release-requests`
 * (qits-2506), the repository sidebar's Release requests entry: newest first, each with its
 * logical id (opening it under the repository, `open-repository-release-request`), state,
 * version, approval (who, when), the branches it carries and when it last changed.
 *
 * Reads, in the browser only: the project's repositories (`PROJECT_REPOSITORY_PAGE`), for the
 * address's repository's id (an unknown name says so), then its requests
 * (`REPOSITORY_RELEASE_REQUESTS`, `listRepositoryReleaseRequests`). The state filter is `?state=`
 * (`requestFilterOf`): all (the default, `state=all`, so past released requests show without a
 * click), open (the door's default), released (RELEASED, FINALIZED) or rejected and withdrawn,
 * the last two narrowed from `state=all` in the page. A long history shows in chunks of
 * `REQUESTS_CHUNK`, "Show more" adding the next.
 *
 * Staleness (qits-1270): `RELEASE_REQUEST_EVENTS` naming the repository (`payloadIds`'
 * `repositoryId`) → its requests, debounced; Refresh reads both again.
 */
@Component({
  selector: 'app-repository-release-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Release requests" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">{{ repo() }}’s release requests, newest first.</p>
        <nav class="mb-4 flex flex-wrap gap-1" aria-label="State">
          @for (option of filters; track option.key) {
            <a
              class="flex h-7 items-center rounded-md border px-2 text-xs font-semibold no-underline"
              [class]="filter() === option.key ? on : off"
              [attr.aria-current]="filter() === option.key ? 'true' : null"
              [routerLink]="[]"
              [queryParams]="{ state: option.key === 'all' ? null : option.key }"
              queryParamsHandling="merge"
              >{{ option.label }}</a
            >
          }
        </nav>
        @if (unknown()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-unknown>
            This project has no repository {{ repo() }}.
          </p>
        }
        <ui-load-failure
          message="This repository’s release requests could not be read."
          [class.hidden]="state() !== 'error' || unknown()"
          (retry)="retry()"
        />
        <ui-spinner
          [state]="state()"
          class="min-h-32"
          [class.hidden]="state() === 'error' || unknown()"
        >
          <ul
            class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
            aria-label="Release requests"
            [class.hidden]="shown().length === 0"
            [qitsEntityList]="requests"
          >
            @for (request of shown(); track request.id) {
              <li
                class="grid grid-cols-[10rem_7rem_minmax(0,1fr)_minmax(0,12rem)_6rem] items-baseline gap-x-3 gap-y-1 px-3 py-2 max-md:grid-cols-1"
                [qitsEntity]="request"
                entityKey="id"
              >
                <a
                  class="font-mono font-semibold text-accent no-underline hover:underline"
                  [qitsExit]="opening.request"
                  [exitParams]="{
                    slug: slug(),
                    repo: repo(),
                    requestId: request.qualifiedId ?? request.id ?? '',
                  }"
                  [fieldOf]="request"
                  [qitsField]="{ derived: ['qualifiedId', 'id'] }"
                  >{{ request.qualifiedId ?? request.id }}</a
                >
                <span class="flex flex-wrap items-baseline gap-x-2">
                  <ui-chip
                    [label]="(request.state ?? 'unknown').toLowerCase()"
                    [tone]="tone(request)"
                    [fieldOf]="request"
                    [qitsField]="{ derived: ['state'] }"
                  />
                  <span class="font-mono text-xs text-fg" [fieldOf]="request" qitsField="version">{{
                    request.version ?? ''
                  }}</span>
                </span>
                <span
                  class="min-w-0 truncate text-fg-soft"
                  [attr.title]="items(request)"
                  [fieldOf]="request"
                  [qitsField]="{ derived: ['items'] }"
                  >{{ items(request) || '—' }}</span
                >
                <span
                  class="text-xs text-fg-muted"
                  [attr.title]="instant(request.approvedAt)"
                  [fieldOf]="request"
                  [qitsField]="{ derived: ['approvalState', 'approvedBy', 'approvedAt'] }"
                  >{{ approval(request) }}</span
                >
                <span
                  class="text-xs text-fg-muted tabular-nums md:text-right"
                  [attr.title]="instant(request.updatedAt)"
                  [fieldOf]="request"
                  [qitsField]="{ derived: ['updatedAt'] }"
                  >{{ ago(request.updatedAt) }}</span
                >
              </li>
            }
          </ul>
          <button
            type="button"
            class="mt-3 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg hover:bg-surface-muted"
            [class.hidden]="kept().length <= shown().length"
            (click)="more()"
          >
            Show more
          </button>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && kept().length === 0 ? 'block' : 'hidden'"
            data-empty
          >
            No release request of {{ repo() }} matches this filter.
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class RepositoryReleaseRequestsPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The address's repository name. */
  protected readonly repo = computed(() => this.paramMap().get('repo') ?? '');

  protected readonly slug = computed(
    () => this.selected.slug() ?? this.paramMap().get('slug') ?? '',
  );

  /** The state filter (`?state=`). */
  protected readonly filter = computed(() => requestFilterOf(this.query().get('state')));

  protected readonly filters = REQUEST_FILTERS;
  protected readonly on = 'border-accent-line bg-accent-soft text-accent';
  protected readonly off = 'border-line bg-surface text-fg-soft';

  /** A row: the request, under the repository (qits-2506). */
  protected readonly opening = outcomes('open-repository-release-request', {
    request: exit('projects/:slug/repositories/:repo/release-requests/:requestId'),
  });

  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The project's repositories, for the address's repository's id. */
  protected readonly repositories = qitsResource(PROJECT_REPOSITORY_PAGE, () => {
    const projectId = this.projectId();
    return projectId ? { path: { projectId } } : undefined;
  });

  private readonly found = computed(() =>
    repositoryNamed(
      (this.repositories.hasValue() ? this.repositories.value() : undefined)?.entries ?? [],
      this.repo(),
    ),
  );

  /** The repository's id, once found. */
  private readonly repoId = computed(() => this.found()?.id);

  /** Whether the project's repositories are read and none has the address's name. */
  protected readonly unknown = computed(() => this.repositories.hasValue() && !this.found());

  /** The repository's requests, as the filter asks the door. */
  protected readonly requests = qitsResource(
    REPOSITORY_RELEASE_REQUESTS,
    () => {
      const repoId = this.repoId();
      if (!repoId) return undefined;
      const state = stateQueryOf(this.filter());
      return state ? { path: { repoId }, query: { state } } : { path: { repoId } };
    },
    {
      refreshOn: {
        names: [...RELEASE_REQUEST_EVENTS],
        when: (event) => this.namesRepository(event),
      },
    },
  );

  private readonly answer = computed(
    (): RepositoryReleaseRequests =>
      (this.requests.hasValue() ? this.requests.value() : undefined) ?? NO_REQUESTS,
  );

  /** The requests the filter keeps. */
  protected readonly kept = computed((): readonly RepositoryReleaseRequest[] =>
    filterRequests(this.answer().requests ?? [], this.filter()),
  );

  /** How many rows show; back to one chunk when the filter changes. */
  private readonly limit = linkedSignal({ source: this.filter, computation: () => REQUESTS_CHUNK });

  protected readonly shown = computed(() => this.kept().slice(0, this.limit()));

  protected readonly state = computed((): LoadState => {
    const reads = [loadState(this.repositories), loadState(this.requests)];
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.repositories.reload();
        this.requests.reload();
      },
    },
  ];

  protected more(): void {
    this.limit.update((limit) => limit + REQUESTS_CHUNK);
  }

  protected retry(): void {
    if (this.repositories.status() === 'error') this.repositories.reload();
    if (this.requests.status() === 'error') this.requests.reload();
  }

  private namesRepository(event: QitsDomainEvent): boolean {
    const repoId = this.repoId();
    return !!repoId && payloadIds(event).repositoryId === repoId;
  }

  protected tone(request: RepositoryReleaseRequest) {
    return requestTone(request.state);
  }

  protected items(request: RepositoryReleaseRequest): string {
    return (request.items ?? [])
      .map((item) => item.label ?? '')
      .filter(Boolean)
      .join(', ');
  }

  protected approval(request: RepositoryReleaseRequest): string {
    if (request.approvalState === 'APPROVED') {
      const by = request.approvedBy ? ` by ${request.approvedBy}` : '';
      const when = request.approvedAt ? `, ${formatRelativeTime(request.approvedAt)}` : '';
      return `approved${by}${when}`;
    }
    if (request.approvalState === 'NOT_REQUIRED' || !request.approvalState) return 'no approval';
    return request.approvalState.toLowerCase().replace(/_/g, ' ');
  }

  protected ago(iso: string | null | undefined): string {
    return formatRelativeTime(iso);
  }

  protected instant(iso: string | null | undefined): string {
    return formatInstant(iso);
  }
}
