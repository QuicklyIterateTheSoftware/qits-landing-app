import { isPlatformBrowser } from '@angular/common';
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
import {
  formatBytes,
  newestPushFirst,
  plural,
  shortDigest,
  untaggedCount,
} from '$core/artifacts/artifact-listings';
import type {
  ArtifactImage,
  ArtifactImageManifest,
  ArtifactImageTag,
} from '$core/artifacts/artifacts.consumes';
import {
  ARTIFACT_IMAGE_MANIFESTS,
  ARTIFACT_IMAGE_TAGS,
  ARTIFACT_IMAGES,
} from '$core/artifacts/artifacts.operations';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A read's failure status (404, 400, …); undefined while it has not failed. */
function failureStatus(read: { status(): string; error(): unknown }): number | undefined {
  if (read.status() !== 'error') return undefined;
  const error = read.error();
  return error instanceof QitsApiError ? error.status : undefined;
}

/**
 * One image of an image store (qits-2324), at `/projects/<slug>/components/<repo>/artifacts/<store>/images/<image>`: the
 * Artifacts section's first detail page, which replaces qits-artifacts-frontend's
 * `repositories/:repo/images/:name`. The image name is one segment: a slashed name rides as `%2F`,
 * which the router decodes into the param, and the client encodes again on the wire.
 *
 * **Load budget: 3, nothing per row.** `ARTIFACT_IMAGE_TAGS` (`listImageTagSummaries`) and
 * `ARTIFACT_IMAGE_MANIFESTS` (`listImageManifestSummaries`) are the image's two tables;
 * `ARTIFACT_IMAGES` (`listImages`) is the repository's image list, read for this image's own row:
 * its tag and manifest counts and its size, the union over its blobs (which no sum of the tables'
 * sizes gives). The reads are made in the browser only (the server render has no session).
 *
 * - Header: "← Artifacts" back to the repository's Artifacts (`leave-artifact-image`), the image's name, and
 *   "N tags · M manifests · <size> (union over this image's blobs)" from its `listImages` row; when
 *   that read fails, the header says the size is unknown and the page stays up.
 * - Tags, newest push first: the tag, the manifest digest it names, the bytes that manifest
 *   references (not additive: consecutive builds share base layers, which the caption says),
 *   pushed (`createdAt`) and last accessed ("Never" when null).
 * - Manifests, as answered: the digest, the tags naming it ("Untagged" when none), its media type,
 *   referenced bytes, created and last accessed; below, how many no tag names, only when some.
 * - Digests show shortened (`sha256:` and 12 hex characters); "Show full digests"
 *   (`toggle-image-digests`, a page-local signal, no request) shows them whole.
 *
 * States: loading; a failed tags or manifests read offers Retry; a 404 on any read is "There is no
 * repository called <repo> in this store"; a 400 "<repo> is not an image repository", linking its
 * store page; an image missing from `listImages` with no tag and no manifest (the doors answer an
 * unknown image with empty lists) is "There is no image called <image> in this repository".
 *
 * Marks (qits-2141): the header's line is the image's `listImages` row by name; each tag row an
 * entry of the tags' read by `tag`, each manifest row one of the manifests' read by `digest`.
 *
 * Staleness (qits-1270): none can follow, and nothing polls: qits-artifacts emits no domain event
 * for a push, a pull or a sweep. Refresh reads all three again.
 */
