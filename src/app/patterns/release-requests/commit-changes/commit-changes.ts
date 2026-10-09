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
import { ChangeList } from '$ui/components/change-list/change-list';
import { DiffViewer } from '$ui/components/diff-viewer/diff-viewer';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * One commit's changeset (a commit under "What this release folds in", opened): the files it
 * changes against its first parent, and the patch of the file chosen, beside the list on a wide
 * screen and below it on a narrow one. The first file is chosen at first. Read through
 * `ChangesStore`, once per commit and file.
 */
@Component({
  selector: 'app-commit-changes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChangeList, DiffViewer, Spinner],
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
        <ui-spinner [state]="diff()?.status ?? 'loaded'" class="min-h-12">
          <ui-diff-viewer [patch]="diff()?.value?.diff ?? ''" [path]="diff() ? selected() : ''" />
        </ui-spinner>
      </div>
    </ui-spinner>
  `,
})
export class CommitChangesView {
  private readonly store = inject(ChangesStore);

  readonly repoId = input.required<string>();
  readonly sha = input.required<string>();

  /** The file the reader chose; the first file until then. */
  protected readonly chosen = signal<string | null>(null);

  protected readonly changes = computed(() =>
    this.store.read<CommitChanges>(changeKeys.commit(this.repoId(), this.sha())),
  );

  protected readonly selected = computed(
    () => this.chosen() ?? this.changes()?.value?.files?.[0]?.path ?? '',
  );

  protected readonly diff = computed(() => {
    const path = this.selected();
    if (!path) return undefined;
    return this.store.read<FileDiff>(changeKeys.commitDiff(this.repoId(), this.sha(), path));
  });

  constructor() {
    effect(() => {
      const repoId = this.repoId();
      const sha = this.sha();
      const path = this.selected();
      untracked(() => {
        this.store.commitChanges(repoId, sha);
        if (path) this.store.commitFileDiff(repoId, sha, path);
      });
    });
  }
}
