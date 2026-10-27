/**
 * The anchor of one comment on its work item's page (qits-1660): the `id` its row carries, and
 * the URL fragment that opens the page at it. The Desk page links a desk-mentioned line to it.
 */
export function commentAnchor(commentId: string): string {
  return `comment-${commentId}`;
}

/** The comment id a URL fragment names, or undefined when it names none. */
export function commentOfAnchor(fragment: string | null | undefined): string | undefined {
  const match = /^comment-(.+)$/.exec(fragment ?? '');
  return match?.[1];
}
