import { QitsApiError } from '@qits/angular';
import type { WorkEntry } from './work.consumes';
import { FINISH_DELAY_MS } from './finish-delay';

/** How a finish (a move to DONE), a move or a dispatch is going: running, or failed. */
export type FinishState = 'running' | 'error';

/**
 * A work entity's status word. Plain `string`, not the generated client's closed union
 * (`WorkEntry['status']`): the union names the words qits-projects-service's OpenAPI document had
 * when the client was generated (READY_FOR_DEV since qits-887), and a newer word can reach a live
 * entity before the client is regenerated. Nothing here may depend on the union being exhaustive.
 */
export type WorkStatus = string;

/** What a dispatch press runs: the whole flow, or the next phase only. */
export type DispatchMode = 'FLOW' | 'PHASE';

export { FINISH_DELAY_MS };

/**
 * A finish asked for in the Acceptance list and not settled yet:
 *
 * - `waiting`: the item is hidden, and Undo still takes it back;
 * - `sending`: the move to DONE is on its way;
 * - `failed`: the move failed; the item is back in the list until this is dismissed.
 */
export interface PendingFinish {
  readonly projectId: string;
  readonly entry: WorkEntry;
  readonly phase: 'waiting' | 'sending' | 'failed';
}

/**
 * How qits-projects' `/work` doors address an entry: its qualified id (`qits-111`), or its id when
 * it carries none (the doors resolve a UUID too).
 */
export function workRef(entry: Pick<WorkEntry, 'id' | 'qualifiedId'>): string | undefined {
  return entry.qualifiedId || entry.id;
}

/**
 * Why a move failed, for a person to read: the answer's `message`, verbatim, when it carries one
 * (a quality gate's 409: `Ticket <id> cannot move to READY_FOR_DEV: ACCEPTANCE_CRITERIA: …`), else
 * the HTTP status. qits-projects' OpenAPI document gives its error answers no body, so the message
 * is read defensively and nothing else of it is relied on.
 */
export function refusalOf(error: unknown, httpStatus: number | undefined): string {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  return httpStatus ? `The move failed (HTTP ${httpStatus}).` : 'The move failed.';
}

/** Why a move's run failed ({@link refusalOf}): its `QitsApiError`'s body and status. */
export function moveRefusal(error: unknown): string {
  return error instanceof QitsApiError
    ? refusalOf(error.error, error.status)
    : refusalOf(undefined, undefined);
}
