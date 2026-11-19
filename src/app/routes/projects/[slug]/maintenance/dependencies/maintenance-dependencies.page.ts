import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import type { DependencyEntry } from '$core/maintenance/maintenance.consumes';
import {
  MAINTENANCE_DEPENDENCIES,
  MAINTENANCE_REPOSITORIES,
} from '$core/maintenance/maintenance.operations';
import { projectRepositories } from '$core/maintenance/project-repositories';
import { MaintenanceRepositoryLinks } from '$core/maintenance/repository-links';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** One pin of a dependency, as the page shows it. */
export type DependencyPin = NonNullable<DependencyEntry['pins']>[number];

/** A dependency with only the open project's pins, keyed by its ecosystem and name. */
export interface ProjectDependency extends DependencyEntry {
  /** `<ecosystem>:<name>`, the entity's key: a name alone may be in two ecosystems. */
  readonly key: string;
  readonly pins: DependencyPin[];
  /** How many of its pins are behind (`pending`). */
  readonly behind: number;
}

/**
 * The dependencies with only the pins of `repositories`, a dependency left with none dropped,
 * those with a behind pin first, then by name (and ecosystem, for a name in two).
 */
export function projectDependencies(
  dependencies: readonly DependencyEntry[],
  repositories: ReadonlySet<string>,
): readonly ProjectDependency[] {
  return dependencies
    .map((dependency): ProjectDependency => {
      const pins = (dependency.pins ?? []).filter((pin) => repositories.has(pin.repository ?? ''));
      return {
        ...dependency,
        key: `${dependency.ecosystem ?? ''}:${dependency.name ?? ''}`,
        pins,
        behind: pins.filter((pin) => pin.pending === true).length,
      };
    })
    .filter((dependency) => dependency.pins.length > 0)
    .sort(
      (a, b) =>
        Number(b.behind > 0) - Number(a.behind > 0) ||
        (a.name ?? '').localeCompare(b.name ?? '') ||
        (a.ecosystem ?? '').localeCompare(b.ecosystem ?? ''),
    );
}

/** Only the behind pins, and only the dependencies with any. */
export function onlyBehind(
  dependencies: readonly ProjectDependency[],
): readonly ProjectDependency[] {
  return dependencies
    .filter((dependency) => dependency.behind > 0)
    .map((dependency) => ({
      ...dependency,
      pins: dependency.pins.filter((pin) => pin.pending === true),
    }));
}

/** A count with its noun, `1 dependency`, `2 dependencies`. */
function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A section heading's count: its dependencies and how many of their pins are behind, and, while a
 * search is set, the glob they matched (`3 dependencies · 1 behind matching "*p*"`).
 */
export function sectionCount(dependencies: readonly ProjectDependency[], glob?: string): string {
  const behind = dependencies.reduce((sum, dependency) => sum + dependency.behind, 0);
  const count = `${counted(dependencies.length, 'dependency', 'dependencies')} · ${behind} behind`;
  return glob ? `${count} matching "${glob}"` : count;
}

/**
 * What a section says when it lists nothing: `kind` is `internal` or `external`; `glob` the
 * search, if any; `behindOnly` whether "Only behind" is on.
 */
export function sectionEmpty(
  kind: 'internal' | 'external',
  glob: string | undefined,
  behindOnly: boolean,
): string {
  if (glob)
    return behindOnly
      ? `No ${kind} pin matching "${glob}" is behind.`
      : `No ${kind} dependency matches "${glob}".`;
  return behindOnly ? `No ${kind} pin is behind.` : `No ${kind} dependencies.`;
}

/** The dependencies read of `kind`, with the searched `glob` only when one is set. */
export function dependenciesQuery(
  kind: 'INTERNAL' | 'EXTERNAL',
  glob: string | undefined,
): { query: { kind: 'INTERNAL' | 'EXTERNAL'; name?: string } } {
  return { query: glob ? { kind, name: glob } : { kind } };
}