@Component({
  selector: 'app-artifacts-image-page',
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
      <app-page-layout [title]="image()" [actions]="actions">
        <p class="mt-0 mb-2 text-sm" [class.hidden]="!owner()">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ slug: slug(), repo: owner() }"
            [exitCurrent]="null"
            data-back
            >← Artifacts</a
          >
        </p>
        @if (row(); as row) {
          <p
            class="mt-0 mb-4 text-sm text-fg-soft"
            [qitsEntity]="row"
            entityKey="name"
            [entitySource]="images"
            data-lede
          >
            <span [fieldOf]="row" [qitsField]="marks.lede">{{ lede(row) }}</span>
          </p>
        } @else if (sizeUnknown()) {
          <p class="mt-0 mb-4 text-sm text-fg-muted" data-lede>
            This image’s counts and total size could not be read; its tags and manifests follow.
          </p>
        }

        @if (unknownRepository()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            There is no repository called “{{ store() }}” in this store.
          </p>
        } @else if (notImages()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            “{{ store() }}” is not an image repository.
            <a
              class="text-accent no-underline hover:underline"
              [class.hidden]="!owner()"
              [qitsExit]="leaving.repository"
              [exitParams]="{ slug: slug(), repo: owner() }"
              [exitCurrent]="null"
              >Open the repository’s artifacts</a
            >.
          </p>
        } @else {
          <ui-load-failure
            message="This image’s tags and manifests could not be read."
            [class.hidden]="state() !== 'error'"
            (retry)="retry()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (noSuchImage()) {
              <p
                role="alert"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                There is no image called “{{ image() }}” in this repository.
              </p>
            } @else {
              <p class="mt-0 mb-3 text-sm">
                <button
                  type="button"
                  class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent"
                  [attr.aria-pressed]="fullDigests()"
                  [qitsTriggers]="[toggling.toggled]"
                  (click)="toggleDigests()"
                >
                  Show full digests
                </button>
              </p>

              <section aria-labelledby="image-tags" class="mb-8">
                <h2 id="image-tags" class="mt-0 mb-1 text-base font-semibold">Tags</h2>
                <p class="mt-0 mb-2 text-xs text-fg-muted">
                  Each tag’s size is the bytes its manifest references. They do not add up:
                  consecutive builds share their base layers, so the union above is the image’s
                  size.
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full border-collapse text-left text-sm" aria-label="Tags">
                    <thead>
                      <tr class="border-b border-line text-xs text-fg-muted">
                        <th class="py-1.5 pr-3 font-semibold">Tag</th>
                        <th class="py-1.5 pr-3 font-semibold">Manifest digest</th>
                        <th class="py-1.5 pr-3 text-right font-semibold">
                          Referenced bytes (not additive)
                        </th>
                        <th class="py-1.5 pr-3 font-semibold">Pushed</th>
                        <th class="py-1.5 font-semibold">Last accessed</th>
                      </tr>
                    </thead>
                    <tbody [qitsEntityList]="tags">
                      @for (tag of tagRows(); track tag.tag) {
                        <tr
                          class="border-b border-line-subtle align-top"
                          [qitsEntity]="tag"
                          entityKey="tag"
                        >
                          <td
                            class="py-1.5 pr-3 font-mono font-medium whitespace-nowrap"
                            [fieldOf]="tag"
                            qitsField="tag"
                          >
                            {{ tag.tag }}
                          </td>
                          <td
                            class="py-1.5 pr-3 font-mono text-xs break-all text-fg-soft"
                            [title]="tag.digest ?? ''"
                            [fieldOf]="tag"
                            [qitsField]="marks.digest"
                          >
                            {{ digest(tag.digest) }}
                          </td>
                          <td
                            class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                            [fieldOf]="tag"
                            [qitsField]="marks.sizeBytes"
                          >
                            {{ bytes(tag.sizeBytes) }}
                          </td>
                          <td
                            class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                            [fieldOf]="tag"
                            [qitsField]="marks.createdAt"
                          >
                            {{ instant(tag.createdAt) }}
                          </td>
                          <td
                            class="py-1.5 whitespace-nowrap text-fg-soft"
                            [fieldOf]="tag"
                            [qitsField]="marks.accessedAt"
                          >
                            {{ accessed(tag.accessedAt) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p
                  class="m-0 px-3 py-6 text-center text-sm text-fg-muted"
                  [class]="tagList().length === 0 ? 'block' : 'hidden'"
                >
                  No tag names a manifest of this image.
                </p>
              </section>

              <section aria-labelledby="image-manifests">
                <h2 id="image-manifests" class="mt-0 mb-2 text-base font-semibold">
                  Manifest inventory
                </h2>
                <div class="overflow-x-auto">
                  <table class="w-full border-collapse text-left text-sm" aria-label="Manifests">
                    <thead>
                      <tr class="border-b border-line text-xs text-fg-muted">
                        <th class="py-1.5 pr-3 font-semibold">Manifest digest</th>
                        <th class="py-1.5 pr-3 font-semibold">Tags</th>
                        <th class="py-1.5 pr-3 font-semibold">Media type</th>
                        <th class="py-1.5 pr-3 text-right font-semibold">Referenced bytes</th>
                        <th class="py-1.5 pr-3 font-semibold">Created</th>
                        <th class="py-1.5 font-semibold">Last accessed</th>
                      </tr>
                    </thead>
                    <tbody [qitsEntityList]="manifests">
                      @for (manifest of manifestList(); track manifest.digest) {
                        <tr
                          class="border-b border-line-subtle align-top"
                          [qitsEntity]="manifest"
                          entityKey="digest"
                        >
                          <td
                            class="py-1.5 pr-3 font-mono text-xs break-all text-fg-soft"
                            [title]="manifest.digest ?? ''"
                            [fieldOf]="manifest"
                            [qitsField]="marks.digest"
                          >
                            {{ digest(manifest.digest) }}
                          </td>
                          <td
                            class="py-1.5 pr-3 font-mono"
                            [fieldOf]="manifest"
                            [qitsField]="marks.tags"
                          >
                            @if ((manifest.tags ?? []).length) {
                              {{ tagNames(manifest) }}
                            } @else {
                              <span class="font-sans text-fg-muted italic">Untagged</span>
                            }
                          </td>
                          <td
                            class="py-1.5 pr-3 text-xs break-all text-fg-soft"
                            [fieldOf]="manifest"
                            qitsField="mediaType"
                          >
                            {{ manifest.mediaType }}
                          </td>
                          <td
                            class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                            [fieldOf]="manifest"
                            [qitsField]="marks.sizeBytes"
                          >
                            {{ bytes(manifest.sizeBytes) }}
                          </td>
                          <td
                            class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                            [fieldOf]="manifest"
                            [qitsField]="marks.createdAt"
                          >
                            {{ instant(manifest.createdAt) }}
                          </td>
                          <td
                            class="py-1.5 whitespace-nowrap text-fg-soft"
                            [fieldOf]="manifest"
                            [qitsField]="marks.accessedAt"
                          >
                            {{ accessed(manifest.accessedAt) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p
                  class="m-0 px-3 py-6 text-center text-sm text-fg-muted"
                  [class]="manifestList().length === 0 ? 'block' : 'hidden'"
                >
                  This image holds no manifests.
                </p>
                @if (untagged() > 0) {
                  <p class="mt-3 mb-0 text-sm text-fg-soft" data-untagged>
                    {{ untaggedNote() }}
                  </p>
                }
              </section>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class ArtifactsImagePage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  /** "← Artifacts", and a non-image store's note: the repository's Artifacts (qits-2477). */
  protected readonly leaving = outcomes('leave-artifact-image', {
    back: exit('projects/:slug/components/:repo/artifacts'),
    repository: exit('projects/:slug/components/:repo/artifacts'),
  });

  /** "Show full digests": the page changes, nothing is read. */
  protected readonly toggling = outcomes('toggle-image-digests', { toggled: stay() });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The URL's store repository name. */
  protected readonly store = computed(() => this.params().get('store') ?? '');

  /**
   * The repository that publishes the artifact (qits-2477): the back link's. Empty on the old
   * `artifacts/repositories/…` address, which qits-artifacts-frontend still hands off to: that
   * address names no repository, so it shows no back link.
   */
  protected readonly owner = computed(() => this.params().get('repo') ?? '');

  /** The open project's slug. */
  protected readonly slug = computed(() => this.params().get('slug') ?? '');
  /** The URL's image name, decoded (a slash rides as `%2F`). */
  protected readonly image = computed(() => this.params().get('image') ?? '');

  /** The repository's images: this image's row is the header's counts and size. */
  protected readonly images = qitsResource(ARTIFACT_IMAGES, () => {
    const repo = this.store();
    return this.browser && repo ? { path: { repo } } : undefined;
  });

  /** The params of the image's own two reads. */
  private readonly imageParams = () => {
    const repo = this.store();
    const image = this.image();
    return this.browser && repo && image ? { path: { repo, image } } : undefined;
  };

  protected readonly tags = qitsResource(ARTIFACT_IMAGE_TAGS, this.imageParams);
  protected readonly manifests = qitsResource(ARTIFACT_IMAGE_MANIFESTS, this.imageParams);

  /** Digests whole; shortened again when another image opens. */
  protected readonly fullDigests = linkedSignal({
    source: () => `${this.store()}/${this.image()}`,
    computation: () => false,
  });

  /** This image's `listImages` row, once that read answered and holds it. */
  protected readonly row = computed((): ArtifactImage | undefined => {
    const list = (this.images.hasValue() ? this.images.value()?.images : undefined) ?? [];
    return list.find((image) => image.name === this.image());
  });

  protected readonly tagList = computed(
    (): readonly ArtifactImageTag[] =>
      (this.tags.hasValue() ? this.tags.value()?.tags : undefined) ?? [],
  );
  /** The tags, newest push first. */
  protected readonly tagRows = computed(() => newestPushFirst(this.tagList()));

  protected readonly manifestList = computed(
    (): readonly ArtifactImageManifest[] =>
      (this.manifests.hasValue() ? this.manifests.value()?.manifests : undefined) ?? [],
  );

  /** How many manifests no tag names. */
  protected readonly untagged = computed(() => untaggedCount(this.manifestList()));

  private readonly statuses = computed(() =>
    [this.tags, this.manifests, this.images].map(failureStatus),
  );

  /** A 404 on any read: the store holds no repository of that name. */
  protected readonly unknownRepository = computed(() => this.statuses().includes(404));

  /** A 400 on any read: the repository holds something other than images. */
  protected readonly notImages = computed(
    () => !this.unknownRepository() && this.statuses().includes(400),
  );

  /** The image row's read failed otherwise: the header says the size is unknown. */
  protected readonly sizeUnknown = computed(
    () => this.images.status() === 'error' && !this.unknownRepository() && !this.notImages(),
  );

  /** The tables: failed when either read failed, loaded once both answered. */
  protected readonly state = computed((): LoadState => {
    const tags = loadState(this.tags);
    const manifests = loadState(this.manifests);
    if (tags === 'error' || manifests === 'error') return 'error';
    return tags === 'loaded' && manifests === 'loaded' ? 'loaded' : 'loading';
  });

  /**
   * No such image: the repository's images were read (or failed) without it, and the image has no
   * tag and no manifest (the doors answer an image they do not hold with empty lists).
   */
  protected readonly noSuchImage = computed(
    () =>
      this.state() === 'loaded' &&
      (this.images.hasValue() || this.images.status() === 'error') &&
      !this.row() &&
      this.tagList().length === 0 &&
      this.manifestList().length === 0,
  );

  /** Refresh: the image's row, tags and manifests, read again (no event follows the store). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.images.reload();
        this.tags.reload();
        this.manifests.reload();
      },
    },
  ];

  protected readonly marks = MARKS;

  /** Retry: the failed tables' reads, again. */
  protected retry(): void {
    if (this.tags.status() === 'error') this.tags.reload();
    if (this.manifests.status() === 'error') this.manifests.reload();
  }

  protected toggleDigests(): void {
    this.fullDigests.update((full) => !full);
    this.toggling.toggled.reach();
  }

  /** `1 tag · 2 manifests · 5.15 KiB (union over this image's blobs)`. */
  protected lede(row: ArtifactImage): string {
    return (
      `${plural(row.tagCount, 'tag')} · ${plural(row.manifestCount, 'manifest')} · ` +
      `${formatBytes(row.sizeBytes)} (union over this image’s blobs)`
    );
  }

  /** `1 manifest is untagged: no tag names it.` */
  protected untaggedNote(): string {
    const n = this.untagged();
    return n === 1
      ? '1 manifest is untagged: no tag names it.'
      : `${n} manifests are untagged: no tag names them.`;
  }

  protected digest(value: string | undefined): string {
    if (!value) return '—';
    return this.fullDigests() ? value : shortDigest(value);
  }

  protected tagNames(manifest: ArtifactImageManifest): string {
    return (manifest.tags ?? []).join(', ');
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
  lede: { derived: ['tagCount', 'manifestCount', 'sizeBytes'] },
  digest: { derived: ['digest'] },
  sizeBytes: { derived: ['sizeBytes'] },
  createdAt: { derived: ['createdAt'] },
  accessedAt: { derived: ['accessedAt'] },
  tags: { derived: ['tags'] },
} as const;
