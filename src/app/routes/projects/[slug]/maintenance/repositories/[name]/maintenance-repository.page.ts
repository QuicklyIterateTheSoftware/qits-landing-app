import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  type QitsDomainEvent,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { payloadField } from '$core/events/refresh-on';
import { BUMP_EVENTS } from '$core/maintenance/bump-events';
import {
  bumpStatusLabel,
  bumpStatusTone,
  releaseRequestRef,
  type ReleaseRequestRef,
} from '$core/maintenance/bump-model';
import { currencyOf, type Currency } from '$core/maintenance/currency';
import type {
  PublishedArtifact,
  RepositoryBump,
  RepositoryDependents,
  RepositoryDetail,
  RepositoryDownstream,
} from '$core/maintenance/maintenance.consumes';
import { REPOSITORY_BUMPS_LIMIT } from '$core/maintenance/maintenance.consumes';
import {
  MAINTENANCE_REPOSITORY,
  MAINTENANCE_REPOSITORY_BUMPS,
  MAINTENANCE_REPOSITORY_DEPENDENTS,
  MAINTENANCE_REPOSITORY_DOWNSTREAM,
} from '$core/maintenance/maintenance.operations';
import { MaintenanceRepositoryLinks } from '$core/maintenance/repository-links';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import {
  PinTableComponent,
  pinTables,
  type PinTables,
} from '$patterns/maintenance/pin-table/pin-table';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** One dependent of a published artifact, as the repository page reads it. */
export type ArtifactDependent = NonNullable<PublishedArtifact['dependents']>[number];

/** A dependent of a published artifact with its currency, keyed by the artifact it is. */
export interface DependentRow extends ArtifactDependent {
  /** `<ecosystem>:<name>:<version>` of the embedding artifact, the entity's key. */
  readonly key: string;
  readonly currency: Currency;
}

/** A published artifact with its dependents as rows, keyed by its ecosystem and name. */
export interface ArtifactGroup extends PublishedArtifact {
  /** `<ecosystem>:<name>`, the entity's key. */
  readonly key: string;
  readonly rows: readonly DependentRow[];
}

/** A repository status's chip tone: OK is ok, any other word (ABSENT, UNDECLARED, …) neutral. */
export function repositoryStatusTone(status: string | null | undefined): ChipTone {
  return status === 'OK' ? 'ok' : 'neutral';
}

/**
 * Each published artifact with its dependents, as current, behind or unknown against that
 * artifact's latest (`currencyOf`), the behind ones first, then by repository and artifact.
 */
export function artifactGroups(answer: RepositoryDependents): readonly ArtifactGroup[] {
  const rank: Readonly<Record<Currency, number>> = { behind: 0, unknown: 1, current: 1 };
  return (answer.artifacts ?? []).map((artifact): ArtifactGroup => {
    const rows = (artifact.dependents ?? [])
      .map((dependent): DependentRow => ({
        ...dependent,
        key: `${dependent.artifactEcosystem ?? ''}:${dependent.artifactName ?? ''}:${dependent.artifactVersion ?? ''}`,
        currency: currencyOf(dependent.embeddedVersion, artifact.latest),
      }))
      .sort(
        (a, b) =>
          rank[a.currency] - rank[b.currency] ||
          (a.repository ?? '').localeCompare(b.repository ?? '') ||
          (a.artifactName ?? '').localeCompare(b.artifactName ?? ''),
      );
    return { ...artifact, key: `${artifact.ecosystem ?? ''}:${artifact.name ?? ''}`, rows };
  });
}

/**
 * Whether a bump event concerns the repository `name`: its payload names it (`repository`,
 * `repositoryName` or `repoName`), or names no repository by name at all (a build or a release
 * request names it by id only, which the page cannot tell apart). An event naming another
 * repository by name does not.
 */
export function namesRepository(event: QitsDomainEvent, name: string): boolean {
  const named = ['repository', 'repositoryName', 'repoName']
    .map((key) => payloadField(event, key))
    .filter((value): value is string => !!value);
  return named.length === 0 || named.includes(name);
}

