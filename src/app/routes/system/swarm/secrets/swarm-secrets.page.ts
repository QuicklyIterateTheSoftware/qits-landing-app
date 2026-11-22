import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { QitsApiError, QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import type { SwarmSecret } from '$core/system/swarm.consumes';
import { SWARM_SECRET_LIST } from '$core/system/swarm.operations';
import { shortSwarmId } from '$core/system/swarm-node-tones';
import { DEPLOYMENT_EVENTS } from '$core/updates/app-updates';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The System section's secrets page (qits-2350), at `/system/swarm/secrets`: the secrets of the one
 * swarm qits-system runs on, never a value (the swarm returns a secret's value to no one), each with
 * the services that use it. It replaces qits-system-frontend's `swarm/secrets`, without its Driver
 * (always empty on this estate) and with the usage it could not show.
 *
 * **Load budget: 1, nothing per row.** `SWARM_SECRET_LIST` (`listSwarmSecrets`, `docker secret ls`
 * on the manager, the usage read from the services' specs, never from a secret) is the table, in
 * the server's order. The read is made in the browser only (the server render has no session).
 *
 * - Header: "Swarm secrets", Refresh, a lede saying no value is shown, and "N secrets" (", M unused"
 *   while any is).
 * - Rows: name, docker's 12-character id (the whole id on hover), the services using it (one chip
 *   each; `Unused` when none), its labels (`key=value` chips, "—" for none), and Created and
 *   Updated formatted the same way as the config detail page (`formatInstant`), the served instant
 *   on hover.
 *
 * States: loading; a swarm holding no secrets is one sentence; a 403 says the swarm needs an admin
 * role; a 503 (the swarm is inactive, docker's socket missing or timing out: qits-system never
 * answers that as an empty list) says the swarm cannot be read right now, with Retry; any other
 * failure, with Retry.
 *
 * Marks (qits-2141): the table is the secrets' read, each row a secret by its `id`; the short id is
 * derived from `id`, `Unused` from `usedBy`, the labels' chips (or the dash) from `labels`, Created
 * and Updated derived from `createdAt`/`updatedAt`, the count from the whole answer.
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `DEPLOYMENT_EVENTS` (`DeploymentActive`,
 * `DeploymentFailed`) → the whole list, debounced 1 s: which services use a secret changes when a
 * service is deployed. A secret created or removed by hand (or by bootstrap) sends no event, so it
 * is not followed: Refresh reads the list again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-secrets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Swarm secrets" [actions]="actions">
        <p class="mt-0 mb-2 text-sm text-fg-soft">
          Secret values are never shown: the swarm returns them to no one.
        </p>
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="secrets" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
          </p>
        }

        @if (refused()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Reading the swarm needs an admin role: qits:admin, qits:admin-agent, qits:desk-admin,
            qits:system or qits:agent.
          </p>
        } @else {
          <ui-load-failure
            [message]="failureMessage()"
            [class.hidden]="state() !== 'error'"
            (retry)="secrets.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (rows().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                This swarm holds no secrets.
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm" aria-label="Secrets">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-muted">
                      <th class="py-1.5 pr-3 font-semibold">Name</th>
                      <th class="py-1.5 pr-3 font-semibold">ID</th>
                      <th class="py-1.5 pr-3 font-semibold">Used by</th>
                      <th class="py-1.5 pr-3 font-semibold">Labels</th>
                      <th class="py-1.5 pr-3 font-semibold">Created</th>
                      <th class="py-1.5 font-semibold">Updated</th>
                    </tr>
                  </thead>
                  <tbody [qitsEntityList]="secrets">
                    @for (row of rows(); track row.id) {
                      <tr
                        class="border-b border-line-subtle align-top"
                        [qitsEntity]="row"
                        entityKey="id"
                      >
                        <td
                          class="py-1.5 pr-3 font-medium whitespace-nowrap"
                          [fieldOf]="row"
                          qitsField="name"
                        >
                          {{ row.name }}
                        </td>
                        <td
                          class="py-1.5 pr-3 font-mono text-xs whitespace-nowrap text-fg-soft"
                          [attr.title]="row.id"
                          [fieldOf]="row"
                          [qitsField]="marks.id"
                        >
                          {{ shortId(row.id) }}
                        </td>
                        <td class="py-1.5 pr-3">
                          <span class="flex flex-wrap gap-1">
                            @for (service of row.usedBy ?? []; track service) {
                              <ui-chip
                                [label]="service"
                                tone="neutral"
                                [fieldOf]="row"
                                qitsField="usedBy"
                              />
                            } @empty {
                              <ui-chip
                                label="Unused"
                                tone="waiting"
                                [fieldOf]="row"
                                [qitsField]="marks.unused"
                              />
                            }
                          </span>
                        </td>
                        <td class="py-1.5 pr-3" [fieldOf]="row" [qitsField]="marks.labels">
                          @if (labelsOf(row).length === 0) {
                            <span class="text-fg-soft">—</span>
                          } @else {
                            <span class="flex flex-wrap gap-1">
                              @for (label of labelsOf(row); track label) {
                                <ui-chip [label]="label" tone="neutral" />
                              }
                            </span>
                          }
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                          [attr.title]="row.createdAt"
                          [fieldOf]="row"
                          [qitsField]="marks.createdAt"
                        >
                          {{ instant(row.createdAt) }}
                        </td>
                        <td
                          class="py-1.5 whitespace-nowrap text-fg-soft"
                          [attr.title]="row.updatedAt"
                          [fieldOf]="row"
                          [qitsField]="marks.updatedAt"
                        >
                          {{ instant(row.updatedAt) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SwarmSecretsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The swarm's secrets; read again after a deployment went live or failed. */
  protected readonly secrets = qitsResource(
    SWARM_SECRET_LIST,
    () => (this.browser ? {} : undefined),
    { refreshOn: { names: DEPLOYMENT_EVENTS, debounceMs: 1_000 } },
  );

  /** The read's answer; no secrets while it has none. */
  protected readonly answer = computed(
    (): readonly SwarmSecret[] => (this.secrets.hasValue() ? this.secrets.value() : []) ?? [],
  );

  /** The rows, in the server's order. */
  protected readonly rows = computed((): readonly SwarmSecret[] => this.answer());

  protected readonly state = computed((): LoadState => loadState(this.secrets));

  /** The read's failure status (403, 503, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.secrets.status() !== 'error') return undefined;
    const error = this.secrets.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refused = computed(() => this.failure() === 403);

  /** A 503 is the swarm itself not answering; anything else is the read failing. */
  protected readonly failureMessage = computed(() =>
    this.failure() === 503
      ? 'The swarm cannot be read right now.'
      : 'The swarm’s secrets could not be read.',
  );

  /** `2 secrets, 1 unused`; the unused part only while a secret is. */
  protected readonly caption = computed(() => {
    const rows = this.rows();
    const unused = rows.filter((row) => (row.usedBy ?? []).length === 0).length;
    const count = plural(rows.length, 'secret');
    return unused > 0 ? `${count}, ${unused} unused` : count;
  });

  /** Refresh: the secrets, read again (a secret created or removed by hand sends no event). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.secrets.reload() },
  ];

  protected readonly marks = MARKS;

  protected readonly shortId = shortSwarmId;

  protected readonly instant = formatInstant;

  /** A secret's labels as `key=value`, in the answer's order. */
  protected labelsOf(row: SwarmSecret): readonly string[] {
    return Object.entries(row.labels ?? {}).map(([key, value]) => `${key}=${value}`);
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  id: { derived: ['id'] },
  unused: { derived: ['usedBy'] },
  labels: { derived: ['labels'] },
  createdAt: { derived: ['createdAt'] },
  updatedAt: { derived: ['updatedAt'] },
} as const;
