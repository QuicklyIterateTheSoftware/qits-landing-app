/**
 * A docs site's versions as the reader picks among them (qits-2337), ported from
 * qits-docs-frontend's `reader.ts` (`versionLabel`, `versionsOnBranch`, `defaultVersion`) and
 * `doc-kind.ts` (`branchOf`, `distinctBranches`). A version is what `listDocsVersions` answers,
 * newest first; its branch is the `git.branch.name` a release wrote into its metadata.
 */

/** A version as far as the picking goes: its name and the metadata a release wrote. */
export interface PickableVersion {
  readonly version?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** The metadata key a release writes its branch under. */
export const BRANCH_NAME = 'git.branch.name';

/** A version's display label: a commit sha is shortened, anything else (calver) reads as itself. */
export function versionLabel(version: string): string {
  return /^[0-9a-f]{40}$/.test(version) ? version.slice(0, 12) : version;
}

/** The branch a version was published from, or undefined when its metadata names none. */
export function branchOf(version: PickableVersion): string | undefined {
  const branch = version.metadata?.[BRANCH_NAME];
  return typeof branch === 'string' && branch ? branch : undefined;
}

/** The distinct branches of a version list, in list (newest-first) order, unbranched skipped. */
export function distinctBranches(versions: readonly PickableVersion[]): string[] {
  const seen: string[] = [];
  for (const version of versions) {
    const branch = branchOf(version);
    if (branch && !seen.includes(branch)) seen.push(branch);
  }
  return seen;
}

/**
 * The versions a branch pick narrows to, newest first. An unbranched version shows under every
 * branch: it predates the metadata, and hiding it would leave it unreachable. No branch keeps all.
 */
export function versionsOnBranch<T extends PickableVersion>(
  versions: readonly T[],
  branch: string | undefined,
): T[] {
  if (!branch) return [...versions];
  return versions.filter((version) => (branchOf(version) ?? branch) === branch);
}

/**
 * The version an address without one reads: the newest of `main` when any version carries that
 * branch, else the newest overall; undefined for an empty list.
 */
export function defaultVersion(versions: readonly PickableVersion[]): string | undefined {
  return versions.find((version) => branchOf(version) === 'main')?.version ?? versions[0]?.version;
}
