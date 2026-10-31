import { inject } from '@angular/core';
import { signalStore, withMethods, withProps } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { createWork, patchWork, reprioritizeWork } from '../../api/projects';
import {
  CREATE_WORK,
  PATCH_WORK_INSPIRATION,
  REPRIORITIZE_WORK,
  WORK_REFUSAL,
  type CreatedWork,
  type PatchedWork,
  type WorkPriorities,
} from './work-writes.consumes';
import { WorkStore } from './work.store';

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

/**
 * Where a dragged item now sits among its siblings: directly above one (`above`), or, dropped last,
 * directly below one (`below`). Exactly one of the two.
 */
export type WorkAnchor = { readonly above: string } | { readonly below: string };

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
 * - `reprioritize(projectId, qualifiedId, anchor)` puts an item directly above or below one of its
 *   open siblings (`reprioritizeWork`, qits-753): a drag in the Backlog or on the board. The
 *   renumbered siblings the service answers go into `WorkStore` at once
 *   (`WorkStore.applyPriorities`), so the item stays where it was dropped; a refusal (400 for an
 *   anchor that is no open sibling, 409 for a DONE or DROPPED item) reads the project's work again
 *   (`WorkStore.refresh`), so it goes back where it was.
 *
 * Staleness (qits-1270): holds no platform state; the pages read again what they show, and a
 * drop's own answer is written into `WorkStore`, as no event follows a priority change.
 */
export const WorkWritesStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({ _work: inject(WorkStore) })),
  withMethods(({ _work: work }) => ({
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
    async reprioritize(
      projectId: string,
      qualifiedId: string,
      anchor: WorkAnchor,
    ): Promise<WorkWriteOutcome<WorkPriorities>> {
      const { data, error, response } = await consume(
        reprioritizeWork({ path: { qualifiedId }, body: anchor }),
        REPRIORITIZE_WORK,
        WORK_REFUSAL,
      );
      if (error !== undefined || !data) {
        void work.refresh(projectId);
        return { ok: false, refusal: workWriteRefusal(error, response?.status) };
      }
      work.applyPriorities(projectId, data.items ?? []);
      return { ok: true, value: data };
    },
  })),
);
