import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import { evictionWindowWords } from '$core/mirror/eviction-window';
import type { CacheRoot, CacheRoots } from '$core/mirror/repositories.consumes';
import { REPOSITORY_LIST } from '$core/mirror/repositories.operations';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The answer while the read has none. */
const NO_ROOTS: CacheRoots = { repositories: [] };

/**
 * The Mirror section's Caches page (qits-2471), at `/mirror/repositories`: every cache root
 * qits-mirror holds, the npm and maven caches and one namespace per OCI upstream. It replaces
 * qits-mirror-frontend's root route (`''`, "Cached repositories").
 *
 * **Load budget: 1, nothing per row.** `REPOSITORY_LIST` (`listRepositories`) is the table, in the
 * server's order (by name). The read is made in the browser only (the server render has no
 * session).
 *
 * - Header: "Cached repositories", Refresh, a lede, and "N cache roots".
 * - Rows: name (linking the root's page, `open-mirror-repository`, qits-2358), type (a chip),
 *   upstream (mono; an OCI namespace whose upstream was deleted says so), the eviction window in
 *   words ("not swept" when eviction is off) and when it was registered (UTC).
 *
 * States: loading; a mirror holding no cache root (`repositories: []`, only while a mirror is
 * reset: a running one re-seeds its package caches at boot) is one sentence; any failure (a 5xx:
 * qits-mirror never answers that as an empty list) says the caches cannot be read, with Retry.
 *
 * Marks (qits-2141): the table is the roots' read, each row a root by its `name`; the eviction
 * cell is derived from `evictionWindow`, the registration date from `createdAt`, the count from the
 * whole answer.
 *
 * Staleness (qits-1270): no `refreshOn`. qits-mirror sends no event when a cache root or an OCI
 * upstream is registered or deleted, so none of it is followed: Refresh reads the list again.
 * Nothing polls.
 */
@Component({
  selector: 'app-mirror-repositories-page',
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
      <app-page-layout title="Cached repositories" [actions]="actions">
        <p class="mt-0 mb-2 text-sm text-fg-soft">
          Every cache root this mirror holds: the npm and maven caches, and one namespace per image
          registry it fronts. A client asking for something is answered from the cache when the
          bytes are here, and from the upstream otherwise.
        </p>
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="roots" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
          </p>
        }

        <ui-load-failure
          message="The mirror’s caches cannot be read right now."
          [class.hidden]="state() !== 'error'"
          (retry)="roots.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          @if (rows().length === 0) {
            <p
              role="status"
              class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
            >
              This mirror holds no cache root.
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-sm" aria-label="Cache roots">
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">Name</th>
                    <th class="py-1.5 pr-3 font-semibold">Type</th>
                    <th class="py-1.5 pr-3 font-semibold">Upstream</th>
                    <th class="py-1.5 pr-3 font-semibold">Evicts unused after</th>
                    <th class="py-1.5 font-semibold">Registered</th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="roots">
                  @for (row of rows(); track row.name) {
                    <tr
                      class="border-b border-line-subtle align-top"
                      [qitsEntity]="row"
                      entityKey="name"
                    >
                      <td class="py-1.5 pr-3 whitespace-nowrap">
                        <a
                          class="font-mono font-medium text-accent no-underline hover:underline"
                          [qitsExit]="opening.repository"
                          [exitParams]="{ repository: row.name ?? '' }"
                          [fieldOf]="row"
                          qitsField="name"
                          >{{ row.name }}</a
                        >
                      </td>
                      <td class="py-1.5 pr-3 whitespace-nowrap">
                        <ui-chip [label]="row.type ?? ''" [fieldOf]="row" qitsField="type" />
                      </td>
                      @if (row.upstream) {
                        <td
                          class="py-1.5 pr-3 font-mono break-all text-fg-soft"
                          [fieldOf]="row"
                          qitsField="upstream"
                        >
                          {{ row.upstream }}
                        </td>
                      } @else {
                        <td
                          class="py-1.5 pr-3 text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.upstream"
                        >
                          deleted
                        </td>
                      }
                      <td
                        class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        [qitsField]="marks.evictionWindow"
                      >
                        {{ eviction(row) }}
                      </td>
                      <td
                        class="py-1.5 whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        [qitsField]="marks.createdAt"
                      >
                        {{ registered(row) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class MirrorRepositoriesPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** A row's name: that cache root's page (qits-2358). */
  protected readonly opening = outcomes('open-mirror-repository', {
    repository: exit('mirror/repositories/:repository'),
  });

  /** The mirror's cache roots; read again on Refresh only (no event announces a change). */
  protected readonly roots = qitsResource(REPOSITORY_LIST, () => (this.browser ? {} : undefined));

  /** The read's answer; no roots while it has none. */
  protected readonly answer = computed(
    (): CacheRoots => (this.roots.hasValue() ? this.roots.value() : undefined) ?? NO_ROOTS,
  );

  /** The rows, in the server's order. */
  protected readonly rows = computed((): readonly CacheRoot[] => this.answer().repositories ?? []);

  protected readonly state = computed((): LoadState => loadState(this.roots));

  /** `5 cache roots`. */
  protected readonly caption = computed(() => plural(this.rows().length, 'cache root'));

  /** Refresh: the roots, read again (qits-mirror sends no event for them). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.roots.reload() },
  ];

  protected readonly marks = MARKS;

  /** The type's eviction window in words (`30 days`), or `not swept` when eviction is off. */
  protected eviction(row: CacheRoot): string {
    return row.evictionWindow ? evictionWindowWords(row.evictionWindow) : 'not swept';
  }

  /** When the root was registered, in UTC (`1 Jan 2026 00:00:00Z`). */
  protected registered(row: CacheRoot): string {
    return formatInstant(row.createdAt);
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  upstream: { derived: ['upstream'] },
  evictionWindow: { derived: ['evictionWindow'] },
  createdAt: { derived: ['createdAt'] },
} as const;
