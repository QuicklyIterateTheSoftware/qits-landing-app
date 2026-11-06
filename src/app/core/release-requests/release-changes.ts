import type { ChangedFile, ReleaseChanges, SubmoduleChanges } from './changes.consumes';

/**
 * Pure rules of a release request's Changes tab (ported from qits-projects-frontend's
 * `release-request-changes`).
 */

/**
 * One row the Changes list shows: a fold file, or (nested under its pin) a file inside an expanded
 * submodule pin. Structurally compatible with `ui-change-list`'s `ChangeEntry`, which `core/` does
 * not import — see `patterns/release-requests/release-changes/release-changes.ts`, the one place
 * that hands this to the UI component.
 */
export interface ChangeRow {
  readonly path?: string;
  readonly oldPath?: string;
  readonly changeType?: string;
  readonly label?: string;
  readonly oldLabel?: string;
  readonly depth?: number;
}

/** The line above the file list: how many files changed, since which release, how many pins. */
export function changesLede(set: ReleaseChanges | undefined): string {
  if (!set) return '';
  const all = set.files ?? [];
  const files = `${all.length} ${all.length === 1 ? 'file' : 'files'} changed`;
  const moved = all.filter((file) => file.submodule).length;
  const pins =
    moved === 0 ? '' : `, ${moved} of them ${moved === 1 ? 'a submodule pin' : 'submodule pins'}`;
  if (!set.mergedSha) return `${files}${pins} — nothing has been folded yet.`;
  return set.baseTag
    ? `${files} since ${set.baseTag}${pins}.`
    : `${files}${pins} — this repository has not released yet, so the fold is diffed against the empty tree.`;
}

/**
 * The expandable submodule pin `path` is, or lies under; null for none. A pin with a `detail`
 * cannot be expanded (the service said why).
 */
export function gitlinkOf(
  path: string,
  gitlinks: ReadonlyMap<string, { readonly detail?: string }>,
): string | null {
  if (!path) return null;
  for (const [gitlink, ref] of gitlinks) {
    if (ref.detail) continue;
    if (path === gitlink || path.startsWith(`${gitlink}/`)) return gitlink;
  }
  return null;
}

/** A path inside an expanded pin, as the pin and the file within it; null otherwise. */
export function hoistedFile(
  path: string,
  expansions: ReadonlyMap<string, SubmoduleChanges>,
): { readonly gitlink: string; readonly file: string } | null {
  for (const [gitlink, moved] of expansions) {
    const prefix = `${gitlink}/`;
    if (!path.startsWith(prefix)) continue;
    const file = path.slice(prefix.length);
    if ((moved.files ?? []).some((entry) => entry.path === file)) return { gitlink, file };
  }
  return null;
}

/**
 * Every fold file, in the fold's own order; right after a pin's row that has been expanded
 * (`expansions`, keyed by the pin's path), that expansion's files, indented one level and shown
 * relative to the submodule (a rename as `old → new`, both relative). Each nested row's own `path`
 * stays the full `<gitlink>/<file>`, so selecting it reads and links the same way as the fold's own
 * files. A pin without an expansion, or any other file, keeps its row as is.
 */
export function changeRows(
  files: readonly ChangedFile[],
  expansions: ReadonlyMap<string, SubmoduleChanges>,
): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const file of files) {
    rows.push(file);
    const moved = file.submodule ? expansions.get(file.path ?? '') : undefined;
    if (!moved) continue;
    const gitlink = file.path ?? '';
    for (const inner of moved.files ?? []) {
      rows.push({
        path: `${gitlink}/${inner.path}`,
        oldPath: inner.oldPath ? `${gitlink}/${inner.oldPath}` : undefined,
        label: inner.path,
        oldLabel: inner.oldPath ?? undefined,
        changeType: inner.changeType,
        depth: 1,
      });
    }
  }
  return rows;
}
