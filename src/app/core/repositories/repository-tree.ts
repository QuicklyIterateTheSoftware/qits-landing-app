import type { RepositoryEntry, WrapperView } from './repositories.consumes';

/** A repository at its place in the tree. */
export interface RepositoryNode {
  readonly kind: 'repository';
  readonly entry: RepositoryEntry;
}

/** A directory of the wrapper, e.g. `components` or `components/contract`. */
export interface FolderNode {
  readonly kind: 'folder';
  /** The directory's own name, its last path segment. */
  readonly name: string;
  /** The whole path from the wrapper's root, e.g. `components/contract`. */
  readonly path: string;
  readonly children: readonly TreeNode[];
}

export type TreeNode = FolderNode | RepositoryNode;

/** A project's repositories laid out the way its wrapper checks them out. */
export interface RepositoryTree {
  /** The wrapper itself (the PROJECT repository), shown at the top. */
  readonly wrapper?: RepositoryEntry;
  /** The wrapper's directories and the repositories mounted in them, by path. */
  readonly nodes: readonly TreeNode[];
  /** Repositories of the project the wrapper does not mount (undeclared). */
  readonly other: readonly RepositoryEntry[];
}

interface MutableFolder {
  name: string;
  path: string;
  folders: Map<string, MutableFolder>;
  repositories: RepositoryEntry[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const repositoryName = (entry: RepositoryEntry) => entry.repository?.name ?? '';

function freeze(folder: MutableFolder): TreeNode[] {
  const folders = [...folder.folders.values()].sort(byName).map((child): FolderNode => ({
    kind: 'folder',
    name: child.name,
    path: child.path,
    children: freeze(child),
  }));
  const repositories = [...folder.repositories]
    .sort((a, b) => repositoryName(a).localeCompare(repositoryName(b)))
    .map((entry): RepositoryNode => ({ kind: 'repository', entry }));
  return [...folders, ...repositories];
}

/**
 * Places each repository where the wrapper mounts it: a wrapper entry's path
 * (`components/<component>/<name>`) names the directories above it, so the result reads like the
 * wrapper's checkout. Directories come first, then repositories, each sorted by name.
 *
 * The wrapper repository itself goes on top; a repository the wrapper does not mount goes into
 * `other`. Entries are matched to wrapper entries by repository id.
 */
export function repositoryTree(
  entries: readonly RepositoryEntry[],
  wrapper: WrapperView | undefined,
): RepositoryTree {
  const byId = new Map<string, RepositoryEntry>();
  for (const entry of entries) {
    const id = entry.repository?.id;
    if (id) byId.set(id, entry);
  }
  const root: MutableFolder = { name: '', path: '', folders: new Map(), repositories: [] };
  const placed = new Set<string>();
  for (const mount of wrapper?.entries ?? []) {
    const id = mount.repositoryId;
    const entry = id ? byId.get(id) : undefined;
    if (!id || !entry || !mount.path) continue;
    const segments = mount.path.split('/').filter((segment) => segment.length > 0);
    let folder = root;
    for (const segment of segments.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${segment}` : segment;
      let next = folder.folders.get(segment);
      if (!next) {
        next = { name: segment, path, folders: new Map(), repositories: [] };
        folder.folders.set(segment, next);
      }
      folder = next;
    }
    folder.repositories.push(entry);
    placed.add(id);
  }
  const wrapperId = wrapper?.repositoryId;
  const other = entries
    .filter((entry) => {
      const id = entry.repository?.id;
      return !id || (id !== wrapperId && !placed.has(id));
    })
    .sort((a, b) => repositoryName(a).localeCompare(repositoryName(b)));
  return {
    wrapper: wrapperId ? byId.get(wrapperId) : undefined,
    nodes: freeze(root),
    other,
  };
}