/** Whether a failed read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * The Maintenance section's Dependencies page, at `/projects/<slug>/maintenance/dependencies`
 * (qits-2317; the section's own address redirects here): the project's dependencies, Internal and
 * External, each with the version every repository of the project pins and whether that pin is
 * behind.
 *
 * It reads qits-maintenance's inventory: its repositories (`MAINTENANCE_REPOSITORIES`,
 * `listRepositories`) and the dependencies of each kind (`MAINTENANCE_DEPENDENCIES`,
 * `listDependencies?kind=INTERNAL` and `?kind=EXTERNAL`; never the bare listing, which mixes in a
 * repository's own modules). The doors take no project, so the page keeps only the pins of the
 * repositories whose `project` is the open project's id, and drops a dependency left with none.
 * Within a section the dependencies with a behind pin come first, then by name; each shows its
 * ecosystem and latest version (unknown when the service has none, with its `error` beside it), and
 * its pins: the repository (linked to its maintenance page, `open-maintenance-repository`,
 * qits-2334), the version, the manifest and a "behind" tag on a `pending` pin. Each heading counts the section's dependencies and its
 * behind pins. "Only behind" (`?behind=true`, replacing the history entry) hides the current pins
 * and the dependencies with none behind.
 *
 * Search (qits-2331, replacing qits-maintenance-frontend's `external/dependencies` page): a name
 * glob, `?name=` (trimmed; a blank search removes it), which a submitted search pushes as a new
 * history entry, so Back is the previous search, and which fills the box when a link is opened.
 * qits-maintenance matches it against the whole name, case-sensitively (`*` any run, `?` one
 * character): with it set, both dependencies reads carry it (`?kind=…&name=…`) and the page
 * filters no name itself; without it, the reads are exactly the unsearched ones. Each heading's
 * count then says what it matched, a section with no match says so ("No internal dependency
 * matches …"), and "nothing has been scanned" is never said while searching: a search that
 * matched nothing is not an empty inventory. "Only behind" composes with it.
 *
 * The reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only qits:admin, admin-agent, desk-admin, desk, system and agent may read the inventory)
 * is said as such; any other failure offers Retry; a project none of whose repositories pins
 * anything says nothing of it has been scanned yet. Marks (qits-2141): each section is its kind's
 * dependencies read, each dependency an entity by its ecosystem and name.
 *
 * Staleness (qits-1270): none, no domain event follows the inventory; Refresh reads all three
 * again.
 */
