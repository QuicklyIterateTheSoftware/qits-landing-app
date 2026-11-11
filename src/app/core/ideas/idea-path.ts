/**
 * An idea status's chip tone (`ui-chip`'s `tone`): DONE is done, QUEUED has work under way, and
 * PLANNED (or an unknown status) waits for work.
 */
export function ideaStatusTone(status: string | undefined): 'ok' | 'waiting' | 'neutral' {
  if (status === 'DONE') return 'ok';
  if (status === 'QUEUED') return 'waiting';
  return 'neutral';
}
