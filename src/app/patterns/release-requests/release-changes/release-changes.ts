import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import type {
  ChangedFile,
  FileDiff,
  ReleaseChanges,
  SubmoduleChanges,
} from '$core/release-requests/changes.consumes';
import { changeKeys, ChangesStore } from '$core/release-requests/changes.store';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import {
  formatInstant,
  formatRelativeTime,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import { changesLede, gitlinkOf, hoistedFile } from '$core/release-requests/release-changes';
import { imageReads, isImagePath, type ImageChange } from '$core/githost/raw-image';
import { RawImagesStore } from '$core/githost/raw-images.store';
import { ChangeList, type ChangeEntry } from '$ui/components/change-list/change-list';
import { DiffViewer } from '$ui/components/diff-viewer/diff-viewer';
import { ImageDiff } from '$ui/components/image-diff/image-diff';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * The Changes tab of a release request (ported from qits-projects-frontend's
 * `release-request-changes`): what the fold changes against the newest release tag that does not
 * hold it, as a file list beside the chosen file's diff. The chosen file rides in `?path=`, so it
 * is a link of its own and survives a tab switch.
 *
 * A submodule pin is not a file: choosing one shows the two pins and the sibling's commits between
 * them, and its changed files join the list under the pin's path; choosing one of those shows its
 * diff inside the sibling. A file no longer in the fold (the fold moved) says so. Every read is
 * per fold (`ChangesStore`), so a poll that changed nothing costs nothing.
 *
 * An image (`isImagePath`, qits-734) shows as images instead of its diff, which would only say the
 * binary differs: the fold's own image read in the request's repository at the base release
 * (`base`) and at the fold (`mergedSha`), one inside a pin in the sibling (`repositoryId`) at the
 * two pins, through `RawImagesStore`. Its text diff is not asked for.
 */
@Component({
  selector: 'app-release-changes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChangeList, DiffViewer, ImageDiff, Spinner],
  host: { class: 'block' },
  template: `
    <ui-spinner [state]="changes()?.status ?? 'loading'" class="min-h-24">
      @let set = changes()?.value;
      <p class="m-0 mb-2 text-sm text-charcoal-brown-600">{{ lede() }}</p>
      <div class="grid gap-3 md:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)]">
        <aside class="min-w-0">
          <p
            class="m-0 mb-1 text-sm text-charcoal-brown-600"
            [class]="set?.detail ? 'block' : 'hidden'"
          >
            {{ set?.detail }}
          </p>
          <p
            class="m-0 text-sm text-charcoal-brown-500"
            [class]="set && !set.files?.length && !set.detail ? 'block' : 'hidden'"
          >
            This fold changes no files.
          </p>
          <ui-change-list
            label="Files this release changes"
            [entries]="entries()"
            [selected]="path()"
            (select)="open($event)"
          />
        </aside>

        <section class="min-w-0">
          @if (path() && pin(); as ref) {
            <h3 class="m-0 mb-1 font-mono text-sm font-semibold break-all">{{ path() }}</h3>
            <p class="m-0 mb-2 font-mono text-sm">
              <span [title]="pinOld() ?? ''">{{ short(pinOld()) }}</span>
              <span class="text-charcoal-brown-400" aria-hidden="true"> → </span>
              <span [title]="pinNew() ?? ''">{{ short(pinNew()) }}</span>
            </p>
            @if (ref.detail) {
              <p class="m-0 text-sm text-charcoal-brown-600">{{ ref.detail }}</p>
            } @else {
              <ui-spinner [state]="expansion()?.status ?? 'loading'" class="min-h-12">
                @let moved = expansion()?.value;
                <p
                  class="m-0 mb-1 text-sm text-charcoal-brown-600"
                  [class]="moved?.detail ? 'block' : 'hidden'"
                >
                  {{ moved?.detail }}
                </p>
                <p
                  class="m-0 text-sm text-charcoal-brown-500"
                  [class]="moved && !moved.commits?.length && !moved.detail ? 'block' : 'hidden'"
                >
                  This pin move brings in no commits.
                </p>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  @for (commit of moved?.commits ?? []; track commit.hash) {
                    <li class="flex flex-wrap items-baseline gap-2 text-sm">
                      <span class="font-mono text-charcoal-brown-600" [title]="commit.hash ?? ''">{{
                        commit.shortHash
                      }}</span>
                      <span class="min-w-48 flex-1 break-words">{{ commit.message }}</span>
                      <span class="text-xs text-charcoal-brown-500">{{ commit.author }}</span>
                      <span
                        class="text-xs text-charcoal-brown-500"
                        [title]="instant(commit.date)"
                        >{{ ago(commit.date) }}</span
                      >
                    </li>
                  }
                </ul>
              </ui-spinner>
            }
          } @else if (path() && !inChangeSet()) {
            <p class="m-0 p-3 text-sm text-charcoal-brown-500">
              {{ path() }} is not changed by this fold.
            </p>
          } @else if (image(); as shown) {
            <h3 class="m-0 mb-2 font-mono text-sm font-semibold break-all">{{ path() }}</h3>
            <ui-image-diff
              [changeType]="shown.changeType"
              [before]="shown.before"
              [after]="shown.after"
            />
          } @else {
            <ui-spinner [state]="diff()?.status ?? 'loaded'" class="min-h-12">
              <ui-diff-viewer [patch]="diff()?.value?.diff ?? ''" [path]="diff() ? path() : ''" />
            </ui-spinner>
          }
        </section>
      </div>
    </ui-spinner>
  `,
})
export class ReleaseChangesView {
  private readonly store = inject(ChangesStore);
  private readonly images = inject(RawImagesStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly request = input.required<ReleaseRequest>();

  protected readonly short = shortShaOrNone;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | undefined) => formatRelativeTime(iso);

  /** The chosen file, from `?path=`; `''` for none. */
  protected readonly path = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('path') ?? '')),
    { initialValue: '' },
  );

  private readonly repoId = computed(() => this.request().repoId ?? '');
  private readonly requestId = computed(() => this.request().id ?? '');
  private readonly fold = computed(() => this.request().mergedSha ?? '');

  protected readonly changes = computed(() =>
    this.store.read<ReleaseChanges>(changeKeys.release(this.requestId(), this.fold())),
  );

  private readonly files = computed<readonly ChangedFile[]>(
    () => this.changes()?.value?.files ?? [],
  );

  /** The submodule pins the fold moves, by path. */
  private readonly gitlinks = computed(
    () =>
      new Map(
        this.files().flatMap((file) =>
          file.submodule ? [[file.path ?? '', file.submodule] as const] : [],
        ),
      ),
  );

  /** The chosen pin, when the chosen path is one. */
  protected readonly pin = computed(() => this.gitlinks().get(this.path()) ?? null);

  /** The expandable pin the chosen path is, or lies under. */
  private readonly wantedPin = computed(() => gitlinkOf(this.path(), this.gitlinks()));

  /** Each expandable pin's expansion that has been asked for, by path. */
  private readonly expansions = computed(() => {
    const found = new Map<string, SubmoduleChanges>();
    for (const [gitlink, ref] of this.gitlinks()) {
      if (ref.detail) continue;
      const read = this.store.read<SubmoduleChanges>(
        changeKeys.submodule(this.requestId(), this.fold(), gitlink),
      );
      if (read?.value) found.set(gitlink, read.value);
    }
    return found;
  });

  protected readonly expansion = computed(() => {
    const gitlink = this.wantedPin();
    return gitlink
      ? this.store.read<SubmoduleChanges>(
          changeKeys.submodule(this.requestId(), this.fold(), gitlink),
        )
      : undefined;
  });

  protected readonly pinOld = computed(() => this.expansion()?.value?.oldSha ?? this.pin()?.oldSha);
  protected readonly pinNew = computed(() => this.expansion()?.value?.newSha ?? this.pin()?.newSha);

  protected readonly entries = computed<readonly ChangeEntry[]>(() => {
    const rows: ChangeEntry[] = [...this.files()];
    for (const [gitlink, moved] of this.expansions()) {
      for (const file of moved.files ?? []) {
        rows.push({
          path: `${gitlink}/${file.path}`,
          oldPath: file.oldPath ? `${gitlink}/${file.oldPath}` : undefined,
          changeType: file.changeType,
        });
      }
    }
    return rows;
  });

  /** A file inside an expanded pin, as (pin, file); null for the fold's own files. */
  private readonly hoisted = computed(() => hoistedFile(this.path(), this.expansions()));

  protected readonly inChangeSet = computed(() => {
    const path = this.path();
    return this.files().some((file) => file.path === path) || !!this.hoisted();
  });

  /**
   * The chosen image and where each side is read: the fold's file in the request's repository at
   * `base` and `mergedSha`, a file inside a pin in the sibling at the two pins. Null for anything
   * that is not an image, or until the list naming it is read.
   */
  private readonly imageChange = computed(() => {
    const path = this.path();
    if (!isImagePath(path) || this.pin()) return null;
    const inside = this.hoisted();
    if (inside) {
      const moved = this.expansions().get(inside.gitlink);
      const file = moved?.files?.find((entry) => entry.path === inside.file);
      return file ? this.planned(file, moved?.repositoryId, moved?.oldSha, moved?.newSha) : null;
    }
    const set = this.changes()?.value;
    const file = this.files().find((entry) => entry.path === path);
    return file ? this.planned(file, this.repoId(), set?.base, set?.mergedSha) : null;
  });

  /** The chosen image's sides, as `ui-image-diff` draws them; null when no image is chosen. */
  protected readonly image = computed(() => {
    const change = this.imageChange();
    if (!change) return null;
    return {
      changeType: change.changeType,
      before: this.images.side(change.reads.before),
      after: this.images.side(change.reads.after),
    };
  });

  /** The diff to draw: the fold's file, or a file inside a pin. */
  protected readonly diff = computed(() => {
    const path = this.path();
    if (!path || this.pin() || !this.inChangeSet() || isImagePath(path)) return undefined;
    const inside = this.hoisted();
    const key = inside
      ? changeKeys.submoduleDiff(this.requestId(), this.fold(), inside.gitlink, inside.file)
      : changeKeys.releaseDiff(this.requestId(), this.fold(), path);
    return this.store.read<FileDiff>(key);
  });

  protected readonly lede = computed(() => changesLede(this.changes()?.value));

  constructor() {
    // Reads write the store, so they start here and the computeds read them by key.
    effect(() => {
      const repoId = this.repoId();
      const requestId = this.requestId();
      const fold = this.fold();
      const gitlink = this.wantedPin();
      const path = this.path();
      const fileKnown = this.inChangeSet() && !this.pin();
      const inside = this.hoisted();
      const image = this.imageChange();
      untracked(() => {
        if (!repoId || !requestId) return;
        this.store.releaseChanges(repoId, requestId, fold);
        if (gitlink) this.store.submoduleChanges(repoId, requestId, fold, gitlink);
        if (!fileKnown) return;
        // An image is read as bytes, never as a diff.
        if (isImagePath(path)) {
          for (const read of [image?.reads.before, image?.reads.after]) {
            if (read) this.images.image(read.repoId, read.rev, read.path);
          }
          return;
        }
        if (inside)
          this.store.submoduleFileDiff(repoId, requestId, fold, inside.gitlink, inside.file);
        else this.store.releaseFileDiff(repoId, requestId, fold, path);
      });
    });
  }

  private planned(
    file: ImageChange,
    repoId: string | undefined,
    before: string | null | undefined,
    after: string | null | undefined,
  ) {
    return { changeType: file.changeType, reads: imageReads(file, repoId, before, after) };
  }

  protected open(path: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { path },
      queryParamsHandling: 'merge',
    });
  }
}
