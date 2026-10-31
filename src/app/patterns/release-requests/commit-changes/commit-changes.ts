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
import type { CommitChanges, FileDiff } from '$core/release-requests/changes.consumes';
import { changeKeys, ChangesStore } from '$core/release-requests/changes.store';
import { imageReads, isImagePath } from '$core/githost/raw-image';
import { RawImagesStore } from '$core/githost/raw-images.store';
import { ChangeList } from '$ui/components/change-list/change-list';
import { DiffViewer } from '$ui/components/diff-viewer/diff-viewer';
import { ImageDiff } from '$ui/components/image-diff/image-diff';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * One commit's changeset (a commit under "What this release folds in", opened): the files it
 * changes against its first parent, and the patch of the file chosen, beside the list on a wide
 * screen and below it on a narrow one. The first file is chosen at first. Read through
 * `ChangesStore`, once per commit and file.
 *
 * An image (`isImagePath`, qits-734) shows as images instead of its diff: read through
 * `RawImagesStore` at the first parent and at the commit. Its text diff is not asked for. The
 * first parent comes from the page (`parent`, from the fold's commit list): qits-projects answers
 * `parent` null whenever none is asked for, so its own field names no commit to read the before
 * side at.
 */
@Component({
  selector: 'app-commit-changes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChangeList, DiffViewer, ImageDiff, Spinner],
  host: { class: 'block' },
  template: `
    <ui-spinner [state]="changes()?.status ?? 'loading'" class="min-h-12">
      @let files = changes()?.value?.files ?? [];
      <p
        class="m-0 py-1 text-sm text-charcoal-brown-500"
        [class]="changes()?.status === 'loaded' && files.length === 0 ? 'block' : 'hidden'"
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
        />
        @if (image(); as shown) {
          <ui-image-diff
            [changeType]="shown.changeType"
            [before]="shown.before"
            [after]="shown.after"
          />
        } @else {
          <ui-spinner [state]="diff()?.status ?? 'loaded'" class="min-h-12">
            <ui-diff-viewer [patch]="diff()?.value?.diff ?? ''" [path]="diff() ? selected() : ''" />
          </ui-spinner>
        }
      </div>
    </ui-spinner>
  `,
})
export class CommitChangesView {
  private readonly store = inject(ChangesStore);
  private readonly images = inject(RawImagesStore);

  readonly repoId = input.required<string>();
  readonly sha = input.required<string>();
  /** The commit's first parent, as the fold's commit list names it; none for a root commit. */
  readonly parent = input<string | null | undefined>(undefined);

  /** The file the reader chose; the first file until then. */
  protected readonly chosen = signal<string | null>(null);

  protected readonly changes = computed(() =>
    this.store.read<CommitChanges>(changeKeys.commit(this.repoId(), this.sha())),
  );

  protected readonly selected = computed(
    () => this.chosen() ?? this.changes()?.value?.files?.[0]?.path ?? '',
  );

  /** Where each side of the chosen image is read; null when the chosen file is no image. */
  private readonly imageChange = computed(() => {
    const path = this.selected();
    if (!isImagePath(path)) return null;
    const changes = this.changes()?.value;
    const file = changes?.files?.find((entry) => entry.path === path);
    if (!file) return null;
    const reads = imageReads(
      file,
      this.repoId(),
      changes?.parent ?? this.parent(),
      changes?.commit ?? this.sha(),
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

  protected readonly diff = computed(() => {
    const path = this.selected();
    if (!path || isImagePath(path)) return undefined;
    return this.store.read<FileDiff>(changeKeys.commitDiff(this.repoId(), this.sha(), path));
  });

  constructor() {
    effect(() => {
      const repoId = this.repoId();
      const sha = this.sha();
      const path = this.selected();
      const image = this.imageChange();
      untracked(() => {
        this.store.commitChanges(repoId, sha);
        // An image is read as bytes, never as a diff.
        if (isImagePath(path)) {
          for (const read of [image?.reads.before, image?.reads.after]) {
            if (read) this.images.image(read.repoId, read.rev, read.path);
          }
        } else if (path) this.store.commitFileDiff(repoId, sha, path);
      });
    });
  }
}
