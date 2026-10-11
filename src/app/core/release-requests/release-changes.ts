import type { ReleaseChanges, SubmoduleChanges } from './changes.consumes';

/**
 * Pure rules of a release request's Changes tab (ported from qits-projects-frontend's
 * `release-request-changes`).
 */

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
