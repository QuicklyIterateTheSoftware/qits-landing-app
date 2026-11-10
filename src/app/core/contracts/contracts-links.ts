/**
 * Router commands for a repository's contracts and entities pages (qits-1994), for any page that
 * links to them: `[routerLink]="contractStateLink(slug, repo, state.slug)"`. Each segment is its own
 * command, so the router encodes it (a state slug or a class name never needs escaping by hand).
 */

/** `projects/<slug>/repositories/<repo>`, the base of every link below. */
const repository = (slug: string, repo: string) =>
  ['/projects', slug, 'repositories', repo] as const;

/** The repository's provider states: `projects/:slug/repositories/:repo/contracts`. */
export function contractsLink(slug: string, repo: string): readonly string[] {
  return [...repository(slug, repo), 'contracts'];
}

/** One provider state, by its `slug` in `golden-masters/index.json`. */
export function contractStateLink(slug: string, repo: string, state: string): readonly string[] {
  return [...contractsLink(slug, repo), state];
}

/** The repository's entity map: `projects/:slug/repositories/:repo/entities`. */
export function entitiesLink(slug: string, repo: string): readonly string[] {
  return [...repository(slug, repo), 'entities'];
}

/** One entity, by its fully qualified class name as `entities.json` writes it. */
export function entityLink(slug: string, repo: string, entity: string): readonly string[] {
  return [...entitiesLink(slug, repo), entity];
}