@Component({
  selector: 'app-maintenance-dependencies-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Dependencies" [actions]="actions">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p class="m-0 text-sm text-fg-soft">
            What this project’s repositories pin, and which of those pins are behind.
          </p>
          <label class="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              [checked]="behindOnly()"
              (change)="setBehindOnly(checked($event))"
            />
            Only behind
          </label>
        </div>
        <form
          class="mb-4 flex flex-col gap-1"
          role="search"
          aria-label="Dependencies"
          (submit)="$event.preventDefault(); search(nameInput.value)"
        >
          <label class="text-sm font-semibold text-fg" for="dependencies-name"
            >Dependency name</label
          >
          <div class="flex flex-wrap items-center gap-2">
            <input
              #nameInput
              id="dependencies-name"
              type="search"
              name="name"
              autocomplete="off"
              spellcheck="false"
              class="box-border h-8 min-w-0 flex-1 basis-56 rounded-md border border-line bg-surface px-2 font-mono text-sm text-fg"
              aria-describedby="dependencies-name-hint"
              [value]="name() ?? ''"
            />
            <button
              type="submit"
              class="inline-flex h-8 cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold whitespace-nowrap text-fg-soft hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Search
            </button>
          </div>
          <p class="m-0 text-xs text-fg-muted" id="dependencies-name-hint">
            Matched against the whole name, case-sensitively: <code>*</code> is any run of
            characters, <code>?</code> is one. For example <code>&#64;angular/*</code>,
            <code>*quarkus*</code>, <code>io.quarkus.platform:*</code>.
          </p>
        </form>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading dependencies needs a staff role: qits:admin, qits:desk or qits:agent.
        </p>
        <ui-load-failure
          message="This project’s dependencies could not be read."
          [class.hidden]="state() !== 'error' || refusal()"
          (retry)="refresh()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="empty() ? 'block' : 'hidden'"
          >
            Nothing of this project has been scanned yet: none of its repositories pins anything.
          </p>
          <div class="flex flex-col gap-8" [class.hidden]="empty()">
            <section aria-labelledby="dependencies-internal" [qitsEntityList]="internal">
              <h2
                class="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-lg font-semibold text-fg"
                id="dependencies-internal"
              >
                Internal
                <span
                  class="text-sm font-normal text-fg-muted"
                  [fieldOf]="internalAnswer()"
                  [qitsField]="{ derived: [] }"
                  >{{ internalCount() }}</span
                >
              </h2>
              <ul
                class="m-0 flex list-none flex-col gap-3 p-0"
                aria-label="Internal dependencies"
                [class.hidden]="internalShown().length === 0"
              >
                @for (dependency of internalShown(); track dependency.key) {
                  <li
                    class="rounded-md border border-line bg-surface"
                    [qitsEntity]="dependency"
                    entityKey="key"
                  >
                    <div
                      class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-3 py-2"
                    >
                      <span
                        class="font-mono text-sm font-semibold break-all text-fg"
                        [fieldOf]="dependency"
                        qitsField="name"
                        >{{ dependency.name }}</span
                      >
                      <span
                        class="text-xs text-fg-muted"
                        [fieldOf]="dependency"
                        qitsField="ecosystem"
                        >{{ dependency.ecosystem }}</span
                      >
                      <span
                        class="text-xs text-fg-soft"
                        [fieldOf]="dependency"
                        [qitsField]="{ derived: ['latest'] }"
                        >latest {{ dependency.latest ?? 'unknown' }}</span
                      >
                      <span
                        class="text-xs text-danger-strong"
                        [class.hidden]="!dependency.error"
                        [fieldOf]="dependency"
                        qitsField="error"
                        >{{ dependency.error }}</span
                      >
                    </div>
                    <ul class="m-0 flex list-none flex-col divide-y divide-line p-0 text-sm">
                      @for (pin of dependency.pins; track $index) {
                        <li
                          class="grid grid-cols-[minmax(0,16rem)_minmax(0,10rem)_1fr_auto] items-baseline gap-x-3 px-3 py-1.5 max-md:grid-cols-[1fr_auto]"
                        >
                          <a
                            class="truncate text-accent no-underline hover:underline"
                            [qitsExit]="repositoryLinks.opening.repository"
                            [exitParams]="repositoryLinks.params(pin.repository)"
                            [fieldOf]="pin"
                            qitsField="repository"
                            >{{ pin.repository }}</a
                          >
                          <span
                            class="font-mono text-xs text-fg-soft max-md:col-start-1"
                            [fieldOf]="pin"
                            qitsField="version"
                            >{{ pin.version }}</span
                          >
                          <span
                            class="truncate font-mono text-xs text-fg-muted max-md:col-span-2"
                            [fieldOf]="pin"
                            qitsField="manifestPath"
                            >{{ pin.manifestPath }}</span
                          >
                          <ui-chip
                            class="justify-self-end max-md:col-start-2 max-md:row-start-1"
                            label="behind"
                            tone="waiting"
                            [class.hidden]="!pin.pending"
                            [fieldOf]="pin"
                            [qitsField]="{ derived: ['pending'] }"
                          />
                        </li>
                      }
                    </ul>
                  </li>
                }
              </ul>
              <p
                class="m-0 px-3 py-4 text-sm text-fg-muted"
                [class.hidden]="internalShown().length > 0"
              >
                {{ internalEmpty() }}
              </p>
            </section>
            <section aria-labelledby="dependencies-external" [qitsEntityList]="external">
              <h2
                class="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-lg font-semibold text-fg"
                id="dependencies-external"
              >
                External
                <span
                  class="text-sm font-normal text-fg-muted"
                  [fieldOf]="externalAnswer()"
                  [qitsField]="{ derived: [] }"
                  >{{ externalCount() }}</span
                >
              </h2>
              <ul
                class="m-0 flex list-none flex-col gap-3 p-0"
                aria-label="External dependencies"
                [class.hidden]="externalShown().length === 0"
              >
                @for (dependency of externalShown(); track dependency.key) {
                  <li
                    class="rounded-md border border-line bg-surface"
                    [qitsEntity]="dependency"
                    entityKey="key"
                  >
                    <div
                      class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-3 py-2"
                    >
                      <span
                        class="font-mono text-sm font-semibold break-all text-fg"
                        [fieldOf]="dependency"
                        qitsField="name"
                        >{{ dependency.name }}</span
                      >
                      <span
                        class="text-xs text-fg-muted"
                        [fieldOf]="dependency"
                        qitsField="ecosystem"
                        >{{ dependency.ecosystem }}</span
                      >
                      <span
                        class="text-xs text-fg-soft"
                        [fieldOf]="dependency"
                        [qitsField]="{ derived: ['latest'] }"
                        >latest {{ dependency.latest ?? 'unknown' }}</span
                      >
                      <span
                        class="text-xs text-danger-strong"
                        [class.hidden]="!dependency.error"
                        [fieldOf]="dependency"
                        qitsField="error"
                        >{{ dependency.error }}</span
                      >
                    </div>
                    <ul class="m-0 flex list-none flex-col divide-y divide-line p-0 text-sm">
                      @for (pin of dependency.pins; track $index) {
                        <li
                          class="grid grid-cols-[minmax(0,16rem)_minmax(0,10rem)_1fr_auto] items-baseline gap-x-3 px-3 py-1.5 max-md:grid-cols-[1fr_auto]"
                        >
                          <a
                            class="truncate text-accent no-underline hover:underline"
                            [qitsExit]="repositoryLinks.opening.repository"
                            [exitParams]="repositoryLinks.params(pin.repository)"
                            [fieldOf]="pin"
                            qitsField="repository"
                            >{{ pin.repository }}</a
                          >
                          <span
                            class="font-mono text-xs text-fg-soft max-md:col-start-1"
                            [fieldOf]="pin"
                            qitsField="version"
                            >{{ pin.version }}</span
                          >
                          <span
                            class="truncate font-mono text-xs text-fg-muted max-md:col-span-2"
                            [fieldOf]="pin"
                            qitsField="manifestPath"
                            >{{ pin.manifestPath }}</span
                          >
                          <ui-chip
                            class="justify-self-end max-md:col-start-2 max-md:row-start-1"
                            label="behind"
                            tone="waiting"
                            [class.hidden]="!pin.pending"
                            [fieldOf]="pin"
                            [qitsField]="{ derived: ['pending'] }"
                          />
                        </li>
                      }
                    </ul>
                  </li>
                }
              </ul>
              <p
                class="m-0 px-3 py-4 text-sm text-fg-muted"
                [class.hidden]="externalShown().length > 0"
              >
                {{ externalEmpty() }}
              </p>
            </section>
          </div>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class MaintenanceDependenciesPage {
  private readonly selected = inject(SelectedProject);
  /** Each pin's repository links its maintenance page. */
  protected readonly repositoryLinks = inject(MaintenanceRepositoryLinks);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** "Only behind", from the URL (`?behind=true`). */
  protected readonly behindOnly = computed(() => this.params()?.get('behind') === 'true');

  /** The searched name glob, from the URL (`?name=`), trimmed; none when blank. */
  protected readonly name = computed(() => this.params()?.get('name')?.trim() || undefined);

  /** The open project's id, in the browser only: the reads wait for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The inventory's repositories, to tell the project's own. */
  protected readonly repositories = qitsResource(MAINTENANCE_REPOSITORIES, () =>
    this.projectId() ? {} : undefined,
  );

  /** The INTERNAL dependencies (our own artifacts) with their pins. */
  protected readonly internal = qitsResource(MAINTENANCE_DEPENDENCIES, () =>
    this.projectId() ? dependenciesQuery('INTERNAL', this.name()) : undefined,
  );

  /** The EXTERNAL dependencies (everyone else's) with their pins. */
  protected readonly external = qitsResource(MAINTENANCE_DEPENDENCIES, () =>
    this.projectId() ? dependenciesQuery('EXTERNAL', this.name()) : undefined,
  );

  /** The names of the open project's repositories. */
  private readonly own = computed(() =>
    projectRepositories(
      this.repositories.hasValue() ? (this.repositories.value() ?? []) : [],
      this.projectId(),
    ),
  );

  /** The INTERNAL dependencies' answer; none until it answered. */
  protected readonly internalAnswer = computed(() =>
    this.internal.hasValue() ? (this.internal.value() ?? []) : [],
  );

  /** The EXTERNAL dependencies' answer; none until it answered. */
  protected readonly externalAnswer = computed(() =>
    this.external.hasValue() ? (this.external.value() ?? []) : [],
  );

  /** The project's INTERNAL dependencies, behind ones first. */
  private readonly internalAll = computed(() =>
    projectDependencies(this.internalAnswer(), this.own()),
  );

  /** The project's EXTERNAL dependencies, behind ones first. */
  private readonly externalAll = computed(() =>
    projectDependencies(this.externalAnswer(), this.own()),
  );

  /** What the Internal section lists: all, or with "Only behind" the behind pins alone. */
  protected readonly internalShown = computed(() =>
    this.behindOnly() ? onlyBehind(this.internalAll()) : this.internalAll(),
  );

  /** What the External section lists: all, or with "Only behind" the behind pins alone. */
  protected readonly externalShown = computed(() =>
    this.behindOnly() ? onlyBehind(this.externalAll()) : this.externalAll(),
  );

  protected readonly internalCount = computed(() => sectionCount(this.internalAll(), this.name()));
  protected readonly externalCount = computed(() => sectionCount(this.externalAll(), this.name()));

  protected readonly internalEmpty = computed(() =>
    sectionEmpty('internal', this.name(), this.behindOnly()),
  );
  protected readonly externalEmpty = computed(() =>
    sectionEmpty('external', this.name(), this.behindOnly()),
  );

  /** All three reads: failed if any failed, loaded once all have answered. */
  protected readonly state = computed((): LoadState => {
    const states = [this.repositories, this.internal, this.external].map((read) => loadState(read));
    if (states.includes('error')) return 'error';
    return states.every((state) => state === 'loaded') ? 'loaded' : 'loading';
  });

  /** Whether any read was refused for the viewer's roles. */
  protected readonly refusal = computed(
    () => refused(this.repositories) || refused(this.internal) || refused(this.external),
  );

  /**
   * Whether nothing of the project has been scanned: none of its repositories pins anything. Never
   * while searching: a search that matched nothing is not an empty inventory.
   */
  protected readonly empty = computed(
    () =>
      this.state() === 'loaded' &&
      !this.name() &&
      this.internalAll().length === 0 &&
      this.externalAll().length === 0,
  );

  /** Refresh: reads the repositories and both kinds of dependencies again. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.refresh() },
  ];

  protected refresh(): void {
    this.repositories.reload();
    this.internal.reload();
    this.external.reload();
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** Puts the searched glob into the URL as a new history entry; a blank search removes it. */
  protected search(value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { name: value.trim() || null },
      queryParamsHandling: 'merge',
    });
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
