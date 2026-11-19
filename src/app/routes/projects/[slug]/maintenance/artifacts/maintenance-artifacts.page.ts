import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { currencyOf, type Currency } from '$core/maintenance/currency';
import type { ArtifactDependents, ArtifactEntry } from '$core/maintenance/maintenance.consumes';
import {
  MAINTENANCE_ARTIFACTS,
  MAINTENANCE_DEPENDENTS,
  MAINTENANCE_REPOSITORIES,
} from '$core/maintenance/maintenance.operations';
import { projectRepositories } from '$core/maintenance/project-repositories';
import { MaintenanceRepositoryLinks } from '$core/maintenance/repository-links';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

// Moved to `$core/maintenance/currency` (qits-2334, shared with the repository page).
export { currencyOf, type Currency };

/** A released artifact of the open project, keyed by its ecosystem and name. */
export interface ProjectArtifact extends ArtifactEntry {
  /** `<ecosystem>:<name>`, the entity's key: a name alone may be in two ecosystems. */
  readonly key: string;
}

/** One dependent of an artifact, as the detail reads it. */
export type ArtifactDependent = NonNullable<ArtifactDependents['dependents']>[number];

/** A dependent with its currency, keyed by the artifact it is. */
export interface ShownDependent extends ArtifactDependent {
  /** `<ecosystem>:<name>:<version>` of the embedding artifact, the entity's key. */
  readonly key: string;
  readonly currency: Currency;
}

/**
 * The ecosystems the dependents door reads (`listDependencyDependents`): nothing can embed a
 * daemon binary, and the door answers any other ecosystem with a 400.
 */
const DEPENDENT_ECOSYSTEMS: ReadonlySet<string> = new Set(['maven', 'npm', 'docker']);

/** Whether an artifact's detail can be read: its ecosystem is one the dependents door reads. */
export function hasDetail(artifact: ArtifactEntry): boolean {
  return DEPENDENT_ECOSYSTEMS.has(artifact.ecosystem ?? '');
}

/**
 * The artifacts produced by `repositories`, those with a behind dependent first, then by name (and
 * ecosystem, for a name in two).
 */
export function projectArtifacts(
  artifacts: readonly ArtifactEntry[],
  repositories: ReadonlySet<string>,
): readonly ProjectArtifact[] {
  return artifacts
    .filter((artifact) => repositories.has(artifact.repository ?? ''))
    .map((artifact) => ({ ...artifact, key: `${artifact.ecosystem ?? ''}:${artifact.name ?? ''}` }))
    .sort(
      (a, b) =>
        Number(behind(b)) - Number(behind(a)) ||
        (a.name ?? '').localeCompare(b.name ?? '') ||
        (a.ecosystem ?? '').localeCompare(b.ecosystem ?? ''),
    );
}

/** Whether a newest release of ours embeds an older copy of `artifact`. */
function behind(artifact: ArtifactEntry): boolean {
  return (artifact.behindCount ?? 0) > 0;
}

/** Only the artifacts with a behind dependent. */
export function onlyBehind(artifacts: readonly ProjectArtifact[]): readonly ProjectArtifact[] {
  return artifacts.filter(behind);
}

/** Whether an SBOM status says the release's contents are unknown: none read, or reading failed. */
function unread(status: string | undefined): boolean {
  return status === 'MISSING' || status === 'FAILED';
}

/** A count with its noun, `1 artifact`, `2 artifacts`. */
function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The listing's heading count: the artifacts, how many have a behind dependent, and how many have
 * a newest release whose SBOM is missing or failed (whose own contents are therefore unknown).
 */
export function artifactsCount(artifacts: readonly ProjectArtifact[]): string {
  const behindCount = artifacts.filter(behind).length;
  const unreadCount = artifacts.filter((artifact) => unread(artifact.sbomStatus)).length;
  return (
    `${counted(artifacts.length, 'artifact', 'artifacts')} · ${behindCount} shipped behind · ` +
    `${unreadCount} without a read SBOM`
  );
}

