import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsField,
  QitsTriggers,
  qitsResource,
  stay,
} from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import { loadState } from '$core/resources/load-state';
import type { NodeVolume } from '$core/system/node-volumes.consumes';
import { NODE_VOLUME_LIST } from '$core/system/node-volumes.operations';
import { isAnonymousVolume, shortVolumeName, volumeLabelPairs } from '$core/system/node-volumes';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import { ActionButton } from '$ui/components/action-button/action-button';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the tab says about a node qits-system cannot read: any node but the one it runs on. */
export const REMOTE_NODE_NOTE =
  'Only the node qits-system runs on can be read; this is another node.';

/** The query parameter that keeps the anonymous volumes shown (`?anonymous=1`). */
const ANONYMOUS = 'anonymous';

/**
 * The service's note for a read refused as `NODE_REMOTE` (a 409: not the node qits-system runs
 * on), its `message` when it has one; undefined for any other answer. Never a load failure.
 */
function remoteRefusal(read: { status(): string; error(): unknown }): string | undefined {
  if (read.status() !== 'error') return undefined;
  const error = read.error();
  if (!(error instanceof QitsApiError) || error.status !== 409) return undefined;
  const body = error.error as { code?: unknown; message?: unknown } | undefined;
  if (body?.code !== 'NODE_REMOTE') return undefined;
  return typeof body.message === 'string' && body.message ? body.message : REMOTE_NODE_NOTE;
}

/**
 * A swarm node page's Volumes tab (qits-2355), at `/system/swarm/nodes/<id>/volumes`, a child
 * route of `SwarmNodeLayout` drawn in its outlet under the node's labels. It replaces
 * qits-system-frontend's node volumes tab, and is an entry point (the old page hands off to it).
 *
 * **Load budget: 1, nothing per row.** `NODE_VOLUME_LIST` (`listNodeVolumes`, `docker volume ls`
 * on the node qits-system runs on), by the layout's `:id` (`OPEN_SWARM_NODE.nodeId`), in the
 * browser only (the server render has no session). The volumes are local to that node: while the
 * open node is known and not `self`, nothing is read, and the tab says only that node can be read;
 * a 409 `NODE_REMOTE` says the same (in the service's words), never as a failure.
 *
 * - Above the table: "N volumes" (the rows shown), with " · M anonymous hidden" while anonymous
 *   rows are hidden and there are some; "Show anonymous volumes" (`toggle-anonymous-volumes`),
 *   unchecked by default, kept in the address as `?anonymous=1` (merged, replacing the entry), so
 *   the view is linkable; and Refresh.
 * - Rows in the server's order: the name in monospace (an anonymous volume's first 12 characters,
 *   the whole in `title`) with an "unused" chip (`waiting`: no container on the node references
 *   it, which does not make it safe to delete) and, while shown, an "anonymous" chip (neutral); the
 *   driver; the labels as `key=value` chips sorted by key, without docker's anonymous marker ("—"
 *   when none); the mountpoint (monospace, subtle, "—" when empty). No Created column: the door
 *   always answers `createdAt` null.
 * - A volume is anonymous when its labels carry `com.docker.volume.anonymous`
 *   (`core/system/node-volumes.ts`).
 *
 * States: loading; `[]` is "This node holds no volumes."; only anonymous volumes, hidden, is "This
 * node holds only anonymous volumes." with the checkbox still there; a 403 says reading the swarm
 * needs an admin role; a 503 or any other failure says the node's volumes cannot be read right
 * now, with Retry.
 *
 * Marks (qits-2141): the table is the volumes' read, each row a volume by its `name`; the short
 * name is derived from `name`, the chips from `unused` and `labels`, the count from the answer.
 *
 * Staleness (qits-1270): no event names a volume change (a lease's work volume created or purged,
 * a deploy's named volume), so Refresh reads again. No polling.
 */
