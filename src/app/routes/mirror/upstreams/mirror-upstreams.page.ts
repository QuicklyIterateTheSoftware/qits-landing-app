import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import type { OciUpstream, Upstreams } from '$core/mirror/upstreams.consumes';
import { UPSTREAM_LIST } from '$core/mirror/upstreams.operations';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The answer while the read has none. */
const NO_UPSTREAMS: Upstreams = { upstreams: [] };

/**
 * The Mirror section's first page (qits-2357), at `/mirror/upstreams`: the image registries
 * qits-mirror's pull-through cache fronts. It replaces qits-mirror-frontend's `upstreams`, with
 * named, typed columns where the old page guessed them from whatever keys arrived.
 *
 * **Load budget: 1, nothing per row.** `UPSTREAM_LIST` (`listUpstreams`) is the table, in the
 * server's order (namespace order). The read is made in the browser only (the server render has
 * no session).
 *
 * - Header: "OCI upstreams", Refresh, a lede, and "N mirrored registries".
 * - Rows: host (the name a docker client uses, the row's identity), namespace (the local segment:
 *   `mirror.<domain>/<namespace>/<image>`), cached images (distinct image names, 0 is normal) and
 *   when it was registered (UTC).
 * - Below the table: npm and maven have one upstream each, a deployment setting, so only image
 *   registries are a list.
 *
 * States: loading; a mirror fronting no registry (`upstreams: []`, an operator deleted them) is one
 * sentence; any failure (a 5xx when the database cannot be read: qits-mirror never answers that as
 * an empty list) says the upstreams cannot be read right now, with Retry.
 *
 * Marks (qits-2141): the table is the upstreams' read, each row an upstream by its `host`; the
 * registration date is derived from `createdAt`, the count from the whole answer.
 *
 * Staleness (qits-1270): no `refreshOn`. qits-mirror sends no event when an upstream is registered
 * or deleted, or when an image is pulled through (which moves the cached images), so none of it is
 * followed: Refresh reads the list again. Nothing polls.
 */
@Component({
  selector: 'app-mirror-upstreams-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadFailure, PageLayoutComponent, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="OCI upstreams" [actions]="actions">
        <p class="mt-0 mb-2 text-sm text-fg-soft">
          The image registries this mirror fronts. A docker client naming one is answered from the
          cache when the bytes are here, and from the registry otherwise.
        </p>
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="upstreams" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
          </p>
        }

        <ui-load-failure
          message="The mirror’s upstreams cannot be read right now."
          [class.hidden]="state() !== 'error'"
          (retry)="upstreams.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          @if (rows().length === 0) {
            <p
              role="status"
              class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
            >
              This mirror fronts no registry.
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-sm" aria-label="OCI upstreams">
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">Host</th>
                    <th class="py-1.5 pr-3 font-semibold">Namespace</th>
                    <th class="py-1.5 pr-3 text-right font-semibold">Cached images</th>
                    <th class="py-1.5 font-semibold">Registered</th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="upstreams">
                  @for (row of rows(); track row.host) {
                    <tr
                      class="border-b border-line-subtle align-top"
                      [qitsEntity]="row"
                      entityKey="host"
                    >
                      <td
                        class="py-1.5 pr-3 font-mono font-medium break-all"
                        [fieldOf]="row"
                        qitsField="host"
                      >
                        {{ row.host }}
                      </td>
                      <td
                        class="py-1.5 pr-3 font-mono whitespace-nowrap text-fg-soft"
                        [fieldOf]="row"
                        qitsField="namespace"
                      >
                        {{ row.namespace }}
                      </td>
                      <td
                        class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                        [fieldOf]="row"
                        qitsField="cachedImages"
                      >
                        {{ row.cachedImages ?? 0 }}
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
          <p class="mt-3 mb-0 text-sm text-fg-soft">
            npm and maven have one upstream each, a deployment setting of the mirror, so only the
            image registries are a list.
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class MirrorUpstreamsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The mirror's OCI upstreams; read again on Refresh only (no event announces a change). */
  protected readonly upstreams = qitsResource(UPSTREAM_LIST, () => (this.browser ? {} : undefined));

  /** The read's answer; no upstreams while it has none. */
  protected readonly answer = computed(
    (): Upstreams =>
      (this.upstreams.hasValue() ? this.upstreams.value() : undefined) ?? NO_UPSTREAMS,
  );

  /** The rows, in the server's order. */
  protected readonly rows = computed((): readonly OciUpstream[] => this.answer().upstreams ?? []);

  protected readonly state = computed((): LoadState => loadState(this.upstreams));

  /** `3 mirrored registries`. */
  protected readonly caption = computed(() =>
    plural(this.rows().length, 'mirrored registry', 'mirrored registries'),
  );

  /** Refresh: the upstreams, read again (qits-mirror sends no event for them). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.upstreams.reload() },
  ];

  protected readonly marks = MARKS;

  /** When the upstream was registered, in UTC (`1 Jan 2026 00:00:00Z`). */
  protected registered(row: OciUpstream): string {
    return formatInstant(row.createdAt);
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  createdAt: { derived: ['createdAt'] },
} as const;
