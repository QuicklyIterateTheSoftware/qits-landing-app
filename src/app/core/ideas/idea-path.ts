/** The Ideas page of the project `slug` (epic qits-888). */
export function ideasPath(slug: string): string {
  return `/projects/${encodeURIComponent(slug)}/ideas`;
}

/** An idea's page in the project `slug`. */
export function ideaPath(slug: string, ideaId: string): string {
  return `${ideasPath(slug)}/detail/${encodeURIComponent(ideaId)}`;
}

/**
 * An idea status's chip tone (`ui-chip`'s `tone`): DONE is done, QUEUED has work under way, and
 * PLANNED (or an unknown status) waits for work.
 */
export function ideaStatusTone(status: string | undefined): 'ok' | 'waiting' | 'neutral' {
  if (status === 'DONE') return 'ok';
  if (status === 'QUEUED') return 'waiting';
  return 'neutral';
}
