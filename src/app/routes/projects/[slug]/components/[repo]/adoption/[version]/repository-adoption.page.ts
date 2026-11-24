import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { QitsApiError, QitsEntity, QitsExit, QitsField, qitsResource } from '@qits/angular';
import {
  adoptionCaption,
  adoptionChart,
  CARD_HEIGHT,
  CARD_WIDTH,
  type ChartNode,
} from '$core/maintenance/adoption-chart';
import { ADOPTION_EVENTS } from '$core/maintenance/adoption-events';
import type { AdoptionJourney } from '$core/maintenance/maintenance.consumes';
import { MAINTENANCE_ADOPTION } from '$core/maintenance/maintenance.operations';
import { MaintenanceRepositoryLinks } from '$core/maintenance/repository-links';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** `ecosystem name` of every package the release published, comma-joined. */
export function packagesLine(journey: Pick<AdoptionJourney, 'packages'>): string {
  return (journey.packages ?? []).map((held) => `${held.ecosystem} ${held.name}`).join(', ');
}

/** Whether the read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * How far one release got, at `/projects/<slug>/components/<repo>/adoption/<version>` (qits-2333;
 * replaces qits-maintenance-frontend's `adoption/:repository/:version`; under its repository since
 * qits-2489, where the old `maintenance/adoption/<repository>/<version>` redirects), drawn left to
 * right as the graph it is. A detail page of the repository: the sidebar keeps its Dependents
 * entry current. Reached from a release request's "Adoption of this release" and the Dependents
 * page's releases.
 *
 * - **The journey is served, not stitched.** qits-maintenance traces the closure of everything
 *   downstream of the release and decides each step's adoption per request, so the page makes ONE
 *   read (`MAINTENANCE_ADOPTION`, `getAdoptionByRelease?repository=&version=`), in the browser only
 *   (the server has no session), through `qitsResource`, and draws its answer. No project filter:
 *   the release is the whole address, which anything holding a release can compose.
 * - **A DAG, one column per hop, rows ordered by the parents**: the layout is
 *   `core/maintenance/adoption-chart.ts` (`adoptionChart`), a pure function with its own spec. The
 *   cards are fixed boxes, so the SVG edges under them are drawn from the same arithmetic; the
 *   chart scrolls sideways inside its own box on a narrow screen, never the page.
 * - **Two states, and PENDING is not a failure.** An adopted card names which of the repository's
 *   own releases first carried the release, and when; a pending one is quiet (a neutral chip, the
 *   card muted): it is the ordinary state of a downstream repository an hour after a release.
 * - The header names the release and what it published (`ecosystem name`, comma-joined); the
 *   caption counts the repositories downstream and those carrying it. No adopter is "This release
 *   reached no repository."; no package is a notice that the service holds no bill of materials
 *   for the release, so nothing downstream can match (the closure below is still drawn).
 * - An adopter the inventory holds (`repositoryStatus` `OK`) links that repository's
 *   Depends on page (`MaintenanceRepositoryLinks`, `open-repository-depends-on`), as every
 *   repository name of a bump or a dependent does; one that left the catalog (`ABSENT`) says so.
 *
 * States: loading; a 403 a refusal (only qits:admin, admin-agent, desk-admin, desk, system and
 * agent may read it); any other failure offers Retry. Marks (qits-2141): the journey is an entity
 * by its `repository`, each value its field or the fields it is derived from.
 *
 * Staleness (qits-1270): `ADOPTION_EVENTS` (`SCMRelease`, `SoftwareRelease`) → the journey,
 * debounced 1 s: any repository's release can be the downstream one that takes this release, and
 * the events name a repository the answer does not hold by id. Nothing polls; Refresh reads it
 * again.
 */