/** A currency's chip tone. */
const CURRENCY_TONE: Readonly<Record<Currency, ChipTone>> = {
  current: 'ok',
  behind: 'waiting',
  unknown: 'neutral',
};

/** No repository answer (yet). */
const NO_PINS: PinTables = {
  internal: { pins: [], transitives: 0, behind: [] },
  external: { pins: [], transitives: 0, behind: [] },
  other: { pins: [], transitives: 0, behind: [] },
};

/** Whether the read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * One repository's maintenance, at `/projects/<slug>/maintenance/repositories/<name>` (qits-2334;
 * replaces qits-maintenance-frontend's `repositories/:name`), the path mirroring
 * `GET /maintenance/api/repositories/{name}`. A detail page of the Maintenance section: no sidebar
 * entry of its own. Reached from a repository name on the Dependencies, Artifacts and bump pages,
 * and from this page's own dependents and downstream (`MaintenanceRepositoryLinks`).
 *
 * Reads four operations, in the browser only (the server has no session), through
 * `qitsResource`, all keyed by the repository's name (no project filter: the name is the whole
 * address): the repository (`MAINTENANCE_REPOSITORY`, `getRepository`), its newest 20 bumps
 * (`MAINTENANCE_REPOSITORY_BUMPS`, `listBumps?repository=&limit=20`), who embeds what it publishes
 * (`MAINTENANCE_REPOSITORY_DEPENDENTS`, `listRepositoryDependents`) and its downstream closure
 * (`MAINTENANCE_REPOSITORY_DOWNSTREAM`, `getRepositoryDownstream`).
 *
 * - Heading: the name, the status as a chip (`OK`, `ABSENT`, `UNDECLARED` or any other word), the
 *   last scan as a relative time, and the scan's `message` as plain text. No Groups panel: every
 *   group is NONE or RETIRED since qits-1133.
 * - Pins: Internal and External tables, pending pins first (the service's `pending`), each with
 *   its dependency (name, ecosystem), version, latest and manifest; under each, only its behind
 *   transitives, captioned with the total ("817 transitives, 11 behind"). REACTOR and UNRESOLVED
 *   pins sit in a collapsed disclosure with their count. None at all: "No pins were read for
 *   <name>."
 * - Recent bumps: status as a chip linking the bump's page (`open-repository-bump`), kind (the
 *   bump's `group`), trigger, started, changes count, release request (a uuid links
 *   `projects/<slug>/release-requests/<id>`, `open-repository-bump-release-request`; the sentinels
 *   `converged` and `refused` are words; null is none) and the message as plain text.
 * - Dependents: one group per published artifact (name, ecosystem, latest), each dependent's
 *   repository linked to its page, the artifact and version it embeds, direct or transitive, and
 *   current, behind or unknown against that artifact's latest; the behind ones first.
 * - Downstream: the closure as the inventory gives it (no row filtered), with depth, repository
 *   (linked), archetype and `via`, the count in the caption.
 *
 * States: loading; a 404 on the repository is "No repository <name> in the inventory." and nothing
 * else (the other three answer empty for an unknown name); a 403 on any read a refusal (only
 * qits:admin, admin-agent, desk-admin, desk, system and agent may read them); any other failure
 * offers Retry. Marks (qits-2141): the repository is an entity by its `name`, each pin by
 * manifest, ecosystem and name, each behind transitive by what it is and its `via`, each bump by
 * its `id`, each published artifact by ecosystem and name, each dependent by the artifact it is,
 * each downstream repository by its name.
 *
 * Staleness (qits-1270): `BUMP_EVENTS` naming this repository (`namesRepository`) → the repository
 * and its bumps, debounced; never a timer. Dependents and downstream are read once. Refresh reads
 * all four again.
 */
