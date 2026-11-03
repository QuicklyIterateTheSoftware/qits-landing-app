/** The work section's segment of the Milestones pages: `/projects/<slug>/work/milestones`. */
export const MILESTONES = 'milestones';

/** The Milestones page of the project `slug`; with `id`, that milestone's page. */
export function milestonePath(slug: string, id?: string): string {
  const list = `/projects/${slug}/work/${MILESTONES}`;
  return id ? `${list}/${id}` : list;
}
