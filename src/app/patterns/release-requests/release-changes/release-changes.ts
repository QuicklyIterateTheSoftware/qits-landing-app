import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsResource,
  sourceMark,
  type QitsResourceRef,
} from '@qits/angular';
import { QitsCommitMessage } from '@qits/ui-components';
import { map } from 'rxjs';
import type {
  ChangedFile,
  FileDiff,
  ReleaseChanges,
  SubmoduleChanges,
} from '$core/release-requests/changes.consumes';
import {
  RELEASE_CHANGES,
  RELEASE_FILE_DIFF,
  SUBMODULE_CHANGES,
  SUBMODULE_FILE_DIFF,
} from '$core/release-requests/changes.operations';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import {
  formatInstant,
  formatRelativeTime,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import {
  changeRows,
  changesLede,
  gitlinkOf,
  hoistedFile,
} from '$core/release-requests/release-changes';
import { imageReads, isImagePath, type ImageChange } from '$core/githost/raw-image';
import { RawImages } from '$core/githost/raw-images';
import { loadState } from '$core/resources/load-state';
import { ResourceFamily } from '$core/resources/resource-family';
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
 * them, and once its files are read they are nested directly under the pin's row, indented and
 * shown relative to the submodule, while each nested row still selects and links by the full
 * `<gitlink>/<file>` path; choosing one of those shows its diff inside the sibling. A file no
 * longer in the fold (the fold moved) says so.
 *
 * Every read is the component's own and per fold (qits-2146): the fold's files through a
 * `qitsResource` over `RELEASE_CHANGES`, read again only for a new fold; each pin asked for through
 * one `SUBMODULE_CHANGES` read per pin and fold (a `ResourceFamily`, kept while the tab is open, so
 * an expanded pin stays nested); the chosen file's patch through `RELEASE_FILE_DIFF`, or
 * `SUBMODULE_FILE_DIFF` inside a pin. No event reads one again: each is a fact about a fold.
 *
 * An image (`isImagePath`, qits-734) shows as images instead of its diff, which would only say the
 * binary differs: the fold's own image read in the request's repository at the base release
 * (`base`) and at the fold (`mergedSha`), one inside a pin in the sibling (`repositoryId`) at the
 * two pins, through `RawImages`. Its text diff is not asked for.
 *
 * A pin's commit messages name work items (`feat(qits-1897): …`): each id of the project `slug`
 * names is a work reference with the item's brief (`<qits-commit-message>`, qits-1897).
 *
 * Marks (qits-2141): the tab is the fold's changes (`qitsEntityList`), the list and the lede
 * derived from its files; a pin's commits name their read (`data-qits-source`, a read kept by
 * key); the patch is the chosen file (`qitsEntity` by `path`) of its own read.
 */