@Component({
  selector: 'app-swarm-node-volumes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    Chip,
    LoadFailure,
    QitsEntity,
    QitsEntityList,
    QitsField,
    QitsTriggers,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <section aria-labelledby="node-volumes" data-volumes>
      <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="node-volumes" class="m-0 text-base font-semibold">Volumes</h2>
        @if (!otherNode()) {
          <ui-action-button class="ml-auto" [action]="refresh" />
        }
      </div>

      @if (remoteNote(); as note) {
        <p
          role="status"
          class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          data-remote
        >
          {{ note }}
        </p>
      } @else if (refused()) {
        <p
          role="alert"
          class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
        >
          Reading the swarm needs an admin role: qits:admin, qits:admin-agent, qits:desk-admin,
          qits:system or qits:agent.
        </p>
      } @else {
        <ui-load-failure
          message="The node’s volumes cannot be read right now."
          [class.hidden]="state() !== 'error'"
          (retry)="volumes.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-24" [class.hidden]="state() === 'error'">
          @if (answer().length === 0) {
            <p
              role="status"
              class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              [qitsEntityList]="volumes"
              data-no-volumes
            >
              This node holds no volumes.
            </p>
          } @else {
            <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p class="m-0 text-xs text-fg-muted" [qitsEntityList]="volumes" data-caption>
                <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
              </p>
              <label class="inline-flex items-center gap-1.5 text-sm text-fg-soft">
                <input
                  type="checkbox"
                  class="accent-accent"
                  [checked]="showAnonymous()"
                  [qitsTriggers]="[toggling.toggled]"
                  (change)="toggleAnonymous($event)"
                  data-show-anonymous
                />
                Show anonymous volumes
              </label>
            </div>
            @if (rows().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                [qitsEntityList]="volumes"
                data-only-anonymous
              >
                This node holds only anonymous volumes.
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm" aria-label="Volumes">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-muted">
                      <th class="py-1.5 pr-3 font-semibold">Name</th>
                      <th class="py-1.5 pr-3 font-semibold">Driver</th>
                      <th class="py-1.5 pr-3 font-semibold">Labels</th>
                      <th class="py-1.5 font-semibold">Mountpoint</th>
                    </tr>
                  </thead>
                  <tbody [qitsEntityList]="volumes">
                    @for (row of rows(); track row.name) {
                      <tr
                        class="border-b border-line-subtle align-top"
                        [qitsEntity]="row"
                        entityKey="name"
                      >
                        <td class="py-1.5 pr-3">
                          <span class="flex flex-wrap items-center gap-1.5">
                            @if (anonymous(row)) {
                              <span
                                class="font-mono text-xs font-medium"
                                [attr.title]="row.name"
                                [fieldOf]="row"
                                [qitsField]="marks.shortName"
                                data-name
                                >{{ shortName(row.name) }}</span
                              >
                            } @else {
                              <span
                                class="font-mono text-xs font-medium break-all"
                                [fieldOf]="row"
                                qitsField="name"
                                data-name
                                >{{ row.name }}</span
                              >
                            }
                            @if (row.unused) {
                              <ui-chip
                                label="unused"
                                tone="waiting"
                                [fieldOf]="row"
                                [qitsField]="marks.unused"
                              />
                            }
                            @if (anonymous(row)) {
                              <ui-chip
                                label="anonymous"
                                tone="neutral"
                                [fieldOf]="row"
                                [qitsField]="marks.anonymous"
                              />
                            }
                          </span>
                        </td>
                        <td
                          class="py-1.5 pr-3 whitespace-nowrap"
                          [fieldOf]="row"
                          qitsField="driver"
                        >
                          {{ row.driver }}
                        </td>
                        <td
                          class="py-1.5 pr-3"
                          [fieldOf]="row"
                          [qitsField]="marks.labels"
                          data-labels
                        >
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
                          class="min-w-48 py-1.5 font-mono text-xs break-all text-fg-soft"
                          [fieldOf]="row"
                          [qitsField]="marks.mountpoint"
                          data-mountpoint
                        >
                          {{ row.mountpoint || none }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </ui-spinner>
      }
    </section>
  `,
})
export class SwarmNodeVolumesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly open = inject(OPEN_SWARM_NODE);

  /** "Show anonymous volumes": the address changes, nothing is read. */
  protected readonly toggling = outcomes('toggle-anonymous-volumes', { toggled: stay() });

  /** The open node is known, and it is not the one qits-system runs on: nothing to read. */
  protected readonly otherNode = computed(() => this.open.node()?.self === false);

  /** The read's params: the layout's node, in the browser only, and only the node qits-system runs on. */
  private readonly addressed = () => {
    const id = this.open.nodeId();
    return this.browser && id && !this.otherNode() ? { path: { id } } : undefined;
  };

  /** The node's volumes; read again on Refresh only (no event names a volume change). */
  protected readonly volumes = qitsResource(NODE_VOLUME_LIST, this.addressed);

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** Whether the anonymous volumes are shown (`?anonymous=1`). */
  protected readonly showAnonymous = computed(() => this.query().get(ANONYMOUS) === '1');

  /** The read's answer; none while it has none. */
  protected readonly answer = computed(
    (): readonly NodeVolume[] => (this.volumes.hasValue() ? this.volumes.value() : []) ?? [],
  );

  /** The rows shown, in the server's order: the anonymous ones only while asked for. */
  protected readonly rows = computed((): readonly NodeVolume[] =>
    this.showAnonymous() ? this.answer() : this.answer().filter((row) => !isAnonymousVolume(row)),
  );

  /** `2 volumes · 1 anonymous hidden`; the hidden part only while some are. */
  protected readonly caption = computed(() => {
    const hidden = this.answer().length - this.rows().length;
    const count = plural(this.rows().length, 'volume');
    return hidden > 0 ? `${count} · ${hidden} anonymous hidden` : count;
  });

  protected readonly state = computed((): LoadState => loadState(this.volumes));

  /** The note in place of the volumes on a node qits-system cannot read; undefined otherwise. */
  protected readonly remoteNote = computed(() =>
    this.otherNode() ? REMOTE_NODE_NOTE : remoteRefusal(this.volumes),
  );

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refused = computed(() => {
    if (this.volumes.status() !== 'error') return false;
    const error = this.volumes.error();
    return error instanceof QitsApiError && error.status === 403;
  });

  /** Refresh: the volumes, read again (nothing announces a volume change). */
  protected readonly refresh: Action = {
    label: 'Refresh',
    variant: 'muted',
    callback: () => this.volumes.reload(),
  };

  protected readonly marks = MARKS;
  protected readonly none = '—';
  protected readonly anonymous = isAnonymousVolume;
  protected readonly shortName = shortVolumeName;

  protected labelsOf(row: NodeVolume): readonly string[] {
    return volumeLabelPairs(row.labels);
  }

  /** Shows or hides the anonymous volumes, in the address (merged, replacing the entry). */
  protected toggleAnonymous(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.toggling.toggled.reach();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [ANONYMOUS]: checked ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

/** The data marks of what the tab derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  shortName: { derived: ['name'] },
  unused: { derived: ['unused'] },
  anonymous: { derived: ['labels'] },
  labels: { derived: ['labels'] },
  mountpoint: { derived: ['mountpoint'] },
} as const;
