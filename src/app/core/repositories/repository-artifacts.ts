import type { ArtifactEntry } from '$core/maintenance/maintenance.consumes';

/**
 * The artifacts one repository publishes, as its page lists them (qits-2478): qits-maintenance's
 * released artifacts (`listArtifacts`, one row per ecosystem and name) kept by their `repository`,
 * each with the artifact store's page that shows it.
 */

/** The kinds of artifact the page names, in the order it lists them. */
export type ArtifactKind = 'image' | 'npm' | 'maven' | 'daemon';

/** Where an artifact's detail page is: its kind, the store repository and the name in it. */
export interface ArtifactPlace {
  readonly kind: ArtifactKind;
  /** The artifact store's repository (`qits`, `npm`, `maven`, `daemons`). */
  readonly store: string;
  /** The artifact's name in that repository (an image's without its namespace). */
  readonly name: string;
}

/** A published artifact, keyed by its ecosystem and name, with its detail page (if any). */
export interface RepositoryArtifact extends ArtifactEntry {
  /** `<ecosystem>:<name>`: a name alone may be in two ecosystems. */
  readonly key: string;
  readonly place: ArtifactPlace | undefined;
}

/** The kinds' order and their words. */
const KINDS: Readonly<Record<ArtifactKind, { readonly rank: number; readonly label: string }>> = {
  image: { rank: 0, label: 'Image' },
  npm: { rank: 1, label: 'npm package' },
  maven: { rank: 2, label: 'Maven package' },
  daemon: { rank: 3, label: 'Daemon' },
};

/** A kind as a word: `Image`, `npm package`, …; an ecosystem the page does not know as it is. */
export function kindLabel(artifact: RepositoryArtifact): string {
  return artifact.place ? KINDS[artifact.place.kind].label : (artifact.ecosystem ?? '');
}

/**
 * The store page of an artifact: a docker image `qits/qits-ci` is `qits-ci` in the `qits` image
 * store, an npm package in `npm`, a maven coordinate in `maven`, a daemon in `daemons`. Undefined
 * for an ecosystem the store has no page for, or an image name without a namespace.
 */
export function placeOf(artifact: ArtifactEntry): ArtifactPlace | undefined {
  const name = artifact.name ?? '';
  if (!name) return undefined;
  switch (artifact.ecosystem) {
    case 'docker': {
      const slash = name.indexOf('/');
      if (slash <= 0 || slash === name.length - 1) return undefined;
      return { kind: 'image', store: name.slice(0, slash), name: name.slice(slash + 1) };
    }
    case 'npm':
      return { kind: 'npm', store: 'npm', name };
    case 'maven':
      return { kind: 'maven', store: 'maven', name };
    case 'daemon':
      return { kind: 'daemon', store: 'daemons', name };
    default:
      return undefined;
  }
}

/** The artifacts `repository` publishes, by kind (images first), then by name. */
export function repositoryArtifacts(
  artifacts: readonly ArtifactEntry[],
  repository: string,
): readonly RepositoryArtifact[] {
  const rank = (artifact: RepositoryArtifact) =>
    artifact.place ? KINDS[artifact.place.kind].rank : Object.keys(KINDS).length;
  return artifacts
    .filter((artifact) => !!repository && artifact.repository === repository)
    .map((artifact) => ({
      ...artifact,
      key: `${artifact.ecosystem ?? ''}:${artifact.name ?? ''}`,
      place: placeOf(artifact),
    }))
    .sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? ''));
}
