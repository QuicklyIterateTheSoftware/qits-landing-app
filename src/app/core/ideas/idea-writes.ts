import { QitsApiError } from '@qits/angular';
import type { ReorderAnchor } from '$core/reorder/reorder-anchor';
import { inIdeaRank } from './idea-rank';
import type { IdeaPriorities } from './ideas.consumes';

/**
 * What the idea writes send (epic qits-888), built once for the pages' `qitsMutation`s and for
 * `ideas.operations.pact.spec.ts`, which drives the same builders: what a page sends is what an
 * interaction holds. Formerly `IdeasStore`'s (qits-2146).
 */

/** Where a dragged idea now sits: directly above one rankable idea, or directly below one. */
export type IdeaAnchor = ReorderAnchor;

/** A new idea: its title, and optionally its description and the idea enabling it. */
export interface IdeaDraft {
  readonly title: string;
  readonly description?: string;
  readonly enabledBy?: string;
}

/** An edit, as a JSON merge patch: a field left out stays, `null` clears it. */
export interface IdeaPatch {
  readonly title?: string;
  readonly description?: string | null;
  readonly enabledBy?: string | null;
}

/**
 * Why a write was refused, for a person: the service's `message` as it is (a 400 names the rule
 * the title or description broke), else the status, else "the service is unreachable".
 */
export function ideaRefusal(error: unknown, httpStatus: number | undefined): string {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  return httpStatus
    ? `The service refused it (HTTP ${httpStatus}).`
    : 'The service is unreachable.';
}

/** Why a mutation's run was refused: its `QitsApiError`'s body and status, else unreachable. */
export function ideaRunRefusal(error: unknown): string {
  return error instanceof QitsApiError
    ? ideaRefusal(error.error, error.status)
    : ideaRefusal(undefined, undefined);
}

/** `createIdea`'s params: the title and description trimmed; a blank description or enabledBy is not sent. */
export function createIdeaParams(projectId: string, draft: IdeaDraft) {
  const description = draft.description?.trim();
  const enabledBy = draft.enabledBy?.trim();
  return {
    body: {
      project: projectId,
      title: draft.title.trim(),
      ...(description ? { description } : {}),
      ...(enabledBy ? { enabledBy } : {}),
    },
  };
}

/**
 * `patchIdea`'s params: a JSON merge patch, sent as plain `application/json`. The door reads either
 * spelling, and the golden master records that one (as the work item page's comment edit).
 */
export function patchIdeaParams(id: string, patch: IdeaPatch) {
  return {
    path: { id },
    body: { ...patch },
    headers: { 'Content-Type': 'application/json' },
  };
}

/** `archiveIdea`'s params: the reason trimmed (the page sends none blank). */
export function archiveIdeaParams(id: string, reason: string) {
  return { path: { id }, body: { reason: reason.trim() } };
}

/** `unarchiveIdea`'s params. */
export function unarchiveIdeaParams(id: string) {
  return { path: { id } };
}

/** `reprioritizeIdea`'s params: the dragged idea and where it now sits. */
export function reprioritizeIdeaParams(id: string, anchor: IdeaAnchor) {
  return { path: { id }, body: anchor };
}

/**
 * `ideas` with a drop's answered priorities written in, in rank order again (`inIdeaRank`), so the
 * dropped idea stays where it was put; unchanged when the answer renumbered none of them.
 */
export function withPriorities<
  T extends { readonly id?: string; readonly priority?: number | null },
>(ideas: readonly T[], priorities: IdeaPriorities): T[] {
  const written = new Map(
    (priorities.items ?? []).flatMap((item) => (item.id ? [[item.id, item.priority]] : [])),
  );
  if (!written.size) return [...ideas];
  return inIdeaRank(
    ideas.map((idea) =>
      idea.id && written.has(idea.id) ? { ...idea, priority: written.get(idea.id) } : idea,
    ),
  );
}