@Component({
  selector: 'app-release-changes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChangeList,
    DiffViewer,
    ImageDiff,
    QitsCommitMessage,
    QitsEntity,
    QitsEntityList,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    @let set = answer();
    <ui-spinner
      [state]="changesState()"
      class="min-h-24"
      [qitsEntityList]="changes"
      [qitsEntity]="set"
      entityKey="mergedSha"
    >
      <p class="m-0 mb-2 text-sm text-fg-soft" [fieldOf]="set" [qitsField]="{ derived: ['files'] }">
        {{ lede() }}
      </p>
      <div class="grid gap-3 md:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)]">
        <aside class="min-w-0">
          <p
            class="m-0 mb-1 text-sm text-fg-soft"
            [class]="set.detail ? 'block' : 'hidden'"
            [fieldOf]="set"
            qitsField="detail"
          >
            {{ set.detail }}
          </p>
          <p
            class="m-0 text-sm text-fg-muted"
            [class]="read() && !set.files?.length && !set.detail ? 'block' : 'hidden'"
          >
            This fold changes no files.
          </p>
          <ui-change-list
            label="Files this release changes"
            [entries]="entries()"
            [selected]="path()"
            (select)="open($event)"
            [fieldOf]="set"
            [qitsField]="{ derived: ['files'] }"
          />
        </aside>

        <section class="min-w-0">
          @if (path() && pin(); as ref) {
            <h3 class="m-0 mb-1 font-mono text-sm font-semibold break-all">{{ path() }}</h3>
            <p
              class="m-0 mb-2 font-mono text-sm"
              [fieldOf]="set"
              [qitsField]="{ derived: ['files'] }"
            >
              <span [title]="pinOld() ?? ''">{{ short(pinOld()) }}</span>
              <span class="text-fg-faint" aria-hidden="true"> → </span>
              <span [title]="pinNew() ?? ''">{{ short(pinNew()) }}</span>
            </p>
            @if (ref.detail) {
              <p
                class="m-0 text-sm text-fg-soft"
                [fieldOf]="set"
                [qitsField]="{ derived: ['files'] }"
              >
                {{ ref.detail }}
              </p>
            } @else {
              <ui-spinner
                [state]="expansionState()"
                class="min-h-12"
                [attr.data-qits-source]="pinSource"
              >
                @if (expansion(); as moved) {
                  <p
                    class="m-0 mb-1 text-sm text-fg-soft"
                    [class]="moved.detail ? 'block' : 'hidden'"
                    [qitsEntity]="moved"
                    entityKey="newSha"
                    [fieldOf]="moved"
                    [qitsField]="{ derived: ['detail'] }"
                  >
                    {{ moved.detail }}
                  </p>
                  <p
                    class="m-0 text-sm text-fg-muted"
                    [class]="!moved.commits?.length && !moved.detail ? 'block' : 'hidden'"
                  >
                    This pin move brings in no commits.
                  </p>
                  <ul class="m-0 flex list-none flex-col gap-1 p-0">
                    @for (commit of moved.commits ?? []; track commit.hash) {
                      <li
                        class="flex flex-wrap items-baseline gap-2 text-sm"
                        [qitsEntity]="commit"
                        entityKey="hash"
                      >
                        <span
                          class="font-mono text-fg-soft"
                          [title]="commit.hash ?? ''"
                          [fieldOf]="commit"
                          qitsField="shortHash"
                          >{{ commit.shortHash }}</span
                        >
                        <span
                          class="min-w-48 flex-1 break-words"
                          [fieldOf]="commit"
                          [qitsField]="{ derived: ['message'] }"
                          ><qits-commit-message [message]="commit.message ?? ''" [project]="slug()"
                        /></span>
                        <span class="text-xs text-fg-muted" [fieldOf]="commit" qitsField="author">{{
                          commit.author
                        }}</span>
                        <span
                          class="text-xs text-fg-muted"
                          [title]="instant(commit.date)"
                          [fieldOf]="commit"
                          [qitsField]="{ derived: ['date'] }"
                          >{{ ago(commit.date) }}</span
                        >
                      </li>
                    }
                  </ul>
                }
              </ui-spinner>
            }
          } @else if (path() && !inChangeSet()) {
            <p class="m-0 p-3 text-sm text-fg-muted">{{ path() }} is not changed by this fold.</p>
          } @else if (image(); as shown) {
            <h3 class="m-0 mb-2 font-mono text-sm font-semibold break-all">{{ path() }}</h3>
            <ui-image-diff
              [changeType]="shown.changeType"
              [before]="shown.before"
              [after]="shown.after"
              [fieldOf]="set"
              [qitsField]="imageMark"
            />
          } @else {
            <ui-spinner [state]="diffState()" class="min-h-12">
              @let patch = diffAnswer();
              <ui-diff-viewer
                [patch]="patch.diff ?? ''"
                [path]="diffRead() ? path() : ''"
                [qitsEntity]="patch"
                entityKey="path"
                [entitySource]="diffRead()"
                [fieldOf]="patch"
                [qitsField]="{ derived: ['diff', 'path'] }"
              />
            </ui-spinner>
          }
        </section>
      </div>
    </ui-spinner>
  `,
})
export class ReleaseChangesView {
  private readonly images = inject(RawImages);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  readonly request = input.required<ReleaseRequest>();

  /** The project's slug: the work ids the pin's commit messages name are its (qits-1897). */
  readonly slug = input<string>('');

  protected readonly short = shortShaOrNone;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | undefined) => formatRelativeTime(iso);

  /**
   * An image's sides are derived from the fold's file and the commits around it (the base release
   * and the fold), read in the request's repository.
   */
  protected readonly imageMark = { derived: ['files', 'base', 'mergedSha'] } as const;

  /** The read a pin's commits come from, as their data mark names it. */
  protected readonly pinSource = sourceMark(SUBMODULE_CHANGES);

  /** The chosen file, from `?path=`; `''` for none. */
  protected readonly path = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('path') ?? '')),
    { initialValue: '' },
  );

  private readonly repoId = computed(() => this.request().repoId ?? '');
  private readonly requestId = computed(() => this.request().id ?? '');
  private readonly fold = computed(() => this.request().mergedSha ?? '');

  /** The fold's files, read once per fold. */
  protected readonly changes = qitsResource(RELEASE_CHANGES, () => {
    const repoId = this.repoId();
    const requestId = this.requestId();
    this.fold();
    return repoId && requestId ? { path: { repoId, requestId } } : undefined;
  });

  /** The fold's files have been read. */
  protected readonly read = computed(() => this.changes.hasValue());

  /** The fold's changes, once read; none before. */
  protected readonly answer = computed(
    (): ReleaseChanges => (this.changes.hasValue() ? this.changes.value() : undefined) ?? {},
  );

  protected readonly changesState = computed(() => loadState(this.changes));

  private readonly files = computed<readonly ChangedFile[]>(() => this.answer().files ?? []);

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

  /** Each pin asked for, by `<fold>#<gitlink>`: its two pins and the sibling's commits. */
  private readonly pins = new ResourceFamily(SUBMODULE_CHANGES, this.injector);

  /** The read of `gitlink`'s pin move in the current fold, once asked for. */
  private pinRead(gitlink: string): QitsResourceRef<SubmoduleChanges> | undefined {
    return this.pins.get(`${this.fold()}#${gitlink}`);
  }

  /** Each expandable pin's expansion that has been read, by path. */
  private readonly expansions = computed(() => {
    const found = new Map<string, SubmoduleChanges>();
    for (const [gitlink, ref] of this.gitlinks()) {
      if (ref.detail) continue;
      const read = this.pinRead(gitlink);
      const value = read?.hasValue() ? read.value() : undefined;
      if (value) found.set(gitlink, value);
    }
    return found;
  });

  /** The wanted pin's expansion, once read. */
  protected readonly expansion = computed(() => {
    const gitlink = this.wantedPin();
    const read = gitlink ? this.pinRead(gitlink) : undefined;
    return read?.hasValue() ? read.value() : undefined;
  });

  /** How the wanted pin's read stands, as its spinner shows it. */
  protected readonly expansionState = computed(() => this.pinState());

  private pinState() {
    const gitlink = this.wantedPin();
    const read = gitlink ? this.pinRead(gitlink) : undefined;
    return read ? loadState(read) : 'loading';
  }

  protected readonly pinOld = computed(() => this.expansion()?.oldSha ?? this.pin()?.oldSha);
  protected readonly pinNew = computed(() => this.expansion()?.newSha ?? this.pin()?.newSha);

  protected readonly entries = computed<readonly ChangeEntry[]>(() =>
    changeRows(this.files(), this.expansions()),
  );

  /** A file inside an expanded pin, as (pin, file); null for the fold's own files. */
  private readonly hoisted = computed(() => hoistedFile(this.path(), this.expansions()));

  protected readonly inChangeSet = computed(() => {
    const path = this.path();
    return this.files().some((file) => file.path === path) || !!this.hoisted();
  });

  /** The chosen path is a file to draw as a patch: known to the fold, no pin, no image. */
  private readonly patchable = computed(() => {
    const path = this.path();
    return !!path && !this.pin() && this.inChangeSet() && !isImagePath(path);
  });

  /** The chosen file's patch in the fold, when it is one of the fold's own files. */
  private readonly releaseDiff = qitsResource(RELEASE_FILE_DIFF, () => {
    const repoId = this.repoId();
    const requestId = this.requestId();
    const path = this.path();
    this.fold();
    return this.patchable() && !this.hoisted() && repoId && requestId
      ? { path: { repoId, requestId }, query: { path } }
      : undefined;
  });

  /** The chosen file's patch inside a pin, when it lies under one. */
  private readonly submoduleDiff = qitsResource(SUBMODULE_FILE_DIFF, () => {
    const repoId = this.repoId();
    const requestId = this.requestId();
    const inside = this.hoisted();
    this.fold();
    return this.patchable() && inside && repoId && requestId
      ? { path: { repoId, requestId }, query: { path: inside.gitlink, file: inside.file } }
      : undefined;
  });

  /** The patch's read, while one is drawn: the fold's file, or a file inside a pin. */
  protected readonly diffRead = computed(() => {
    if (!this.patchable()) return undefined;
    return this.hoisted() ? this.submoduleDiff : this.releaseDiff;
  });

  /** The chosen file's patch, once read; none before. */
  protected readonly diffAnswer = computed((): FileDiff => {
    const read = this.diffRead();
    return (read?.hasValue() ? read.value() : undefined) ?? {};
  });

  /** The patch's spinner: nothing to wait for while no patch is asked for. */
  protected readonly diffState = computed(() => {
    const read = [this.releaseDiff, this.submoduleDiff].find((diff) => diff.status() !== 'idle');
    return read ? loadState(read) : 'loaded';
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
    const set = this.answer();
    const file = this.files().find((entry) => entry.path === path);
    return file ? this.planned(file, this.repoId(), set.base, set.mergedSha) : null;
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

  protected readonly lede = computed(() =>
    this.changes.hasValue() ? changesLede(this.answer()) : '',
  );

  constructor() {
    // A pin's read and an image's bytes are kept by key, so they start here, outside a reactive
    // context; the computeds read them by key.
    effect(() => {
      const repoId = this.repoId();
      const requestId = this.requestId();
      const fold = this.fold();
      const gitlink = this.wantedPin();
      const image = this.patchableImage();
      untracked(() => {
        if (!repoId || !requestId) return;
        if (gitlink) {
          this.pins.read(`${fold}#${gitlink}`, {
            path: { repoId, requestId },
            query: { path: gitlink },
          });
        }
        // An image is read as bytes, never as a diff.
        for (const read of [image?.reads.before, image?.reads.after]) {
          if (read) this.images.image(read.repoId, read.rev, read.path);
        }
      });
    });
  }

  /** The chosen image to read, once the file is known to the fold and is no pin. */
  private readonly patchableImage = computed(() =>
    this.inChangeSet() && !this.pin() ? this.imageChange() : null,
  );

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
