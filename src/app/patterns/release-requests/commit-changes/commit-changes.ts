import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import type { CommitChanges, FileDiff } from '$core/release-requests/changes.consumes';
import { COMMIT_CHANGES, COMMIT_FILE_DIFF } from '$core/release-requests/changes.operations';
import { imageReads, isImagePath } from '$core/githost/raw-image';
import { RawImages } from '$core/githost/raw-images';
import { loadState } from '$core/resources/load-state';
import { ChangeList } from '$ui/components/change-list/change-list';
import { DiffViewer } from '$ui/components/diff-viewer/diff-viewer';
import { ImageDiff } from '$ui/components/image-diff/image-diff';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * One commit's changeset (a commit under "What this release folds in", opened): the files it
 * changes against its first parent, and the patch of the file chosen, beside the list on a wide
 * screen and below it on a narrow one. The first file is chosen at first. Read through the
 * component's own `qitsResource`s (qits-2146): the commit's files (`COMMIT_CHANGES`) once, and the
 * chosen file's patch (`COMMIT_FILE_DIFF`) as it is chosen.
 *
 * An image (`isImagePath`, qits-734) shows as images instead of its diff: read through `RawImages`
 * at the first parent and at the commit. Its text diff is not asked for. The first parent comes
 * from the page (`parent`, from the fold's commit list): qits-projects answers `parent` null
 * whenever none is asked for, so its own field names no commit to read the before side at.
 *
 * Marks (qits-2141): the list is the commit's files (derived from its read's `files`), the patch
 * is the chosen file (`qitsEntity` by `path`, its own read), an image's sides derived from the
 * files and the commits around it.
 */
@Component({
  selector: 'app-commit-changes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChangeList, DiffViewer, ImageDiff, QitsEntity, QitsEntityList, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <ui-spinner [state]="changesState()" class="min-h-12" [qitsEntityList]="changes">
      @let files = answer().files ?? [];
      <p
        class="m-0 py-1 text-sm text-fg-muted"
        [class]="changesState() === 'loaded' && files.length === 0 ? 'block' : 'hidden'"
      >
        This commit changes no files against its first parent (a merge shows none).
      </p>
      <div
        class="grid gap-3 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]"
        [class.hidden]="files.length === 0"
      >
        <ui-change-list
          [entries]="files"
          [selected]="selected()"
          [label]="'Files changed by ' + sha()"
          (select)="chosen.set($event)"
          [fieldOf]="answer()"
          [qitsField]="{ derived: ['files'] }"
        />
        @if (image(); as shown) {
          <ui-image-diff
            [changeType]="shown.changeType"
            [before]="shown.before"
            [after]="shown.after"
            [fieldOf]="answer()"
            [qitsField]="{ derived: ['files', 'parent', 'commit'] }"
          />
        } @else {
          <ui-spinner [state]="diffState()" class="min-h-12">
            @let patch = diffAnswer();
            <ui-diff-viewer
              [patch]="patch.diff ?? ''"
              [path]="selected()"
              [qitsEntity]="patch"
              entityKey="path"
              [entitySource]="diff"
              [fieldOf]="patch"
              [qitsField]="{ derived: ['diff', 'path'] }"
            />
          </ui-spinner>
        }
      </div>
    </ui-spinner>
  `,
})
export class CommitChangesView {
  private readonly images = inject(RawImages);

  readonly repoId = input.required<string>();
  readonly sha = input.required<string>();
  /** The commit's first parent, as the fold's commit list names it; none for a root commit. */
  readonly parent = input<string | null | undefined>(undefined);

  /** The file the reader chose; the first file until then. */
  protected readonly chosen = signal<string | null>(null);

  /** The files the commit changes against its first parent. */
  protected readonly changes = qitsResource(COMMIT_CHANGES, () => {
    const repoId = this.repoId();
    const commitHash = this.sha();
    return repoId && commitHash ? { path: { repoId, commitHash } } : undefined;
  });

  /** The commit's files, once read; none before. */
  protected readonly answer = computed(
    (): CommitChanges => (this.changes.hasValue() ? this.changes.value() : undefined) ?? {},
  );

  protected readonly changesState = computed(() => loadState(this.changes));

  protected readonly selected = computed(
    () => this.chosen() ?? this.answer().files?.[0]?.path ?? '',
  );

  /** The chosen file's patch, unless it is an image (read as bytes instead). */
  protected readonly diff = qitsResource(COMMIT_FILE_DIFF, () => {
    const repoId = this.repoId();
    const commitHash = this.sha();
    const path = this.selected();
    return repoId && commitHash && path && !isImagePath(path)
      ? { path: { repoId, commitHash }, query: { path } }
      : undefined;
  });

  /** The chosen file's patch, once read; none before (and none drawn while none is chosen). */
  protected readonly diffAnswer = computed(
    (): FileDiff => (this.diff.hasValue() ? this.diff.value() : undefined) ?? {},
  );

  /** The patch's spinner: nothing to wait for while no patch is asked for. */
  protected readonly diffState = computed(() =>
    this.diff.status() === 'idle' ? 'loaded' : loadState(this.diff),
  );

  /** Where each side of the chosen image is read; null when the chosen file is no image. */
  private readonly imageChange = computed(() => {
    const path = this.selected();
    if (!isImagePath(path)) return null;
    const changes = this.answer();
    const file = changes.files?.find((entry) => entry.path === path);
    if (!file) return null;
    const reads = imageReads(
      file,
      this.repoId(),
      changes.parent ?? this.parent(),
      changes.commit ?? this.sha(),
    );
    return { changeType: file.changeType, reads };
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

  constructor() {
    // An image is read as bytes (`RawImages`), never as a diff.
    effect(() => {
      const image = this.imageChange();
      untracked(() => {
        for (const read of [image?.reads.before, image?.reads.after]) {
          if (read) this.images.image(read.repoId, read.rev, read.path);
        }
      });
    });
  }
}