@Component({
  selector: 'app-maintenance-repository-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PinTableComponent,
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
      <app-page-layout title="Repository" [actions]="actions">
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading a repository needs a staff role: qits:admin, qits:desk or qits:agent.
        </p>
        <ui-load-failure
          message="This repository could not be read."
          [class.hidden]="state() !== 'error' || refusal()"
          (retry)="refresh()"
        />
        @if (missing()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-missing>
            No repository {{ name() }} in the inventory.
          </p>
        }
        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="state() === 'error' || missing()"
        >
          @if (shown(); as repo) {
            <article
              [qitsEntity]="repo"
              entityKey="name"
              [entitySource]="repository"
              data-repository
            >
              <header class="mb-6">
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2
                    class="m-0 font-mono text-lg font-semibold break-all text-fg"
                    [fieldOf]="repo"
                    qitsField="name"
                  >
                    {{ repo.name }}
                  </h2>
                  <ui-chip
                    [label]="repo.status ?? 'unknown'"
                    [tone]="statusTone(repo.status)"
                    [fieldOf]="repo"
                    [qitsField]="marks.status"
                    data-status
                  />
                  <span
                    class="text-sm text-fg-muted"
                    [title]="instant(repo.lastScanAt)"
                    [fieldOf]="repo"
                    [qitsField]="marks.lastScanAt"
                    data-scanned
                    >scanned {{ ago(repo.lastScanAt) }}</span
                  >
                </div>
                @if (repo.message) {
                  <p
                    class="mt-2 mb-0 text-sm wrap-anywhere text-fg-soft"
                    [fieldOf]="repo"
                    qitsField="message"
                    data-message
                  >
                    {{ repo.message }}
                  </p>
                }
              </header>

              <section aria-labelledby="repository-pins" class="mb-8" data-pins>
                <h3 id="repository-pins" class="mt-0 mb-3 text-base font-semibold">Pins</h3>
                @if (noPins()) {
                  <p
                    class="m-0 text-sm text-fg-muted"
                    [fieldOf]="repo"
                    [qitsField]="marks.pins"
                    data-no-pins
                  >
                    No pins were read for
                    <span [fieldOf]="repo" qitsField="name">{{ repo.name }}</span
                    >.
                  </p>
                } @else {
                  <div class="mb-6" data-pin-table="internal">
                    <h4 class="mt-0 mb-2 text-sm font-semibold text-fg">
                      Internal
                      <span
                        class="font-normal text-fg-muted"
                        [fieldOf]="repo"
                        [qitsField]="marks.pins"
                        >· {{ tables().internal.pins.length }}</span
                      >
                    </h4>
                    <app-pin-table
                      title="Internal"
                      noun="internal"
                      [pins]="tables().internal.pins"
                      [transitives]="tables().internal.transitives"
                      [behind]="tables().internal.behind"
                      [repository]="repo"
                    />
                  </div>
                  <div class="mb-6" data-pin-table="external">
                    <h4 class="mt-0 mb-2 text-sm font-semibold text-fg">
                      External
                      <span
                        class="font-normal text-fg-muted"
                        [fieldOf]="repo"
                        [qitsField]="marks.pins"
                        >· {{ tables().external.pins.length }}</span
                      >
                    </h4>
                    <app-pin-table
                      title="External"
                      noun="external"
                      [pins]="tables().external.pins"
                      [transitives]="tables().external.transitives"
                      [behind]="tables().external.behind"
                      [repository]="repo"
                    />
                  </div>
                  @if (tables().other.pins.length) {
                    <details class="mt-2" data-other-pins>
                      <summary
                        class="cursor-pointer text-sm text-fg-muted"
                        [fieldOf]="repo"
                        [qitsField]="marks.pins"
                      >
                        Reactor and unresolved pins ({{ tables().other.pins.length }})
                      </summary>
                      <app-pin-table
                        class="mt-2"
                        title="Reactor and unresolved"
                        noun="reactor or unresolved"
                        [pins]="tables().other.pins"
                        [transitives]="tables().other.transitives"
                        [behind]="tables().other.behind"
                        [repository]="repo"
                      />
                    </details>
                  }
                }
              </section>

              <section
                aria-labelledby="repository-bumps"
                class="mb-8"
                [qitsEntityList]="bumps"
                data-bumps
              >
                <h3 id="repository-bumps" class="mt-0 mb-3 text-base font-semibold">
                  Recent bumps
                </h3>
                <ui-load-failure
                  message="This repository’s bumps could not be read."
                  [class.hidden]="bumpsState() !== 'error' || refusal()"
                  (retry)="bumps.reload()"
                />
                <ui-spinner [state]="bumpsState()" [class.hidden]="bumpsState() === 'error'">
                  @if (bumpRows().length) {
                    <div class="overflow-x-auto rounded-md border border-line">
                      <table
                        class="w-full border-collapse text-left text-sm"
                        aria-label="Recent bumps"
                      >
                        <thead class="bg-surface-muted text-xs text-fg-muted">
                          <tr>
                            <th class="px-3 py-1.5 font-semibold">Status</th>
                            <th class="px-3 py-1.5 font-semibold">Kind</th>
                            <th class="px-3 py-1.5 font-semibold">Trigger</th>
                            <th class="px-3 py-1.5 font-semibold">Started</th>
                            <th class="px-3 py-1.5 font-semibold">Changes</th>
                            <th class="px-3 py-1.5 font-semibold">Release request</th>
                            <th class="px-3 py-1.5 font-semibold">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (bump of bumpRows(); track bump.id) {
                            <tr
                              class="border-t border-line-subtle align-baseline"
                              [qitsEntity]="bump"
                              entityKey="id"
                            >
                              <td
                                class="px-3 py-1.5"
                                [fieldOf]="bump"
                                [qitsField]="marks.bumpStatus"
                              >
                                <a
                                  class="no-underline"
                                  [qitsExit]="opening.bump"
                                  [exitParams]="{ slug: slug(), bumpId: bump.id ?? '' }"
                                  ><ui-chip
                                    [label]="bumpLabel(bump.status)"
                                    [tone]="bumpTone(bump.status)"
                                /></a>
                              </td>
                              <td
                                class="px-3 py-1.5 wrap-anywhere"
                                [fieldOf]="bump"
                                qitsField="group"
                              >
                                {{ bump.group }}
                              </td>
                              <td class="px-3 py-1.5" [fieldOf]="bump" qitsField="trigger">
                                {{ bump.trigger }}
                              </td>
                              <td
                                class="px-3 py-1.5 whitespace-nowrap"
                                [title]="instant(bump.startedAt)"
                                [fieldOf]="bump"
                                [qitsField]="marks.startedAt"
                              >
                                {{ ago(bump.startedAt) }}
                              </td>
                              <td
                                class="px-3 py-1.5 tabular-nums"
                                [fieldOf]="bump"
                                [qitsField]="marks.changes"
                              >
                                {{ (bump.changes ?? []).length }}
                              </td>
                              <td
                                class="px-3 py-1.5"
                                [fieldOf]="bump"
                                [qitsField]="marks.releaseRequest"
                                data-release-request
                              >
                                @let ref = requestOf(bump.releaseRequestId);
                                @switch (ref.kind) {
                                  @case ('request') {
                                    <a
                                      class="font-mono text-xs break-all text-accent no-underline hover:underline"
                                      [qitsExit]="requesting.request"
                                      [exitParams]="{ slug: slug(), requestId: requestId(ref) }"
                                      >{{ requestId(ref) }}</a
                                    >
                                  }
                                  @case ('sentinel') {
                                    <span class="font-semibold">{{ sentinelWord(ref) }}</span>
                                  }
                                  @default {
                                    <span class="text-fg-muted">none</span>
                                  }
                                }
                              </td>
                              <td
                                class="px-3 py-1.5 text-xs wrap-anywhere text-fg-soft"
                                [fieldOf]="bump"
                                qitsField="message"
                              >
                                {{ bump.message }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <p class="m-0 text-sm text-fg-muted" data-no-bumps>
                      No bumps of
                      <span [fieldOf]="repo" qitsField="name">{{ repo.name }}</span> yet.
                    </p>
                  }
                </ui-spinner>
              </section>

              <section
                aria-labelledby="repository-dependents"
                class="mb-8"
                [qitsEntityList]="dependents"
                data-dependents
              >
                <h3 id="repository-dependents" class="mt-0 mb-3 text-base font-semibold">
                  Dependents
                </h3>
                <ui-load-failure
                  message="This repository’s dependents could not be read."
                  [class.hidden]="dependentsState() !== 'error' || refusal()"
                  (retry)="dependents.reload()"
                />
                <ui-spinner
                  [state]="dependentsState()"
                  [class.hidden]="dependentsState() === 'error'"
                >
                  @for (artifact of groups(); track artifact.key) {
                    <div class="mb-4" [qitsEntity]="artifact" entityKey="key" data-artifact>
                      <h4 class="m-0 mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span
                          class="font-mono font-semibold break-all text-fg"
                          [fieldOf]="artifact"
                          qitsField="name"
                          >{{ artifact.name }}</span
                        >
                        <span
                          class="text-xs font-normal text-fg-muted"
                          [fieldOf]="artifact"
                          qitsField="ecosystem"
                          >{{ artifact.ecosystem }}</span
                        >
                        <span
                          class="text-xs font-normal text-fg-muted"
                          [fieldOf]="artifact"
                          [qitsField]="marks.latest"
                          >latest {{ artifact.latest ?? 'unknown' }}</span
                        >
                      </h4>
                      @if (artifact.rows.length) {
                        <ul
                          class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
                          [attr.aria-label]="'Dependents of ' + artifact.name"
                        >
                          @for (dependent of artifact.rows; track dependent.key) {
                            <li
                              class="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,10rem)_5rem] items-baseline gap-x-3 gap-y-1 px-3 py-2 max-md:grid-cols-[1fr_auto]"
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
                              <span
                                class="flex min-w-0 flex-wrap items-baseline gap-x-2 max-md:col-start-1"
                              >
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
                              </span>
                              <span
                                class="flex flex-wrap items-baseline gap-x-2 text-xs max-md:col-start-1"
                              >
                                <span
                                  class="font-mono text-fg-soft"
                                  [fieldOf]="dependent"
                                  qitsField="embeddedVersion"
                                  >{{ dependent.embeddedVersion }}</span
                                >
                                <span
                                  class="text-fg-muted"
                                  [fieldOf]="dependent"
                                  [qitsField]="marks.direct"
                                  >{{ dependent.direct ? 'direct' : 'transitive' }}</span
                                >
                              </span>
                              <ui-chip
                                class="justify-self-end max-md:col-start-2 max-md:row-start-1"
                                [label]="dependent.currency"
                                [tone]="currencyTone(dependent.currency)"
                                [fieldOf]="dependent"
                                [qitsField]="marks.embedded"
                              />
                            </li>
                          }
                        </ul>
                      } @else {
                        <p class="m-0 text-sm text-fg-muted">Nothing of ours embeds it.</p>
                      }
                    </div>
                  } @empty {
                    <p class="m-0 text-sm text-fg-muted" data-no-dependents>
                      Nothing of ours embeds what
                      <span [fieldOf]="repo" qitsField="name">{{ repo.name }}</span> publishes.
                    </p>
                  }
                </ui-spinner>
              </section>

              <section
                aria-labelledby="repository-downstream"
                [qitsEntityList]="downstream"
                data-downstream
              >
                <h3 id="repository-downstream" class="mt-0 mb-3 text-base font-semibold">
                  Downstream
                </h3>
                <ui-load-failure
                  message="What is downstream of this repository could not be read."
                  [class.hidden]="downstreamState() !== 'error' || refusal()"
                  (retry)="downstream.reload()"
                />
                <ui-spinner
                  [state]="downstreamState()"
                  [class.hidden]="downstreamState() === 'error'"
                >
                  @if (downstreamRows().length) {
                    <div class="overflow-x-auto rounded-md border border-line">
                      <table
                        class="w-full border-collapse text-left text-sm"
                        aria-label="Downstream"
                      >
                        <caption
                          class="px-3 py-1.5 text-left text-xs text-fg-muted"
                          [fieldOf]="downstreamAnswer()"
                          [qitsField]="marks.downstream"
                        >
                          {{
                            downstreamCaption()
                          }}
                        </caption>
                        <thead class="bg-surface-muted text-xs text-fg-muted">
                          <tr>
                            <th class="px-3 py-1.5 font-semibold">Depth</th>
                            <th class="px-3 py-1.5 font-semibold">Repository</th>
                            <th class="px-3 py-1.5 font-semibold">Archetype</th>
                            <th class="px-3 py-1.5 font-semibold">Via</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (entry of downstreamRows(); track entry.repository) {
                            <tr
                              class="border-t border-line-subtle"
                              [qitsEntity]="entry"
                              entityKey="repository"
                            >
                              <td
                                class="px-3 py-1.5 tabular-nums"
                                [fieldOf]="entry"
                                qitsField="depth"
                              >
                                {{ entry.depth }}
                              </td>
                              <td class="px-3 py-1.5">
                                <a
                                  class="break-all text-accent no-underline hover:underline"
                                  [qitsExit]="repositoryLinks.opening.repository"
                                  [exitParams]="repositoryLinks.params(entry.repository)"
                                  [fieldOf]="entry"
                                  qitsField="repository"
                                  >{{ entry.repository }}</a
                                >
                              </td>
                              <td class="px-3 py-1.5" [fieldOf]="entry" qitsField="archetype">
                                {{ entry.archetype }}
                              </td>
                              <td
                                class="px-3 py-1.5 font-mono text-xs wrap-anywhere"
                                [fieldOf]="entry"
                                [qitsField]="marks.via"
                              >
                                {{ (entry.via ?? []).join(', ') }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <p class="m-0 text-sm text-fg-muted" data-no-downstream>
                      Nothing is downstream of
                      <span [fieldOf]="repo" qitsField="name">{{ repo.name }}</span
                      >.
                    </p>
                  }
                </ui-spinner>
              </section>
            </article>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class MaintenanceRepositoryPage {
  private readonly selected = inject(SelectedProject);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly repositoryLinks = inject(MaintenanceRepositoryLinks);

  /** A bump's page. */
  protected readonly opening = outcomes('open-repository-bump', {
    bump: exit('projects/:slug/maintenance/bumps/:bumpId'),
  });

  /** The release request a bump belongs to. */
  protected readonly requesting = outcomes('open-repository-bump-release-request', {
    request: exit('projects/:slug/releases/requests/:requestId'),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The repository the address names. */
  protected readonly name = computed(() => this.params().get('name') ?? '');
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The bump events that concern this repository: the repository and its bumps read again. */
  private readonly refreshOn = {
    names: BUMP_EVENTS,
    when: (event: QitsDomainEvent) => namesRepository(event, this.name()),
  };

  /** The repository's name, in the browser only: the reads wait for it. */
  private readonly path = computed(() => {
    const name = this.name();
    return this.browser && name ? { path: { name } } : undefined;
  });

  /** The repository, read again after the bump events naming it. */
  protected readonly repository = qitsResource(MAINTENANCE_REPOSITORY, () => this.path(), {
    refreshOn: this.refreshOn,
  });

  /** Its newest bumps, read again after the bump events naming it. */
  protected readonly bumps = qitsResource(
    MAINTENANCE_REPOSITORY_BUMPS,
    () => {
      const name = this.path()?.path.name;
      return name ? { query: { repository: name, limit: REPOSITORY_BUMPS_LIMIT } } : undefined;
    },
    { refreshOn: this.refreshOn },
  );

  /** Who embeds what it publishes; read once. */
  protected readonly dependents = qitsResource(MAINTENANCE_REPOSITORY_DEPENDENTS, () =>
    this.path(),
  );

  /** What is downstream of it; read once. */
  protected readonly downstream = qitsResource(MAINTENANCE_REPOSITORY_DOWNSTREAM, () =>
    this.path(),
  );

  /** The repository as the page shows it: read, and the one the address names. */
  protected readonly shown = computed((): RepositoryDetail | undefined => {
    const repository = this.repository.hasValue() ? this.repository.value() : undefined;
    return repository && repository.name === this.name() ? repository : undefined;
  });

  protected readonly tables = computed(() => {
    const repository = this.shown();
    return repository ? pinTables(repository) : NO_PINS;
  });

  /** Whether the repository has no pin of any kind. */
  protected readonly noPins = computed(() => (this.shown()?.pins ?? []).length === 0);

  protected readonly bumpRows = computed((): readonly RepositoryBump[] =>
    this.bumps.hasValue() ? (this.bumps.value() ?? []) : [],
  );

  protected readonly groups = computed((): readonly ArtifactGroup[] =>
    this.dependents.hasValue() ? artifactGroups(this.dependents.value() ?? {}) : [],
  );

  protected readonly downstreamAnswer = computed(
    (): RepositoryDownstream =>
      (this.downstream.hasValue() ? this.downstream.value() : undefined) ?? {},
  );

  protected readonly downstreamRows = computed(() => this.downstreamAnswer().downstream ?? []);

  protected readonly downstreamCaption = computed(() => {
    const n = this.downstreamRows().length;
    return `${n} ${n === 1 ? 'repository' : 'repositories'} downstream`;
  });

  /** No such repository: a 404 on the repository read. */
  protected readonly missing = computed(() => isMissing(this.repository));

  /** Whether any read was refused for the viewer's roles. */
  protected readonly refusal = computed(() =>
    [this.repository, this.bumps, this.dependents, this.downstream].some((read) => refused(read)),
  );

  /** The repository read: failed (but for a 404, which is {@link missing}), loaded once read. */
  protected readonly state = computed((): LoadState => {
    return this.missing() ? 'loading' : loadState(this.repository);
  });

  protected readonly bumpsState = computed(() => loadState(this.bumps));
  protected readonly dependentsState = computed(() => loadState(this.dependents));
  protected readonly downstreamState = computed(() => loadState(this.downstream));

  /** Refresh: reads all four again. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.refresh() },
  ];

  protected refresh(): void {
    this.repository.reload();
    this.bumps.reload();
    this.dependents.reload();
    this.downstream.reload();
  }

  protected readonly marks = MARKS;
  protected readonly statusTone = repositoryStatusTone;
  protected readonly bumpLabel = bumpStatusLabel;
  protected readonly bumpTone = bumpStatusTone;
  protected readonly requestOf = releaseRequestRef;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | null | undefined) => formatRelativeTime(iso);

  protected currencyTone(currency: Currency): ChipTone {
    return CURRENCY_TONE[currency];
  }

  protected requestId(ref: ReleaseRequestRef): string {
    return ref.kind === 'request' ? ref.id : '';
  }

  protected sentinelWord(ref: ReleaseRequestRef): string {
    return ref.kind === 'sentinel' ? ref.word : '';
  }
}

/** The data marks of what the page derives from its reads (each a class constant, as the rule reads). */
const MARKS = {
  status: { derived: ['status'] },
  lastScanAt: { derived: ['lastScanAt'] },
  pins: { derived: ['pins'] },
  latest: { derived: ['latest'] },
  bumpStatus: { derived: ['status', 'id'] },
  startedAt: { derived: ['startedAt'] },
  changes: { derived: ['changes'] },
  releaseRequest: { derived: ['releaseRequestId'] },
  direct: { derived: ['direct'] },
  embedded: { derived: ['embeddedVersion'] },
  via: { derived: ['via'] },
  downstream: { derived: ['downstream'] },
} as const;