@Component({
  selector: 'app-repository-adoption-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, QitsEntity, QitsExit, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Adoption" [actions]="actions">
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading a release's adoption needs a staff role: qits:admin, qits:desk or qits:agent.
        </p>
        <ui-load-failure
          message="This release's adoption could not be read."
          [class.hidden]="state() !== 'error' || refusal()"
          (retry)="read.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          @if (shown(); as journey) {
            <article class="min-w-0" [qitsEntity]="journey" entityKey="repository" data-adoption>
              <header class="mb-3">
                <h2 class="m-0 text-lg font-semibold break-all text-fg">
                  <span [fieldOf]="journey" qitsField="repository">{{ journey.repository }}</span
                  ><span class="text-fg-faint">&#64;</span
                  ><span [fieldOf]="journey" qitsField="version">{{ journey.version }}</span>
                </h2>
                @if (packages(); as packages) {
                  <p
                    class="mt-1 mb-0 font-mono text-xs wrap-anywhere text-fg-soft"
                    [fieldOf]="journey"
                    [qitsField]="marks.packages"
                    data-packages
                  >
                    {{ packages }}
                  </p>
                }
              </header>

              @if (!packages()) {
                <p
                  class="mt-0 mb-4 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-fg"
                  role="status"
                  [fieldOf]="journey"
                  [qitsField]="marks.packages"
                  data-no-packages
                >
                  qits-maintenance holds no bill of materials for this release: either it predates
                  the inventory or its SBOM was never read. Nothing downstream can be matched to it,
                  so no repository below can show as carrying it.
                </p>
              }

              @if (!(journey.adopters ?? []).length) {
                <p
                  class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                  [fieldOf]="journey"
                  [qitsField]="marks.adopters"
                  data-empty
                >
                  This release reached no repository.
                </p>
              } @else {
                <figure class="m-0 min-w-0" data-chart>
                  <figcaption
                    class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted"
                  >
                    <span [fieldOf]="journey" [qitsField]="marks.adopters" data-caption>{{
                      caption()
                    }}</span>
                    <span class="inline-flex items-center gap-1.5 text-xs" aria-hidden="true">
                      <span class="inline-block w-4 border-t-2 border-accent"></span>into a
                      repository carrying it
                      <span class="ml-2 inline-block w-4 border-t-2 border-line-strong"></span>into
                      one still waiting
                    </span>
                  </figcaption>

                  <!-- A deep chain is wider than any screen: the drawing scrolls inside its box. -->
                  <div
                    class="max-w-full overflow-x-auto rounded-md border border-line bg-surface-subtle p-3"
                    data-scroll
                  >
                    <div
                      class="relative"
                      [style.width.px]="chart().width"
                      [style.height.px]="chart().height"
                    >
                      <svg
                        class="pointer-events-none absolute inset-0 overflow-visible"
                        [attr.width]="chart().width"
                        [attr.height]="chart().height"
                        [attr.viewBox]="'0 0 ' + chart().width + ' ' + chart().height"
                        aria-hidden="true"
                        focusable="false"
                      >
                        @for (edge of chart().edges; track edge.key) {
                          <path
                            class="fill-none"
                            [class]="edge.adopted ? 'stroke-accent' : 'stroke-line-strong'"
                            stroke-width="1.75"
                            [attr.d]="edge.path"
                            [attr.data-from]="edge.from"
                            [attr.data-to]="edge.to"
                            data-edge
                          />
                        }
                      </svg>

                      @for (column of chart().columns; track column.key) {
                        <div
                          class="absolute top-0 flex flex-col overflow-hidden rounded bg-accent-soft px-2 py-0.5 text-xs leading-normal whitespace-nowrap"
                          [style.left.px]="column.x"
                          [style.width.px]="cardWidth"
                          [attr.data-depth]="column.depth"
                          [fieldOf]="journey"
                          [qitsField]="marks.column"
                          data-column-head
                        >
                          <span class="font-semibold text-accent">{{ column.label }}</span>
                          @if (column.summary) {
                            <span class="text-fg-soft">{{ column.summary }}</span>
                          }
                        </div>
                      }

                      @for (node of chart().nodes; track node.key) {
                        <div
                          class="absolute box-border overflow-hidden rounded-md border px-2.5 py-2"
                          [class]="cardClass(node)"
                          [style.left.px]="node.x"
                          [style.top.px]="node.y"
                          [style.width.px]="cardWidth"
                          [style.height.px]="cardHeight"
                          [attr.data-repository]="node.repository"
                          [attr.data-column]="node.column"
                          [attr.data-row]="node.row"
                          [fieldOf]="journey"
                          [qitsField]="node.root ? marks.root : marks.adopter"
                          data-card
                        >
                          <p class="m-0 mb-0.5 flex min-w-0 items-center gap-1.5 font-semibold">
                            @if (!node.root && node.linkable) {
                              <a
                                class="truncate text-accent no-underline hover:underline"
                                [qitsExit]="repositoryLinks.opening.repository"
                                [exitParams]="repositoryLinks.params(node.repository)"
                                [title]="node.repository"
                                >{{ node.repository }}</a
                              >
                            } @else {
                              <span class="truncate text-fg" [title]="node.repository">{{
                                node.repository
                              }}</span>
                            }
                            @if (node.absent) {
                              <ui-chip
                                label="absent"
                                tone="waiting"
                                title="no longer in the catalog"
                                data-absent
                              />
                            }
                          </p>
                          @if (node.root) {
                            <p class="m-0 truncate font-mono text-xs text-fg">
                              {{ node.version }}
                            </p>
                            <p class="m-0 truncate text-xs text-fg-muted">
                              the release this page is about
                            </p>
                          } @else {
                            <p class="m-0 truncate text-xs text-fg-muted">{{ node.archetype }}</p>
                            <p class="m-0 flex min-w-0 items-center gap-1.5 text-xs">
                              <ui-chip
                                [label]="node.state ?? 'unknown'"
                                [tone]="node.adopted ? 'ok' : 'neutral'"
                                data-state
                              />
                              @if (node.adopted) {
                                <span class="truncate font-mono text-fg" [title]="node.version">{{
                                  node.version
                                }}</span>
                              }
                            </p>
                            <p class="m-0 mt-0.5 truncate text-xs text-fg-muted">
                              @if (node.adopted) {
                                <span [title]="instant(node.adoptedAt)">{{
                                  ago(node.adoptedAt)
                                }}</span>
                              } @else {
                                {{ node.note }}
                              }
                            </p>
                          }
                          @if (node.reachedFrom) {
                            <span class="sr-only">Reached from {{ node.reachedFrom }}.</span>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </figure>
              }
            </article>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class RepositoryAdoptionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** An adopter's Depends on page. */
  protected readonly repositoryLinks = inject(MaintenanceRepositoryLinks);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The release the address names, both halves of it. */
  protected readonly repository = computed(() => this.params().get('repo') ?? '');
  protected readonly version = computed(() => this.params().get('version') ?? '');

  /** The journey, read again after `ADOPTION_EVENTS`. */
  protected readonly read = qitsResource(
    MAINTENANCE_ADOPTION,
    () => {
      const repository = this.repository();
      const version = this.version();
      return this.browser && repository && version ? { query: { repository, version } } : undefined;
    },
    { refreshOn: { names: ADOPTION_EVENTS, debounceMs: 1_000 } },
  );

  /** The journey as the page shows it: read, and of the release the address names. */
  protected readonly shown = computed((): AdoptionJourney | undefined => {
    const journey = this.read.hasValue() ? this.read.value() : undefined;
    if (!journey) return undefined;
    const sameRelease =
      (!journey.repository || journey.repository === this.repository()) &&
      (!journey.version || journey.version === this.version());
    return sameRelease ? journey : undefined;
  });

  /** What the release published, `ecosystem name`, comma-joined; `''` for none. */
  protected readonly packages = computed(() => {
    const journey = this.shown();
    return journey ? packagesLine(journey) : '';
  });

  protected readonly caption = computed(() => adoptionCaption(this.shown()?.adopters ?? []));

  /** The flowchart (`adoptionChart`), of the release the address names. */
  protected readonly chart = computed(() =>
    adoptionChart(this.shown(), { repository: this.repository(), version: this.version() }),
  );

  /** Whether the read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.read));

  protected readonly state = computed((): LoadState => loadState(this.read));

  /** Refresh: reads the journey again. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.read.reload() },
  ];

  protected readonly cardWidth = CARD_WIDTH;
  protected readonly cardHeight = CARD_HEIGHT;
  protected readonly marks = MARKS;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | null) => formatRelativeTime(iso);

  /** A card's box: the release accented, a pending adopter muted, an adopted one plain. */
  protected cardClass(node: ChartNode): string {
    if (node.root) return 'border-accent-line bg-accent-soft text-fg';
    return node.adopted ? 'border-line bg-surface text-fg' : 'border-line bg-surface text-fg-muted';
  }
}

/** The data marks of what the page derives from the journey (class constants, as the rule reads). */
const MARKS = {
  packages: { derived: ['packages'] },
  adopters: { derived: ['adopters'] },
  column: { derived: ['adopters'] },
  root: { derived: ['repository', 'version'] },
  adopter: { derived: ['adopters'] },
} as const;
