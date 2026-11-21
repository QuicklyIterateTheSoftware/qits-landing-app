import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { QitsApiError, QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { formatBytes, plural } from '$core/artifacts/artifact-listings';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { dockerInstant } from '$core/system/docker-date';
import { imageShortId, inUse, totalBytes } from '$core/system/node-images';
import type { NodeImage } from '$core/system/node-images.consumes';
import { NODE_IMAGE_LIST } from '$core/system/node-images.operations';
import { OPEN_SWARM_NODE } from '$core/system/open-swarm-node';
import { DEPLOYMENT_EVENTS } from '$core/updates/app-updates';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the tab draws for a value an image does not have. */
const NONE = '—';

/** What docker writes for the repository and tag of a dangling image. */
const DANGLING = '<none>';

/**
 * A swarm node's Images tab (qits-2353), at `/system/swarm/nodes/<id>/images`, drawn in the node
 * layout's outlet (`SwarmNodeLayout`, `NODE_TABS`). It replaces qits-system-frontend's
 * `swarm/nodes/:id/images` tab, which hands off here.
 *
 * **Load budget: 1, nothing per row.** `NODE_IMAGE_LIST` (`listNodeImages`, `docker image ls` on
 * the daemon qits-system runs on), by the layout's node id (`OPEN_SWARM_NODE`). The read is made in
 * the browser only (the server render has no session), and only once the layout has read the node
 * and found it `self`: the door reads the local daemon alone and answers any other node 409
 * `NODE_REMOTE`.
 *
 * - Caption: "N images, <total>" (Σ `sizeBytes`, binary units), and "Refresh images".
 * - Rows in docker's order (newest first): repository and tag (a dangling image's `<none>` is a
 *   "dangling" chip, its tag "—"), docker's short id (`imageShortId`: the 12 hex digits after
 *   `sha256:`, the whole id in `title`), created (docker's Go date read by its offset,
 *   `dockerInstant`, then `formatInstant`; "—" when it does not parse), size and how many
 *   containers use it ("unused" on a chip at 0). No digest (`<none>` on every row: the door does not
 *   ask docker for digests) and no "created since" (docker's phrase, frozen at the read).
 *
 * States: loading; no images is one sentence; another node (the layout's node not `self`, or the
 * read answering 409 `NODE_REMOTE`) is a note, never a failure, with no Retry; a 403 says the role;
 * a 503 (the daemon not answering) and any other failure say the images cannot be read, with Retry.
 *
 * Marks (qits-2141): the table is the read's list, each row an image by its `id`; the cells drawn
 * as served are fields, the short id, created, size, use, the chips and the caption derived.
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `DEPLOYMENT_EVENTS` → the whole list,
 * debounced 1 s: an image arrives when something deploys. Nothing announces an image leaving:
 * runner housekeeping (the dangling and lease image passes) removes images without an event, and
 * so does a prune by hand, so Refresh reads the list again. Nothing polls.
 */
@Component({
  selector: 'app-swarm-node-images-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, LoadFailure, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    @if (remote()) {
      <p
        role="status"
        class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
        data-remote
      >
        Only the node qits-system runs on can be read; this is another node.
        @if (remoteMessage(); as message) {
          <span class="text-fg-muted">({{ message }})</span>
        }
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
        message="The node’s images cannot be read right now."
        [class.hidden]="state() !== 'error'"
        (retry)="images.reload()"
      />
      <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p class="m-0 text-sm text-fg-soft" [qitsEntityList]="images" data-caption>
            <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
          </p>
          <ui-action-button [action]="refresh" />
        </div>
        @if (rows().length === 0) {
          <p
            role="status"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
            [qitsEntityList]="images"
          >
            This node holds no images.
          </p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left text-sm" aria-label="Images">
              <thead>
                <tr class="border-b border-line text-xs text-fg-muted">
                  <th class="py-1.5 pr-3 font-semibold">Repository</th>
                  <th class="py-1.5 pr-3 font-semibold">Tag</th>
                  <th class="py-1.5 pr-3 font-semibold">ID</th>
                  <th class="py-1.5 pr-3 font-semibold">Created</th>
                  <th class="py-1.5 pr-3 text-right font-semibold">Size</th>
                  <th class="py-1.5 font-semibold">In use</th>
                </tr>
              </thead>
              <tbody [qitsEntityList]="images">
                @for (row of rows(); track row.id) {
                  <tr
                    class="border-b border-line-subtle align-top"
                    [qitsEntity]="row"
                    entityKey="id"
                  >
                    <td class="min-w-48 py-1.5 pr-3 font-mono text-xs break-all">
                      @if (dangling(row)) {
                        <ui-chip
                          class="font-sans"
                          label="dangling"
                          tone="neutral"
                          [fieldOf]="row"
                          [qitsField]="marks.dangling"
                        />
                      } @else {
                        <span [fieldOf]="row" qitsField="repository">{{ row.repository }}</span>
                      }
                    </td>
                    <td
                      class="py-1.5 pr-3 font-mono text-xs break-all"
                      [fieldOf]="row"
                      [qitsField]="marks.tag"
                    >
                      {{ tagOf(row) }}
                    </td>
                    <td
                      class="py-1.5 pr-3 font-mono text-xs whitespace-nowrap text-fg-soft"
                      [title]="row.id ?? ''"
                      [fieldOf]="row"
                      [qitsField]="marks.id"
                      data-image-id
                    >
                      {{ shortId(row.id) }}
                    </td>
                    <td
                      class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                      [fieldOf]="row"
                      [qitsField]="marks.createdAt"
                      data-created
                    >
                      {{ created(row.createdAt) }}
                    </td>
                    <td
                      class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                      [fieldOf]="row"
                      [qitsField]="marks.sizeBytes"
                    >
                      {{ size(row.sizeBytes) }}
                    </td>
                    <td class="py-1.5 whitespace-nowrap tabular-nums" data-in-use>
                      @if (usedBy(row) === 0) {
                        <ui-chip
                          label="unused"
                          tone="neutral"
                          [fieldOf]="row"
                          [qitsField]="marks.unused"
                        />
                      } @else {
                        <span [fieldOf]="row" [qitsField]="marks.containers">{{
                          usedBy(row) ?? none
                        }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </ui-spinner>
    }
  `,
})
export class SwarmNodeImagesPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly open = inject(OPEN_SWARM_NODE);

  /** The node the layout read is not the one qits-system runs on: the tab does not read it. */
  private readonly another = computed(() => this.open.node()?.self === false);

  /**
   * The read's params: the layout's node, in the browser only, once the layout has read it and
   * found it the node qits-system runs on (`self`).
   */
  private readonly addressed = () => {
    const id = this.open.nodeId();
    return this.browser && id && this.open.node()?.self === true ? { path: { id } } : undefined;
  };

  /** The node's images; read again after a deployment went live or failed. */
  protected readonly images = qitsResource(NODE_IMAGE_LIST, this.addressed, {
    refreshOn: { names: DEPLOYMENT_EVENTS, debounceMs: 1_000 },
  });

  /** The read's answer; no images while it has none. */
  protected readonly answer = computed(
    (): readonly NodeImage[] => (this.images.hasValue() ? this.images.value() : []) ?? [],
  );

  /** The rows, in docker's order. */
  protected readonly rows = computed((): readonly NodeImage[] => this.answer());

  protected readonly state = computed((): LoadState => loadState(this.images));

  /** The read's failure; undefined while it has not failed. */
  private readonly failure = computed(
    (): QitsApiError<{ code?: string; message?: string }> | undefined => {
      if (this.images.status() !== 'error') return undefined;
      const error = this.images.error();
      return error instanceof QitsApiError ? error : undefined;
    },
  );

  /** A 409 `NODE_REMOTE`: the door reads only the node qits-system runs on. */
  private readonly answeredRemote = computed(() => this.failure()?.status === 409);

  /** Another node: known from the layout's read, or from the door's 409. */
  protected readonly remote = computed(() => this.another() || this.answeredRemote());

  /** The door's own words on a 409, when it sent any. */
  protected readonly remoteMessage = computed(() => {
    const message = this.answeredRemote() ? this.failure()?.error?.message : undefined;
    return typeof message === 'string' && message.trim() ? message.trim() : undefined;
  });

  /** A 403: the viewer's roles may not read the swarm. */
  protected readonly refused = computed(() => this.failure()?.status === 403);

  /** `1 image, 310 MiB`. */
  protected readonly caption = computed(
    () => `${plural(this.rows().length, 'image')}, ${formatBytes(totalBytes(this.rows()))}`,
  );

  /** Refresh: the images, read again (nothing announces an image leaving). */
  protected readonly refresh: Action = {
    label: 'Refresh images',
    variant: 'muted',
    callback: () => this.images.reload(),
  };

  protected readonly marks = MARKS;
  protected readonly none = NONE;
  protected readonly shortId = imageShortId;
  protected readonly size = formatBytes;

  /** When the image was created, as docker dated it; {@link NONE} when that is no date. */
  protected created(createdAt: string | undefined): string {
    const instant = dockerInstant(createdAt);
    return instant ? formatInstant(instant) : NONE;
  }

  /** A dangling image: docker names no repository. */
  protected dangling(row: NodeImage): boolean {
    return row.repository === DANGLING;
  }

  /** The tag; {@link NONE} for a dangling image's `<none>`. */
  protected tagOf(row: NodeImage): string {
    return !row.tag || row.tag === DANGLING ? NONE : row.tag;
  }

  /** How many containers use the image; undefined when docker did not count. */
  protected usedBy(row: NodeImage): number | undefined {
    return inUse(row.containers);
  }
}

/** The data marks of what the tab derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  dangling: { derived: ['repository'] },
  tag: { derived: ['tag'] },
  id: { derived: ['id'] },
  createdAt: { derived: ['createdAt'] },
  sizeBytes: { derived: ['sizeBytes'] },
  unused: { derived: ['containers'] },
  containers: { derived: ['containers'] },
} as const;
