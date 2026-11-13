import { QitsApiError } from '@qits/angular';
import type { ReorderAnchor } from '$core/reorder/reorder-anchor';

/**
 * The requests of qits-projects' work writes outside a move (epic qits-888; `work-writes.operations.ts`,
 * qits-2146), built here for the pages and for the pact spec alike, and how a refusal reads.
 */

/** The archetypes an idea can inspire: every archetype (qits-1792). */
export const INSPIRABLE = ['EPIC', 'TICKET', 'FEATURE', 'TASK'] as const;

export type InspirableArchetype = (typeof INSPIRABLE)[number];

/** Whether an item of `archetype` can name an idea as its inspiration. */
export function inspirable(archetype: string | undefined): archetype is InspirableArchetype {
  return (INSPIRABLE as readonly (string | undefined)[]).includes(archetype);
}

/** The archetypes the create form files as a new root of a project. */
export const ROOT = ['EPIC', 'TICKET'] as const;

export type RootArchetype = (typeof ROOT)[number];

/** Whether `archetype` is one the create form can file as a root. */
export function isRoot(archetype: string | undefined): archetype is RootArchetype {
  return (ROOT as readonly (string | undefined)[]).includes(archetype);
}

/** A ticket's kinds a person files (MAINTENANCE is the platform's own). */
export const TICKET_TYPES = ['BUG', 'IMPROVEMENT'] as const;

/** A new root item of a project, as the create form fills it. */
export interface WorkDraft {
  readonly archetype: RootArchetype;
  /** The project's id. */
  readonly project: string;
  readonly title: string;
  readonly description?: string;
  /** A ticket's kind and why it came about (required for a ticket). */
  readonly ticketType?: string;
  readonly impetus?: string;
  /** The idea inspiring it. */
  readonly inspiredBy?: string;
}

/**
 * Where a dragged item now sits among its siblings: directly above one (`above`), or, dropped last,
 * directly below one (`below`). Exactly one of the two.
 */
export type WorkAnchor = ReorderAnchor;

/**
 * One need as a write names it (epic qits-1899): the item waited for, by qualified id, and the
 * status it must reach.
 */
export interface NeedDraft {
  readonly item: string;
  readonly status: string;
}

/** What a write answered: the value, or why not, for a person. */
export type WorkWriteOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: string };

/** The service's `message` as it is, else the status, else "unreachable". */
export function workWriteRefusal(error: unknown, httpStatus: number | undefined): string {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  return httpStatus
    ? `The service refused it (HTTP ${httpStatus}).`
    : 'The service is unreachable.';
}

/** Why a write's run failed ({@link workWriteRefusal}): its `QitsApiError`, else unreachable. */
export function workWriteRunRefusal(error: unknown): string {
  return error instanceof QitsApiError
    ? workWriteRefusal(error.error, error.status)
    : workWriteRefusal(undefined, undefined);
}

/**
 * `CREATE_WORK`'s params: a root epic or ticket of a project, with the idea inspiring it when the
 * form was opened from an idea. Blank optional fields are not sent; a ticket's type and impetus
 * only for a ticket.
 */
export function createWorkParams(draft: WorkDraft) {
  const optional = (value: string | undefined) => value?.trim() || undefined;
  const fields = {
    description: optional(draft.description),
    ticketType: draft.archetype === 'TICKET' ? optional(draft.ticketType) : undefined,
    impetus: draft.archetype === 'TICKET' ? optional(draft.impetus) : undefined,
    inspiredBy: optional(draft.inspiredBy),
  };
  return {
    body: {
      archetype: draft.archetype,
      project: draft.project,
      title: draft.title.trim(),
      ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    },
  };
}

/**
 * `SET_WORK_NEEDS`' params: what `qualifiedId` waits for (epic qits-1899), the whole list (`[]`
 * clears it), sent as plain `application/json`, as the recorded patches are: the door reads either
 * spelling of a merge patch.
 */
export function needsParams(qualifiedId: string, needs: readonly NeedDraft[]) {
  return {
    path: { qualifiedId },
    body: { needs: needs.map(({ item, status }) => ({ item, status })) },
    headers: { 'Content-Type': 'application/json' },
  };
}

/** `REPRIORITIZE_WORK`'s params: `qualifiedId` directly above or below a sibling (qits-753). */
export function reprioritizeParams(qualifiedId: string, anchor: WorkAnchor) {
  return { path: { qualifiedId }, body: anchor };
}