/** The dependents with their currency, the behind ones first, then by repository and artifact. */
export function shownDependents(answer: ArtifactDependents): readonly ShownDependent[] {
  const rank: Readonly<Record<Currency, number>> = { behind: 0, unknown: 1, current: 1 };
  return (answer.dependents ?? [])
    .map((dependent): ShownDependent => ({
      ...dependent,
      key: `${dependent.artifactEcosystem ?? ''}:${dependent.artifactName ?? ''}:${dependent.artifactVersion ?? ''}`,
      currency: currencyOf(dependent.embeddedVersion, answer.latest),
    }))
    .sort(
      (a, b) =>
        rank[a.currency] - rank[b.currency] ||
        (a.repository ?? '').localeCompare(b.repository ?? '') ||
        (a.artifactName ?? '').localeCompare(b.artifactName ?? ''),
    );
}

/** No row of the listing for the open artifact (yet). */
const NO_ROW: ArtifactEntry = {};

/** No dependents answer (yet). */
const NO_DEPENDENTS: ArtifactDependents = { dependents: [] };

/** A currency's chip tone. */
const CURRENCY_TONE: Readonly<Record<Currency, ChipTone>> = {
  current: 'ok',
  behind: 'waiting',
  unknown: 'neutral',
};

/** An SBOM status's chip tone: read, not read, failed. */
function sbomTone(status: string | undefined): ChipTone {
  if (status === 'INGESTED') return 'ok';
  if (status === 'FAILED') return 'failed';
  return status === 'MISSING' ? 'waiting' : 'neutral';
}

