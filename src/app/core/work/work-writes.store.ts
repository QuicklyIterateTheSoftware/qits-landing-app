import { signalStore, withMethods } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { createWork, patchWork } from '../../api/projects';
import {
  CREATE_WORK,
  PATCH_WORK_INSPIRATION,
  WORK_REFUSAL,
  type CreatedWork,
  type PatchedWork,
} from './work-writes.consumes';

/** The archetypes an idea can inspire, and so the ones the create form makes. */
export const INSPIRABLE = ['EPIC', 'TICKET', 'CAMPAIGN'] as const;

export type InspirableArchetype = (typeof INSPIRABLE)[number];

/** Whether an item of `archetype` can name an idea as its inspiration (not a feature or a task). */
export function inspirable(archetype: string | undefined): archetype is InspirableArchetype {
  return (INSPIRABLE as readonly (string | undefined)[]).includes(archetype);
}

/** A ticket's kinds a person files (MAINTENANCE is the platform's own). */
export const TICKET_TYPES = ['BUG', 'IMPROVEMENT'] as const;

/** A new root item of a project, as the create form fills it. */
export interface WorkDraft {
  readonly archetype: InspirableArchetype;
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

/**
 * Work writes outside the board (epic qits-888), on qits-projects' `/work` doors:
 *
 * - `create(draft)` files a root epic, ticket or campaign of a project (`createWork`), with the
 *   idea inspiring it (`inspiredBy`) when the form was opened from an idea. Blank optional fields
 *   are not sent. Answers the new item's qualified id.
 * - `setInspiredBy(qualifiedId, ideaId)` names an idea as the item's inspiration, or clears it with
 *   `null` (`patchWork`, a JSON merge patch of `inspiredBy` alone). Refused on a feature or a task.
 *
 * Staleness (qits-1270): holds no platform state; the pages read again what they show.
 */
export const WorkWritesStore = signalStore(
  { providedIn: 'root' },
  withMethods(() => ({
    async create(draft: WorkDraft): Promise<WorkWriteOutcome<CreatedWork>> {
      const optional = (value: string | undefined) => value?.trim() || undefined;
      const fields = {
        description: optional(draft.description),
        ticketType: draft.archetype === 'TICKET' ? optional(draft.ticketType) : undefined,
        impetus: draft.archetype === 'TICKET' ? optional(draft.impetus) : undefined,
        inspiredBy: optional(draft.inspiredBy),
      };
      const body = {
        archetype: draft.archetype,
        project: draft.project,
        title: draft.title.trim(),
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
      };
      const { data, error, response } = await consume(
        createWork({ body }),
        CREATE_WORK,
        WORK_REFUSAL,
      );
      if (error !== undefined || !data?.qualifiedId) {
        return { ok: false, refusal: workWriteRefusal(error, response?.status) };
      }
      return { ok: true, value: data };
    },
    async setInspiredBy(
      qualifiedId: string,
      ideaId: string | null,
    ): Promise<WorkWriteOutcome<PatchedWork>> {
      const { data, error, response } = await consume(
        patchWork({ path: { qualifiedId }, body: { inspiredBy: ideaId } }),
        PATCH_WORK_INSPIRATION,
        WORK_REFUSAL,
      );
      if (error !== undefined || !data) {
        return { ok: false, refusal: workWriteRefusal(error, response?.status) };
      }
      return { ok: true, value: data };
    },
  })),
);
