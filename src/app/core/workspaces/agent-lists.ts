/** The agents of `agents` that are not removed, in their order. */
export const notRemoved = <T extends { readonly state?: string }>(
  agents: readonly T[] | undefined,
): T[] => (agents ?? []).filter((agent) => agent.state !== 'REMOVED');

/**
 * Whether a work item's qualified id (`<slug>-<n>`) is one of the project `slug`'s. Exact:
 * `qits-12` is `qits`', never `qits-ci`'s, and `qits-ci-3` is `qits-ci`'s, never `qits`'.
 */
export function ofProject(qualifiedId: string | undefined, slug: string | undefined): boolean {
  if (!qualifiedId || !slug) return false;
  const at = qualifiedId.lastIndexOf('-');
  return at > 0 && qualifiedId.slice(0, at) === slug && /^\d+$/.test(qualifiedId.slice(at + 1));
}
