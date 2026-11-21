import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { valueMarks } from '$core/marks/value-marks';
import { formatInstant } from '$core/release-requests/release-request-model';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import type { SwarmConfigDetail } from '$core/system/swarm.consumes';
import { SWARM_CONFIG } from '$core/system/swarm.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page draws for a value the config does not have. */
const NONE = '—';

/** A config's labels as `key=value`, sorted by key; none for `{}`. */
export function configLabelPairs(labels: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(labels ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
}

/**
 * What a config's data block shows: the data itself, a note that it is binary (its bytes are not
 * UTF-8, so the door answers `""` with `binary: true`), or a note that it is empty. A binary config
 * is never read as empty.
 */
export function configContent(config: Pick<SwarmConfigDetail, 'data' | 'binary'>) {
  if (config.binary) return 'binary' as const;
  return config.data ? ('data' as const) : ('empty' as const);
}

/**
 * One config of the swarm (qits-2349), at `/system/swarm/configs/<id>`, where `<id>` is the config's
 * id (the configs list links it) or its name (docker inspects by either). It replaces
 * qits-system-frontend's `swarm/configs/:id`, which read a binary config as empty and every failure
 * as one sentence.
 *
 * **Load budget: 1.** `SWARM_CONFIG` (`getSwarmConfig`, `docker config inspect` on the manager), by
 * the address's id. The read is made in the browser only (the server render has no session).
 *
 * - Title: the config's name (its id while the read is open); "← Configs" back to the list
 *   (`leave-swarm-config`).
 * - Facts: the full id in monospace, Created and Updated as docker inspect's exact instants (to the
 *   second, the served instant on hover), the labels as `key=value` on neutral chips, sorted by key
 *   ("—" when none).
 * - Data: the config's content verbatim in a monospace block that wraps, never truncated, never
 *   parsed or highlighted (a config is configuration by design). A binary config (`binary: true`,
 *   its bytes not UTF-8) says "This config holds binary data, which is not shown.", never "empty";
 *   `data: ""` that is not binary says "This config is empty.".
 *
 * States: loading; a 404 is "No swarm config <id>." and nothing else; a 403 says reading the swarm
 * needs an admin role; a 503 (the swarm not answering) says the swarm cannot be read right now,
 * with Retry; any other failure, with Retry.
 *
 * Marks (qits-2141): the config is an entity by its `id`, each value its field or the fields it is
 * derived from; the data block is `data`, its notes derived from `data` and `binary`.
 *
 * Staleness (qits-1270): no `refreshOn`. No event names a config change: qits-system sends none for
 * the swarm's configs, a deployment creates or removes none, and nothing in the estate creates one
 * today. Refresh reads the config again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-config-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, QitsEntity, QitsExit, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [titleMarks]="titleMarks()" [actions]="actions">
        <p class="mt-0 mb-2 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitCurrent]="null"
            data-back
            >← Configs</a
          >
        </p>

        @if (refusal()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Reading the swarm needs an admin role: qits:admin, qits:admin-agent, qits:desk-admin,
            qits:system or qits:agent.
          </p>
        } @else if (missing()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-missing>
            No swarm config {{ id() }}.
          </p>
        } @else {
          <ui-load-failure
            [message]="failureMessage()"
            [class.hidden]="state() !== 'error'"
            (retry)="config.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
            @if (shown(); as config) {
              <article [qitsEntity]="config" entityKey="id" data-config>
                <section aria-labelledby="config-facts" class="mb-6">
                  <h2 id="config-facts" class="mt-0 mb-2 text-base font-semibold">Facts</h2>
                  <dl
                    class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                    aria-label="Facts"
                  >
                    <dt class="text-fg-muted">ID</dt>
                    <dd
                      class="m-0 font-mono text-xs break-all"
                      [fieldOf]="config"
                      qitsField="id"
                      data-id
                    >
                      {{ config.id }}
                    </dd>
                    <dt class="text-fg-muted">Created</dt>
                    <dd
                      class="m-0"
                      [attr.title]="config.createdAt"
                      [fieldOf]="config"
                      [qitsField]="marks.createdAt"
                      data-created
                    >
                      {{ instant(config.createdAt) }}
                    </dd>
                    <dt class="text-fg-muted">Updated</dt>
                    <dd
                      class="m-0"
                      [attr.title]="config.updatedAt"
                      [fieldOf]="config"
                      [qitsField]="marks.updatedAt"
                      data-updated
                    >
                      {{ instant(config.updatedAt) }}
                    </dd>
                    <dt class="text-fg-muted">Labels</dt>
                    <dd class="m-0" [fieldOf]="config" [qitsField]="marks.labels" data-labels>
                      @for (label of labels(config.labels); track label) {
                        <!-- A space between chips, so the line reads "a=1 b=2". -->
                        <ui-chip class="mr-1 inline-block" [label]="label" tone="neutral" />&ngsp;
                      } @empty {
                        <span class="text-fg-soft">{{ none }}</span>
                      }
                    </dd>
                  </dl>
                </section>

                <section aria-labelledby="config-data" data-data>
                  <h2 id="config-data" class="mt-0 mb-2 text-base font-semibold">Data</h2>
                  @switch (content(config)) {
                    @case ('binary') {
                      <p
                        role="status"
                        class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                        [fieldOf]="config"
                        [qitsField]="marks.binary"
                        data-binary
                      >
                        This config holds binary data, which is not shown.
                      </p>
                    }
                    @case ('empty') {
                      <p
                        role="status"
                        class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                        [fieldOf]="config"
                        [qitsField]="marks.empty"
                        data-empty
                      >
                        This config is empty.
                      </p>
                    }
                    @default {
                      <pre
                        class="m-0 overflow-x-auto rounded-md border border-line bg-surface-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap text-fg [overflow-wrap:anywhere]"
                        aria-label="Config data"
                        [fieldOf]="config"
                        qitsField="data"
                        data-content
                        >{{ config.data }}</pre>
                    }
                  }
                </section>
              </article>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SwarmConfigPage {
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** "← Configs": the list of the swarm's configs. */
  protected readonly leaving = outcomes('leave-swarm-config', {
    back: exit('system/swarm/configs'),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The config the address names, by its id (or name). */
  protected readonly id = computed(() => this.params().get('id') ?? '');

  /** The config; read again on Refresh only (no event names a config change). */
  protected readonly config = qitsResource(SWARM_CONFIG, () => {
    const id = this.id();
    return this.browser && id ? { path: { id } } : undefined;
  });

  /** The config as the page shows it; none while the read has none. */
  protected readonly shown = computed((): SwarmConfigDetail | undefined =>
    this.config.hasValue() ? this.config.value() : undefined,
  );

  /** The page's heading: the config's name once read, its id until then. */
  protected readonly title = computed(() => this.shown()?.name || this.id());

  protected readonly titleMarks = computed(() => {
    const config = this.shown();
    return config?.name ? valueMarks(SWARM_CONFIG, config, 'id', 'name') : undefined;
  });

  /** No such config: a 404. */
  protected readonly missing = computed(() => isMissing(this.config));

  /** The read's failure status (403, 503, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.config.status() !== 'error') return undefined;
    const error = this.config.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refusal = computed(() => this.failure() === 403);

  /** A 503 is the swarm itself not answering; anything else is the read failing. */
  protected readonly failureMessage = computed(() =>
    this.failure() === 503
      ? 'The swarm cannot be read right now.'
      : 'This swarm config could not be read.',
  );

  protected readonly state = computed((): LoadState => loadState(this.config));

  /** Refresh: the config, read again (nothing announces a config change). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.config.reload() },
  ];

  protected readonly marks = MARKS;
  protected readonly none = NONE;
  protected readonly instant = formatInstant;
  protected readonly labels = configLabelPairs;
  protected readonly content = configContent;
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  createdAt: { derived: ['createdAt'] },
  updatedAt: { derived: ['updatedAt'] },
  labels: { derived: ['labels'] },
  binary: { derived: ['binary'] },
  empty: { derived: ['data', 'binary'] },
} as const;
