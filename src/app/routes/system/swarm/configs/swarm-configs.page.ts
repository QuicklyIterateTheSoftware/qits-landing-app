import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
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
import { plural } from '$core/artifacts/artifact-listings';
import { loadState } from '$core/resources/load-state';
import type { SwarmConfig } from '$core/system/swarm.consumes';
import { SWARM_CONFIG_LIST } from '$core/system/swarm.operations';
import { shortSwarmId } from '$core/system/swarm-node-tones';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The System section's configs page (qits-2348), at `/system/swarm/configs`: the configs of the
 * one swarm qits-system runs on. It replaces qits-system-frontend's `swarm/configs`, with the
 * labels themselves rather than their count (they are what says who owns a config), and the dates
 * as docker gives them.
 *
 * **Load budget: 1, nothing per row.** `SWARM_CONFIG_LIST` (`listSwarmConfigs`, `docker config ls`
 * on the manager) is the table, in the server's order. The read is made in the browser only (the
 * server render has no session).
 *
 * - Header: "Swarm configs", Refresh, and "N configs".
 * - Rows: name (linking the config's page here by its id, `open-swarm-config`, qits-2349),
 *   docker's 12-character id (the whole id on hover), the labels (each `key=value` on a neutral
 *   chip, sorted by key, "—" when none), created and updated.
 * - Created and Updated are the door's text verbatim: real docker's `config ls` writes a humanized
 *   age (`2 months ago`), not an instant, so nothing parses or formats it. The exact instants are
 *   the config's own page's (`config inspect`).
 *
 * States: loading; a swarm holding no configs is one sentence; a 403 says the swarm needs an admin
 * role; a 503 (the swarm is inactive, docker's socket missing or timing out: qits-system never
 * answers that as an empty list) says the swarm cannot be read right now, with Retry; any other
 * failure, with Retry.
 *
 * Marks (qits-2141): the table is the configs' read, each row a config by its `id`; the short id
 * is derived from `id`, the labels cell from `labels`, name, created and updated are their fields
 * as served, the count from the whole answer.
 *
 * Staleness (qits-1270): no `refreshOn`. No event names a config change: qits-system sends none
 * for the swarm's configs, a deployment creates or removes none, and nothing in the estate creates
 * one today. Refresh reads the list again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-configs-page',
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
      <app-page-layout title="Swarm configs" [actions]="actions">
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="configs" data-lede>
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
            (retry)="configs.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (rows().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                This swarm holds no configs.
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm" aria-label="Configs">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-muted">
                      <th class="py-1.5 pr-3 font-semibold">Name</th>
                      <th class="py-1.5 pr-3 font-semibold">ID</th>
                      <th class="py-1.5 pr-3 font-semibold">Labels</th>
                      <th class="py-1.5 pr-3 font-semibold">Created</th>
                      <th class="py-1.5 font-semibold">Updated</th>
                    </tr>
                  </thead>
                  <tbody [qitsEntityList]="configs">
                    @for (row of rows(); track row.id) {
                      <tr
                        class="border-b border-line-subtle align-top"
                        [qitsEntity]="row"
                        entityKey="id"
                      >
                        <td class="py-1.5 pr-3 whitespace-nowrap">
                          <a
                            class="font-medium text-accent no-underline hover:underline"
                            [qitsExit]="opening.config"
                            [exitParams]="{ id: row.id ?? '' }"
                            [fieldOf]="row"
                            qitsField="name"
                            >{{ row.name }}</a
                          >
                        </td>
                        <td
                          class="py-1.5 pr-3 font-mono text-xs whitespace-nowrap text-fg-soft"
                          [attr.title]="row.id"
                          [fieldOf]="row"
                          [qitsField]="marks.id"
                        >
                          {{ shortId(row.id) }}
                        </td>
                        <td class="py-1.5 pr-3" [fieldOf]="row" [qitsField]="marks.labels">
                          @for (label of labels(row.labels); track label) {
                            <!-- A space between chips, so the cell reads "a=1 b=2". -->
                            <ui-chip
                              class="mr-1 inline-block"
                              [label]="label"
                              tone="neutral"
                            />&ngsp;
                          } @empty {
                            <span class="text-fg-soft">—</span>
                          }
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          qitsField="createdAt"
                        >
                          {{ row.createdAt }}
                        </td>
                        <td
                          class="py-1.5 whitespace-nowrap text-fg-soft"
                          [fieldOf]="row"
                          qitsField="updatedAt"
                        >
                          {{ row.updatedAt }}
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
export class SwarmConfigsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** A row's name: the config's page here (qits-2349), addressed by its id. */
  protected readonly opening = outcomes('open-swarm-config', {
    config: exit('system/swarm/configs/:id'),
  });

  /** The swarm's configs; read again on Refresh only (no event names a config change). */
  protected readonly configs = qitsResource(SWARM_CONFIG_LIST, () =>
    this.browser ? {} : undefined,
  );

  /** The read's answer; no configs while it has none. */
  protected readonly answer = computed(
    (): readonly SwarmConfig[] => (this.configs.hasValue() ? this.configs.value() : []) ?? [],
  );

  /** The rows, in the server's order. */
  protected readonly rows = computed((): readonly SwarmConfig[] => this.answer());

  protected readonly state = computed((): LoadState => loadState(this.configs));

  /** The read's failure status (403, 503, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.configs.status() !== 'error') return undefined;
    const error = this.configs.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refused = computed(() => this.failure() === 403);

  /** A 503 is the swarm itself not answering; anything else is the read failing. */
  protected readonly failureMessage = computed(() =>
    this.failure() === 503
      ? 'The swarm cannot be read right now.'
      : 'The swarm’s configs could not be read.',
  );

  /** `1 config`. */
  protected readonly caption = computed(() => plural(this.rows().length, 'config'));

  /** Refresh: the configs, read again (nothing announces a config change). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.configs.reload() },
  ];

  protected readonly marks = MARKS;

  protected readonly shortId = shortSwarmId;

  /** A config's labels as `key=value`, sorted by key; none for `{}`. */
  protected labels(labels: Readonly<Record<string, string>> | undefined): string[] {
    return Object.entries(labels ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  id: { derived: ['id'] },
  labels: { derived: ['labels'] },
} as const;