/** Whether a failed read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/** The service's reason for a 400, or undefined: any other failure has none to show. */
function badRequest(read: { status(): string; error(): unknown }): string | undefined {
  if (read.status() !== 'error') return undefined;
  const error = read.error();
  if (!(error instanceof QitsApiError) || error.status !== 400) return undefined;
  const message = (error.error as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message ? message : 'The service refused this artifact.';
}

/**
 * The Maintenance section's Artifacts page, at `/projects/<slug>/maintenance/artifacts`
 * (qits-2330): what this project has released, and who still ships an old copy. Not the global
 * `/artifacts` (the artifact store, qits-2316): this page reads qits-maintenance's view of the
 * releases, read off their SBOMs.
 *
 * The listing (no query) reads the inventory's repositories (`MAINTENANCE_REPOSITORIES`,
 * `listRepositories`) and every released artifact (`MAINTENANCE_ARTIFACTS`, `listArtifacts`). The
 * doors take no project, so the page keeps the artifacts whose `repository` is one of the open
 * project's. Artifacts with a behind dependent come first, then by name; each row shows the name,
 * ecosystem, producing repository (linked to its maintenance page, `open-maintenance-repository`,
 * qits-2334), the newest released version and how long ago it was built, the latest (unknown when
 * the service has none), the SBOM
 * status, and how many newest releases of ours embed it and how many of those an older copy. The
 * heading counts the artifacts, those shipped behind and those whose SBOM is missing or failed (a
 * release whose contents are unknown is absent from every dependents list). "Only behind"
 * (`?behind=true`, replacing the history entry) keeps the artifacts shipped behind. A name links
 * to the detail, except a daemon's: the dependents door reads maven, npm and docker only.
 *
 * The detail (`?ecosystem=&name=`) reads that artifact's dependents (`MAINTENANCE_DEPENDENTS`,
 * `listDependencyDependents`), keeping the listing's reads for the artifact's own row (its newest
 * release, when it was built, its SBOM status). Every released artifact whose newest release embeds
 * it, wherever it is (not filtered by project: the counts match the listing's), with its
 * repository (linked to its maintenance page), its name and ecosystem, the embedded version,
 * direct or transitive, when it was built, and current, behind or unknown against the latest; the behind ones first, then by repository. A
 * back link returns to the listing, keeping `behind`. A 400 (a hand-typed daemon link) shows the
 * service's reason.
 *
 * The reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only qits:admin, admin-agent, desk-admin, desk, system and agent may read the inventory)
 * is said as such; any other failure offers Retry; a project with no released artifact says
 * nothing of it has been released yet. Marks (qits-2141): the listing is the artifacts read, each
 * row an entity by its ecosystem and name; the detail is the dependents read, each dependent an
 * entity by its ecosystem, name and version.
 *
 * Staleness (qits-1270): none, no domain event follows the inventory; Refresh reads every open
 * read again.
 */
@Component({
  selector: 'app-maintenance-artifacts-page',
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
      <app-page-layout title="Artifacts" [actions]="actions">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p class="m-0 text-sm text-fg-soft">
            What this project has released, and who still ships an old copy.
          </p>
          <label class="flex items-center gap-2 text-sm text-fg" [class.hidden]="!!detail()">
            <input
              type="checkbox"
              [checked]="behindOnly()"
              (change)="setBehindOnly(checked($event))"
            />
            Only behind
          </label>
        </div>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading artifacts needs a staff role: qits:admin, qits:desk or qits:agent.
        </p>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!rejected()"
        >
          {{ rejected() }}
        </p>
        <ui-load-failure
          [message]="
            detail()
              ? 'This artifact’s dependents could not be read.'
              : 'This project’s artifacts could not be read.'
          "
          [class.hidden]="state() !== 'error' || refusal() || !!rejected()"
          (retry)="refresh()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          <section
            aria-labelledby="artifacts-listing"
            [class.hidden]="!!detail()"
            [qitsEntityList]="artifacts"
          >
            <p
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="empty() ? 'block' : 'hidden'"
            >
              Nothing of this project has been released yet.
            </p>
            <div [class.hidden]="empty()">
              <h2
                class="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-lg font-semibold text-fg"
                id="artifacts-listing"
              >
                Released
                <span
                  class="text-sm font-normal text-fg-muted"
                  [fieldOf]="artifactsAnswer()"
                  [qitsField]="{ derived: [] }"
                  >{{ count() }}</span
                >
              </h2>
              <ul
                class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
                aria-label="Released artifacts"
                [class.hidden]="shown().length === 0"
              >
                @for (artifact of shown(); track artifact.key) {
                  <li
                    class="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,11rem)_15rem] items-baseline gap-x-3 gap-y-1 px-3 py-2 max-md:grid-cols-1"
                    [qitsEntity]="artifact"
                    entityKey="key"
                  >
                    <span class="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      @if (linked(artifact)) {
                        <a
                          class="font-mono font-semibold break-all text-accent no-underline hover:underline"
                          [routerLink]="[]"
                          [queryParams]="{ ecosystem: artifact.ecosystem, name: artifact.name }"
                          queryParamsHandling="merge"
                          [fieldOf]="artifact"
                          qitsField="name"
                          >{{ artifact.name }}</a
                        >
                      } @else {
                        <span
                          class="font-mono font-semibold break-all text-fg"
                          [fieldOf]="artifact"
                          qitsField="name"
                          >{{ artifact.name }}</span
                        >
                      }
                      <span
                        class="text-xs text-fg-muted"
                        [fieldOf]="artifact"
                        qitsField="ecosystem"
                        >{{ artifact.ecosystem }}</span
                      >
                    </span>
                    <a
                      class="truncate text-accent no-underline hover:underline"
                      [qitsExit]="repositoryLinks.opening.repository"
                      [exitParams]="repositoryLinks.params(artifact.repository)"
                      [fieldOf]="artifact"
                      qitsField="repository"
                      >{{ artifact.repository }}</a
                    >
                    <span class="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span
                        class="font-mono text-fg-soft"
                        [fieldOf]="artifact"
                        qitsField="version"
                        >{{ artifact.version }}</span
                      >
                      <span
                        class="text-fg-muted tabular-nums"
                        [attr.title]="instant(artifact.occurredAt)"
                        [fieldOf]="artifact"
                        [qitsField]="{ derived: ['occurredAt'] }"
                        >{{ ago(artifact.occurredAt) }}</span
                      >
                      <span
                        class="text-fg-muted"
                        [fieldOf]="artifact"
                        [qitsField]="{ derived: ['latest'] }"
                        >latest {{ artifact.latest ?? 'unknown' }}</span
                      >
                    </span>
                    <span
                      class="flex flex-wrap items-baseline justify-end gap-x-2 text-xs max-md:justify-start"
                    >
                      <ui-chip
                        [label]="sbomLabel(artifact.sbomStatus)"
                        [tone]="sbomTone(artifact.sbomStatus)"
                        [fieldOf]="artifact"
                        [qitsField]="{ derived: ['sbomStatus'] }"
                      />
                      <span
                        class="text-fg-soft tabular-nums"
                        [fieldOf]="artifact"
                        [qitsField]="{ derived: ['dependentCount'] }"
                        >{{ plural(artifact.dependentCount ?? 0, 'dependent') }}</span
                      >
                      <ui-chip
                        [label]="(artifact.behindCount ?? 0) + ' behind'"
                        tone="waiting"
                        [class.hidden]="!(artifact.behindCount ?? 0)"
                        [fieldOf]="artifact"
                        [qitsField]="{ derived: ['behindCount'] }"
                      />
                    </span>
                  </li>
                }
              </ul>
              <p class="m-0 px-3 py-4 text-sm text-fg-muted" [class.hidden]="shown().length > 0">
                No artifact of this project is shipped behind.
              </p>
            </div>
          </section>
          <section
            aria-labelledby="artifact-detail"
            [class.hidden]="!detail()"
            [qitsEntityList]="dependents"
          >
            <a
              class="mb-3 inline-block text-sm text-accent no-underline hover:underline"
              [routerLink]="[]"
              [queryParams]="{ ecosystem: null, name: null }"
              queryParamsHandling="merge"
              >← All artifacts</a
            >
            <h2
              class="m-0 mb-2 font-mono text-lg font-semibold break-all text-fg"
              id="artifact-detail"
            >
              {{ detail()?.name }}
            </h2>
            <dl
              class="m-0 mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
              aria-label="Facts"
            >
              <dt class="text-fg-muted">Ecosystem</dt>
              <dd
                class="m-0 text-fg"
                [fieldOf]="dependentsAnswer()"
                [qitsField]="{ derived: ['ecosystem'] }"
              >
                {{ dependentsAnswer().ecosystem }}
              </dd>
              <dt class="text-fg-muted">Latest</dt>
              <dd
                class="m-0 font-mono text-fg"
                [fieldOf]="dependentsAnswer()"
                [qitsField]="{ derived: ['latest'] }"
              >
                {{ dependentsAnswer().latest ?? 'unknown' }}
              </dd>
              <dt class="text-fg-muted">Newest release</dt>
              <dd class="m-0 flex flex-wrap items-baseline gap-x-2 text-fg">
                <span class="font-mono" [fieldOf]="row()" [qitsField]="{ derived: ['version'] }">{{
                  row().version ?? 'unknown'
                }}</span>
                <span
                  class="text-fg-muted tabular-nums"
                  [attr.title]="instant(row().occurredAt)"
                  [class.hidden]="!row().occurredAt"
                  [fieldOf]="row()"
                  [qitsField]="{ derived: ['occurredAt'] }"
                  >built {{ ago(row().occurredAt) }}</span
                >
              </dd>
              <dt class="text-fg-muted">SBOM</dt>
              <dd class="m-0">
                <ui-chip
                  [label]="sbomLabel(row().sbomStatus)"
                  [tone]="sbomTone(row().sbomStatus)"
                  [fieldOf]="row()"
                  [qitsField]="{ derived: ['sbomStatus'] }"
                />
              </dd>
            </dl>
            <h3
              class="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-base font-semibold text-fg"
            >
              Embedded by
              <span
                class="text-sm font-normal text-fg-muted"
                [fieldOf]="dependentsAnswer()"
                [qitsField]="{ derived: ['dependents'] }"
                >{{ dependentsCount() }}</span
              >
            </h3>
            <ul
              class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
              aria-label="Dependents"
              [class.hidden]="dependentRows().length === 0"
            >
              @for (dependent of dependentRows(); track dependent.key) {
                <li
                  class="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,10rem)_5rem] items-baseline gap-x-3 gap-y-1 px-3 py-2 max-md:grid-cols-[1fr_auto]"
                  [qitsEntity]="dependent"
                  entityKey="key"
                >
                  <a
                    class="truncate text-accent no-underline hover:underline"
                    [qitsExit]="repositoryLinks.opening.repository"
                    [exitParams]="repositoryLinks.params(dependent.repository)"
                    [fieldOf]="dependent"
                    qitsField="repository"
                    >{{ dependent.repository }}</a
                  >
                  <span class="flex min-w-0 flex-wrap items-baseline gap-x-2 max-md:col-start-1">
                    <span
                      class="font-mono break-all text-fg-soft"
                      [fieldOf]="dependent"
                      qitsField="artifactName"
                      >{{ dependent.artifactName }}</span
                    >
                    <span
                      class="text-xs text-fg-muted"
                      [fieldOf]="dependent"
                      qitsField="artifactEcosystem"
                      >{{ dependent.artifactEcosystem }}</span
                    >
                    <span
                      class="text-xs text-fg-muted tabular-nums"
                      [attr.title]="instant(dependent.occurredAt)"
                      [fieldOf]="dependent"
                      [qitsField]="{ derived: ['occurredAt'] }"
                      >built {{ ago(dependent.occurredAt) }}</span
                    >
                  </span>
                  <span class="flex flex-wrap items-baseline gap-x-2 text-xs max-md:col-start-1">
                    <span
                      class="font-mono text-fg-soft"
                      [fieldOf]="dependent"
                      qitsField="embeddedVersion"
                      >{{ dependent.embeddedVersion }}</span
                    >
                    <span
                      class="text-fg-muted"
                      [fieldOf]="dependent"
                      [qitsField]="{ derived: ['direct'] }"
                      >{{ dependent.direct ? 'direct' : 'transitive' }}</span
                    >
                  </span>
                  <ui-chip
                    class="justify-self-end max-md:col-start-2 max-md:row-start-1"
                    [label]="currencyLabel(dependent)"
                    [tone]="currencyTone(dependent)"
                    [fieldOf]="dependent"
                    [qitsField]="{ derived: ['embeddedVersion'] }"
                  />
                </li>
              }
            </ul>
            <p
              class="m-0 px-3 py-4 text-sm text-fg-muted"
              [class.hidden]="dependentRows().length > 0"
            >
              Nothing embeds this, or no SBOM has been read for whatever does.
            </p>
          </section>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class MaintenanceArtifactsPage {
  private readonly selected = inject(SelectedProject);
  /** The producing repository and each dependent's link their maintenance pages. */
  protected readonly repositoryLinks = inject(MaintenanceRepositoryLinks);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** "Only behind", from the URL (`?behind=true`). */
  protected readonly behindOnly = computed(() => this.params()?.get('behind') === 'true');

  /** The artifact the URL opens (`?ecosystem=&name=`), or none: the listing. */
  protected readonly detail = computed(() => {
    const ecosystem = this.params()?.get('ecosystem');
    const name = this.params()?.get('name');
    return ecosystem && name ? { ecosystem, name } : undefined;
  });

  /** The open project's id, in the browser only: the reads wait for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The inventory's repositories, to tell the project's own. */
  protected readonly repositories = qitsResource(MAINTENANCE_REPOSITORIES, () =>
    this.projectId() ? {} : undefined,
  );

  /** Every released artifact; the detail keeps it for the artifact's own row. */
  protected readonly artifacts = qitsResource(MAINTENANCE_ARTIFACTS, () =>
    this.projectId() ? {} : undefined,
  );

  /** The open artifact's dependents, on the detail only. */
  protected readonly dependents = qitsResource(MAINTENANCE_DEPENDENTS, () => {
    const detail = this.detail();
    return this.projectId() && detail ? { query: { ...detail } } : undefined;
  });

  /** The names of the open project's repositories. */
  private readonly own = computed(() =>
    projectRepositories(
      this.repositories.hasValue() ? (this.repositories.value() ?? []) : [],
      this.projectId(),
    ),
  );

  /** The artifacts' answer; none until it answered. */
  protected readonly artifactsAnswer = computed(() =>
    this.artifacts.hasValue() ? (this.artifacts.value() ?? []) : [],
  );

  /** The project's artifacts, those shipped behind first. */
  private readonly all = computed(() => projectArtifacts(this.artifactsAnswer(), this.own()));

  /** What the listing shows: all, or with "Only behind" those shipped behind alone. */
  protected readonly shown = computed(() =>
    this.behindOnly() ? onlyBehind(this.all()) : this.all(),
  );

  protected readonly count = computed(() => artifactsCount(this.all()));

  /** The open artifact's own row of the listing (from any project); an empty one if absent. */
  protected readonly row = computed((): ArtifactEntry => {
    const detail = this.detail();
    const row = detail
      ? this.artifactsAnswer().find(
          (artifact) => artifact.ecosystem === detail.ecosystem && artifact.name === detail.name,
        )
      : undefined;
    return row ?? NO_ROW;
  });

  /** The dependents' answer; none until it answered. */
  protected readonly dependentsAnswer = computed(
    (): ArtifactDependents =>
      (this.dependents.hasValue() ? this.dependents.value() : undefined) ?? NO_DEPENDENTS,
  );

  /** The dependents with their currency, the behind ones first. */
  protected readonly dependentRows = computed(() => shownDependents(this.dependentsAnswer()));

  /** The detail's heading count: its dependents and how many embed an older copy. */
  protected readonly dependentsCount = computed(() => {
    const rows = this.dependentRows();
    const behindCount = rows.filter((row) => row.currency === 'behind').length;
    return `${counted(rows.length, 'dependent', 'dependents')} · ${behindCount} behind`;
  });

  /** The reads the open view waits for: the listing's two, and on the detail its dependents. */
  private readonly reads = computed(() =>
    this.detail()
      ? [this.repositories, this.artifacts, this.dependents]
      : [this.repositories, this.artifacts],
  );

  /** The open view's reads: failed if any failed, loaded once all have answered. */
  protected readonly state = computed((): LoadState => {
    const states = this.reads().map((read) => loadState(read));
    if (states.includes('error')) return 'error';
    return states.every((state) => state === 'loaded') ? 'loaded' : 'loading';
  });

  /** Whether any read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => this.reads().some((read) => refused(read)));

  /** The service's reason the detail's artifact was refused (a 400), or undefined. */
  protected readonly rejected = computed(() =>
    this.detail() && !this.refusal() ? badRequest(this.dependents) : undefined,
  );

  /** Whether nothing of the project has been released. */
  protected readonly empty = computed(() => this.state() === 'loaded' && this.all().length === 0);

  /** Refresh: reads the repositories and the artifacts again, and on the detail its dependents. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.refresh() },
  ];

  protected refresh(): void {
    this.repositories.reload();
    this.artifacts.reload();
    if (this.detail()) this.dependents.reload();
  }

  protected readonly linked = hasDetail;
  protected readonly sbomTone = sbomTone;

  protected sbomLabel(status: string | undefined): string {
    return status ? `SBOM ${status.toLowerCase()}` : 'SBOM unknown';
  }

  /** A dependent's currency against the latest (`currencyOf`, worked out with its row). */
  protected currencyLabel(dependent: ShownDependent): Currency {
    return dependent.currency;
  }

  protected currencyTone(dependent: ShownDependent): ChipTone {
    return CURRENCY_TONE[dependent.currency];
  }

  protected plural(n: number, word: string): string {
    return counted(n, word, `${word}s`);
  }

  protected ago(iso: string | undefined): string {
    return formatRelativeTime(iso);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** Puts "Only behind" into the URL, in place of the current entry. */
  protected setBehindOnly(on: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { behind: on ? 'true' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
