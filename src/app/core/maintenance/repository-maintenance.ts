import type { QitsDomainEvent } from '@qits/angular';
import { payloadField } from '$core/events/refresh-on';
import type { RepositoryReleaseRequest } from '$core/release-requests/repository-release-requests.consumes';
import { currencyOf, type Currency } from './currency';
import type { Adopter, PublishedArtifact, RepositoryDependents } from './maintenance.consumes';

/**
 * The pure helpers of a repository's maintenance pages (qits-2489, moved from qits-2334's
 * repository page): its Depends on page's staleness and status chip, its Dependents page's
 * per-artifact groups, its releases and the newest one's adoption line.
 */

/** One dependent of a published artifact, as the Dependents page reads it. */
export type ArtifactDependent = NonNullable<PublishedArtifact['dependents']>[number];

/** A dependent of a published artifact with its currency, keyed by the artifact it is. */
export interface DependentRow extends ArtifactDependent {
  /** `<ecosystem>:<name>:<version>` of the embedding artifact, the entity's key. */
  readonly key: string;
  readonly currency: Currency;
}

/** A published artifact with its dependents as rows, keyed by its ecosystem and name. */
export interface ArtifactGroup extends PublishedArtifact {
  /** `<ecosystem>:<name>`, the entity's key. */
  readonly key: string;
  readonly rows: readonly DependentRow[];
}

/** A repository status's chip tone: OK is ok, any other word (ABSENT, UNDECLARED, …) neutral. */
export function repositoryStatusTone(status: string | null | undefined): 'ok' | 'neutral' {
  return status === 'OK' ? 'ok' : 'neutral';
}

/**
 * Each published artifact with its dependents, as current, behind or unknown against that
 * artifact's latest (`currencyOf`), the behind ones first, then by repository and artifact.
 */
export function artifactGroups(answer: RepositoryDependents): readonly ArtifactGroup[] {
  const rank: Readonly<Record<Currency, number>> = { behind: 0, unknown: 1, current: 1 };
  return (answer.artifacts ?? []).map((artifact): ArtifactGroup => {
    const rows = (artifact.dependents ?? [])
      .map((dependent): DependentRow => ({
        ...dependent,
        key: `${dependent.artifactEcosystem ?? ''}:${dependent.artifactName ?? ''}:${dependent.artifactVersion ?? ''}`,
        currency: currencyOf(dependent.embeddedVersion, artifact.latest),
      }))
      .sort(
        (a, b) =>
          rank[a.currency] - rank[b.currency] ||
          (a.repository ?? '').localeCompare(b.repository ?? '') ||
          (a.artifactName ?? '').localeCompare(b.artifactName ?? ''),
      );
    return { ...artifact, key: `${artifact.ecosystem ?? ''}:${artifact.name ?? ''}`, rows };
  });
}

/**
 * Whether a bump event concerns the repository `name`: its payload names it (`repository`,
 * `repositoryName` or `repoName`), or names no repository by name at all (a build or a release
 * request names it by id only, which the page cannot tell apart). An event naming another
 * repository by name does not.
 */
export function namesRepository(event: QitsDomainEvent, name: string): boolean {
  const named = ['repository', 'repositoryName', 'repoName']
    .map((key) => payloadField(event, key))
    .filter((value): value is string => !!value);
  return named.length === 0 || named.includes(name);
}

/** How many released versions the Dependents page's Releases section lists. */
export const RELEASES_SHOWN = 10;

const RELEASED: ReadonlySet<string> = new Set(['RELEASED', 'FINALIZED']);

/**
 * The repository's released versions, newest first as the door answers: its RELEASED and
 * FINALIZED requests that carry a version, at most `limit` of them.
 */
export function releasedVersions(
  requests: readonly RepositoryReleaseRequest[],
  limit = RELEASES_SHOWN,
): readonly RepositoryReleaseRequest[] {
  return requests
    .filter((request) => RELEASED.has(request.state ?? '') && !!request.version)
    .slice(0, limit);
}

/**
 * The newest release's journey in a line: "n of m downstream carry <version>", `n` the adopters
 * that ADOPTED it, `m` every repository downstream of it; none downstream says so.
 */
export function adoptionSummary(adopters: readonly Adopter[], version: string): string {
  if (adopters.length === 0) return `Nothing is downstream of ${version}.`;
  const adopted = adopters.filter((adopter) => adopter.state === 'ADOPTED').length;
  return `${adopted} of ${adopters.length} downstream carry ${version}`;
}
