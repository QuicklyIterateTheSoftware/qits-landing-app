import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  QitsTriggers,
  stay,
} from '@qits/angular';
import { formatBytes, plural, shortDigest } from '$core/artifacts/artifact-listings';
import type {
  ArtifactDaemonVersion,
  ArtifactDaemonVersions,
} from '$core/artifacts/artifacts.consumes';
import {
  ARTIFACT_DAEMON_DOWNLOAD,
  ARTIFACT_DAEMON_VERSIONS,
  daemonDownloadParams,
} from '$core/artifacts/artifacts.operations';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The answer while the read has none. */
const NO_VERSIONS: ArtifactDaemonVersions = { versions: [] };

/** What a version's download has come to: under way, or failed. */
type DownloadState = 'pending' | 'failed';

/**
 * One daemon of a daemon store (qits-2327), at `/artifacts/repositories/<repo>/daemons/<daemon>`:
 * its published versions, each one downloadable. It replaces qits-artifacts-frontend's
 * `repositories/:repo/daemons/:name`. A daemon name is bounded to `[a-z0-9][a-z0-9._-]{0,63}` by
 * the wire, so it is always one plain segment.
 *
 * **Load budget: 1, nothing per row.** `ARTIFACT_DAEMON_VERSIONS` (`listDaemonVersions`) is the
 * table: each version arrives with its digest, its size and its two instants. The read is made in
 * the browser only (the server render has no session).
 *
 * - Header: "← <repo>" back to the store page (`leave-artifact-daemon`), the daemon's name, and
 *   "N versions · newest first".
 * - Versions, newest first as the wire gives them: the version, its size (the version's own blob;
 *   not totalled, as the caption says: the store page's figure is the union over the daemon), its
 *   digest (shortened, `shortDigest`, the whole `sha256:` value in the cell's title), published
 *   and last accessed ("Never" when null; a digest-addressed read does not move it, which a note
 *   says).
 * - A version's button downloads it (`download-artifact-daemon`, a stay): `ARTIFACT_DAEMON_DOWNLOAD`
 *   (`getDaemon`, `GET /artifacts/daemons/<daemon>/<version>`, the daemon wire, which carries no
 *   repository segment) read through `HttpClient`, so `qitsBearerInterceptor` signs it, as a Blob,
 *   and saved through an object URL as `<daemon>-<version>`. A navigation would carry no bearer.
 *   A failed download says so under the table, and the button tries again.
 *
 * States: loading; a failed read offers Retry; a 404 is "There is no repository called <repo> in
 * this store"; a 400 "<repo> is not a daemon repository", linking its store page; an empty list is
 * one sentence: the daemon has no published versions here, and an unknown daemon answers the same
 * (the wire answers 200 with no versions for a name nothing was published under).
 *
 * Marks (qits-2141): the table is the versions' read, each row an entry by its `version`; the
 * header's count is derived from the answer's `versions`.
 *
 * Staleness (qits-1270): none can follow, and nothing polls: qits-artifacts emits no domain event
 * for a publish, a download or a sweep. Refresh reads the versions again.
 */
