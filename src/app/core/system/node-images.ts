/**
 * Pure helpers of a swarm node's Images tab (qits-2353), over what `NODE_IMAGE_LIST` answers.
 */

/** The prefix every image id the door answers carries (`docker image ls --no-trunc`). */
const DIGEST_PREFIX = 'sha256:';

/**
 * Docker's short id of an image: the first 12 hex digits after `sha256:` (`14beaf669b73`), not the
 * first 12 characters of the whole id, which would all read `sha256:…`.
 */
export function imageShortId(id: string | null | undefined): string {
  const digits = (id ?? '').startsWith(DIGEST_PREFIX)
    ? id!.slice(DIGEST_PREFIX.length)
    : (id ?? '');
  return digits.slice(0, 12);
}

/**
 * How many containers use an image: docker's count as a number (`"3"` → 3); undefined when it is
 * not a count (`N/A`, which docker writes when it did not count, or nothing).
 */
export function inUse(containers: string | null | undefined): number | undefined {
  const text = (containers ?? '').trim();
  if (!/^\d+$/.test(text)) return undefined;
  return Number(text);
}

/** The disk a node's images take, Σ `sizeBytes` (a row with none counts nothing). */
export function totalBytes(rows: readonly { readonly sizeBytes?: number | null }[]): number {
  return rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.sizeBytes) ? (row.sizeBytes as number) : 0),
    0,
  );
}
