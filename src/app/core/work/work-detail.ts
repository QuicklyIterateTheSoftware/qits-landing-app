import { QitsApiError } from '@qits/angular';
import { loadState } from '$core/resources/load-state';
import type { LoadState } from '$ui/components/spinner/spinner';
import type { CommentEntry, DossierAsset, WorkThread } from './work-detail.consumes';

/**
 * Why a comment write failed: the HTTP status and the service's `message` when it sent one (its
 * OpenAPI document gives error answers no body, so it is read defensively), or "the service is
 * unreachable" when nothing answered.
 */
export function commentRefusal(error: unknown, httpStatus: number | undefined): string {
  if (!httpStatus) return 'the service is unreachable';
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  return typeof message === 'string' && message.trim()
    ? `${httpStatus} ${message}`
    : `${httpStatus}`;
}

/** Why a comment write's run failed ({@link commentRefusal}). */
export function commentRunRefusal(error: unknown): string {
  return error instanceof QitsApiError
    ? commentRefusal(error.error, error.status)
    : commentRefusal(undefined, undefined);
}

/**
 * `thread` with `comment` in it: in place of the one with its id, else last. Unchanged while it
 * is not read.
 */
export function withComment(
  thread: WorkThread | undefined,
  comment: CommentEntry,
): WorkThread | undefined {
  if (!thread) return thread;
  const entries = thread.entries ?? [];
  const known = entries.some((e) => e.comment?.id === comment.id);
  return {
    ...thread,
    entries: known
      ? entries.map((e) => (e.comment?.id === comment.id ? { ...e, comment } : e))
      : [...entries, { comment }],
  };
}

/**
 * `EDIT_WORK_COMMENT`'s params: a JSON merge patch of the body alone, sent as plain
 * `application/json` as the old UI sent it: the door reads either spelling, and the golden master
 * records that one.
 */
export function editCommentParams(qualifiedId: string, commentId: string, body: string) {
  return {
    path: { qualifiedId, commentId },
    body: { body },
    headers: { 'Content-Type': 'application/json' },
  };
}

/**
 * An epic's figures: each address its pages name a figure with (`url`, data in their bodies),
 * mapped to where the browser loads it, qits-projects' `/work` content door by the item's
 * qualified id and the figure's id (`apiOrigin` is qits-projects' API origin).
 */
export function figuresOf(
  apiOrigin: string,
  qualifiedId: string,
  assets: readonly DossierAsset[],
): Readonly<Record<string, string>> {
  const work = `${apiOrigin}/projects/api/work/${encodeURIComponent(qualifiedId)}`;
  return Object.fromEntries(
    assets.flatMap((a) =>
      a.url && a.id ? [[a.url, `${work}/dossier-assets/${encodeURIComponent(a.id)}/content`]] : [],
    ),
  );
}

/** What {@link detailState} reads of a resource. */
interface DetailRead {
  status(): string;
  hasValue(): boolean;
}

/**
 * The work item page's body state (qits-2146): loading until the item, its thread and the dossier
 * its archetype calls for (an epic's and a ticket's pages, an epic's figures) are read; any failed
 * read fails the whole body, as `WorkDetailStore`'s one read did.
 */
export function detailState(
  item: DetailRead & { value(): { readonly archetype?: string } | undefined },
  comments: DetailRead,
  pages: DetailRead,
  assets: DetailRead,
): LoadState {
  const archetype = item.hasValue() ? item.value()?.archetype : undefined;
  const reads = [
    item,
    comments,
    ...(archetype === 'EPIC' || archetype === 'TICKET' ? [pages] : []),
    ...(archetype === 'EPIC' ? [assets] : []),
  ].map((read) => loadState(read));
  if (reads.includes('error')) return 'error';
  return reads.every((state) => state === 'loaded') ? 'loaded' : 'loading';
}