@Component({
  selector: 'app-artifacts-daemon-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    QitsTriggers,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="daemon()" [actions]="actions">
        <p class="mt-0 mb-2 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ repo: repo() }"
            [exitCurrent]="null"
            data-back
            >← {{ repo() }}</a
          >
        </p>
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="versions" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.lede">{{ lede() }}</span>
          </p>
        }

        @if (unknownRepository()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            There is no repository called “{{ repo() }}” in this store.
          </p>
        } @else if (notDaemons()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            “{{ repo() }}” is not a daemon repository.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.repository"
              [exitParams]="{ repo: repo() }"
              [exitCurrent]="null"
              >Open its store page</a
            >.
          </p>
        } @else {
          <ui-load-failure
            message="This daemon’s versions could not be read."
            [class.hidden]="state() !== 'error'"
            (retry)="versions.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (versionList().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                “{{ daemon() }}” has no published versions in this repository. A daemon nothing was
                ever published under answers the same, so this does not say whether the name is
                known.
              </p>
            } @else {
              <section aria-labelledby="daemon-versions">
                <h2 id="daemon-versions" class="mt-0 mb-1 text-base font-semibold">Versions</h2>
                <p class="mt-0 mb-2 text-xs text-fg-muted">
                  Each size is that version’s own blob, and the column is not totalled: the size on
                  the store page is the union over this daemon’s blobs, which is smaller wherever
                  two versions hold the same bytes.
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full border-collapse text-left text-sm" aria-label="Versions">
                    <thead>
                      <tr class="border-b border-line text-xs text-fg-muted">
                        <th class="py-1.5 pr-3 font-semibold">Version</th>
                        <th class="py-1.5 pr-3 text-right font-semibold">Size</th>
                        <th class="py-1.5 pr-3 font-semibold">Digest</th>
                        <th class="py-1.5 pr-3 font-semibold">Published</th>
                        <th class="py-1.5 font-semibold">Last accessed</th>
                      </tr>
                    </thead>
                    <tbody [qitsEntityList]="versions">
                      @for (version of versionList(); track version.version) {
                        <tr
                          class="border-b border-line-subtle align-top"
                          [qitsEntity]="version"
                          entityKey="version"
                        >
                          <td class="py-1.5 pr-3 font-mono font-medium whitespace-nowrap">
                            <button
                              type="button"
                              class="cursor-pointer border-0 bg-transparent p-0 font-mono font-medium text-accent hover:underline disabled:cursor-wait disabled:text-fg-muted"
                              [attr.aria-label]="'Download ' + daemon() + ' ' + version.version"
                              [disabled]="downloadOf(version) === 'pending'"
                              [qitsTriggers]="[downloading.started]"
                              (click)="download(version)"
                              [fieldOf]="version"
                              qitsField="version"
                            >
                              {{ version.version }}
                            </button>
                          </td>
                          <td
                            class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                            [fieldOf]="version"
                            [qitsField]="marks.sizeBytes"
                          >
                            {{ bytes(version.sizeBytes) }}
                          </td>
                          <td
                            class="py-1.5 pr-3 font-mono text-xs break-all text-fg-soft"
                            [title]="version.digest ?? ''"
                            [fieldOf]="version"
                            [qitsField]="marks.digest"
                          >
                            {{ digest(version.digest) }}
                          </td>
                          <td
                            class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                            [fieldOf]="version"
                            [qitsField]="marks.publishedAt"
                          >
                            {{ instant(version.publishedAt) }}
                          </td>
                          <td
                            class="py-1.5 whitespace-nowrap text-fg-soft"
                            [fieldOf]="version"
                            [qitsField]="marks.accessedAt"
                          >
                            {{ accessed(version.accessedAt) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @for (failed of failedDownloads(); track failed) {
                  <p
                    role="alert"
                    class="mt-3 mb-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                    data-download-failed
                  >
                    {{ daemon() }} {{ failed }} could not be downloaded. Press the version to try
                    again.
                  </p>
                }
                <p class="mt-3 mb-0 text-sm text-fg-soft">
                  A version downloads its own bytes: the version-addressed
                  <code>GET</code> a bootstrap makes, on the daemon download door, which carries no
                  repository segment. The digest beside it is the exact <code>sha256:</code> value
                  that download answers with and a deployment pins; hover it for the whole value.
                </p>
                <p class="mt-2 mb-0 text-sm text-fg-soft">
                  “Never” counts that version-addressed download only: a read of the blob by its
                  digest does not move it, so a version pulled by digest alone still reads as never
                  accessed.
                </p>
              </section>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class ArtifactsDaemonPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);

  /** "← <repo>", and a non-daemon repository's store page: the repository's page. */
  protected readonly leaving = outcomes('leave-artifact-daemon', {
    back: exit('artifacts/repositories/:repo'),
    repository: exit('artifacts/repositories/:repo'),
  });

  /** A version's button: its bytes are fetched and saved; the page stays. */
  protected readonly downloading = outcomes('download-artifact-daemon', { started: stay() });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The URL's store repository name. */
  protected readonly repo = computed(() => this.params().get('repo') ?? '');
  /** The URL's daemon name. */
  protected readonly daemon = computed(() => this.params().get('daemon') ?? '');

  /** The daemon's versions, newest first. */
  protected readonly versions = qitsResource(ARTIFACT_DAEMON_VERSIONS, () => {
    const repo = this.repo();
    const daemon = this.daemon();
    return this.browser && repo && daemon ? { path: { repo, daemon } } : undefined;
  });

  /** The read's answer; no versions while it has none. */
  protected readonly answer = computed(
    (): ArtifactDaemonVersions =>
      (this.versions.hasValue() ? this.versions.value() : undefined) ?? NO_VERSIONS,
  );

  protected readonly versionList = computed(
    (): readonly ArtifactDaemonVersion[] => this.answer().versions ?? [],
  );

  /** Each version's download under way or failed; forgotten when another daemon opens. */
  private readonly downloads = linkedSignal<string, ReadonlyMap<string, DownloadState>>({
    source: () => `${this.repo()}/${this.daemon()}`,
    computation: () => new Map(),
  });

  /** The versions whose last download failed. */
  protected readonly failedDownloads = computed(() =>
    [...this.downloads()].filter(([, state]) => state === 'failed').map(([version]) => version),
  );

  /** The read's failure status (404, 400, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.versions.status() !== 'error') return undefined;
    const error = this.versions.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 404: the store holds no repository of that name. */
  protected readonly unknownRepository = computed(() => this.failure() === 404);

  /** A 400: the repository holds something other than daemons. */
  protected readonly notDaemons = computed(() => this.failure() === 400);

  protected readonly state = computed((): LoadState => loadState(this.versions));

  /** `2 versions · newest first`. */
  protected readonly lede = computed(
    () => `${plural(this.versionList().length, 'version')} · newest first`,
  );

  /** Refresh: the versions, read again (no event follows the store). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.versions.reload() },
  ];

  protected readonly marks = MARKS;

  protected downloadOf(version: ArtifactDaemonVersion): DownloadState | undefined {
    return version.version ? this.downloads().get(version.version) : undefined;
  }

  /**
   * Fetches `version`'s bytes with the bearer (a navigation would carry none) and saves them as
   * `<daemon>-<version>` through an object URL.
   */
  protected async download(version: ArtifactDaemonVersion): Promise<void> {
    const name = version.version;
    const daemon = this.daemon();
    if (!name || !daemon || this.downloadOf(version) === 'pending') return;
    this.downloading.started.reach();
    this.setDownload(name, 'pending');
    const { data, error } = await ARTIFACT_DAEMON_DOWNLOAD.fetch(
      daemonDownloadParams(daemon, name),
    );
    if (error === undefined && data instanceof Blob) {
      this.save(data, `${daemon}-${name}`);
      this.setDownload(name, undefined);
    } else {
      this.setDownload(name, 'failed');
    }
  }

  private setDownload(version: string, state: DownloadState | undefined): void {
    this.downloads.update((held) => {
      const next = new Map(held);
      if (state) next.set(version, state);
      else next.delete(version);
      return next;
    });
  }

  /** Saves `blob` as `fileName`, as a download link would. */
  private save(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked once the click has handed the URL to the download, not before.
    setTimeout(() => URL.revokeObjectURL(url));
  }

  protected digest(value: string | undefined): string {
    return shortDigest(value);
  }

  protected bytes(value: number | undefined): string {
    return formatBytes(value);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }

  protected accessed(iso: string | null | undefined): string {
    return iso ? formatInstant(iso) : 'Never';
  }
}

/** The data marks of what the page derives from a row (each a class constant, as the rule reads). */
const MARKS = {
  lede: { derived: ['versions'] },
  digest: { derived: ['digest'] },
  sizeBytes: { derived: ['sizeBytes'] },
  publishedAt: { derived: ['publishedAt'] },
  accessedAt: { derived: ['accessedAt'] },
} as const;
