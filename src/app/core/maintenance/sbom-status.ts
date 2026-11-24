import { QitsOfflineError } from '@qits/angular';
import { describeRefusal } from '$core/release-requests/release-request-model';
import { refusedBy } from '$core/release-requests/release-request-writes';
import type { ChipTone } from '$ui/components/chip/chip';
import type { ArtifactVersionStatus } from './maintenance.consumes';

/**
 * What the npm and maven package pages (qits-2490) make of qits-maintenance's SBOM status per
 * released version, pure: each version's row by its version, the chip's label and tone, and what a
 * Re-read SBOM that did not answer 202 came to.
 */

/** The roles `ingestArtifactSbom` admits, as a refusal names them. */
export const SBOM_REREAD_ROLES =
  'qits:admin, qits:admin-agent, qits:desk-admin, qits:desk or qits:system';

/** The versions maintenance knows, by version; a row without a version is left out. */
export function statusesByVersion(
  rows: readonly ArtifactVersionStatus[] | null | undefined,
): ReadonlyMap<string, ArtifactVersionStatus> {
  const index = new Map<string, ArtifactVersionStatus>();
  for (const row of rows ?? []) {
    if (row.version && !index.has(row.version)) index.set(row.version, row);
  }
  return index;
}

/** A status as the chip says it: `Pending`, `Ingested`, `Missing`, `Failed`; else as sent. */
export function sbomStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'INGESTED':
      return 'Ingested';
    case 'MISSING':
      return 'Missing';
    case 'FAILED':
      return 'Failed';
    default:
      return status ?? 'unknown';
  }
}

/**
 * A status as a chip's tone: INGESTED ok, PENDING waiting, FAILED failed; MISSING (the release
 * published no SBOM) and anything else neutral.
 */
export function sbomStatusTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'INGESTED':
      return 'ok';
    case 'PENDING':
      return 'waiting';
    case 'FAILED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** Whether `error` is the refusal of a role that may not re-read (403). */
export function isRoleRefusal(error: unknown): boolean {
  return refusedBy(error).status === 403;
}

/**
 * What a re-read that did not answer 202 came to, for its row: offline (never queued), a 403 (the
 * roles that may), another refusal, or no answer at all.
 */
export function explainReread(error: unknown): string {
  if (error instanceof QitsOfflineError) {
    return 'Not sent: this browser is offline, and a re-read is never queued.';
  }
  const { status, message } = refusedBy(error);
  if (status === 403) return `Re-reading an SBOM needs ${SBOM_REREAD_ROLES}.`;
  if (status >= 400 && status < 500) return `Not re-read: ${describeRefusal(status, message)}.`;
  return `The SBOM could not be re-read (${describeRefusal(status, message)}).`;
}
