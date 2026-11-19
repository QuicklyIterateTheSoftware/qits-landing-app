/**
 * The kinds of documentation qits-artifacts' docs store holds, told apart by a site's scope
 * (qits-2318), ported from qits-docs-frontend's `doc-kind.ts` (`DOC_SECTIONS`, `kindOf`) and
 * `doc-url.ts` (`shortNameOf`) with the same order, labels, descriptions and route segments, so
 * the Docs page (`ProjectDocsPage`) groups a catalog exactly as the docs app's sections do.
 *
 * The scope lives on the section, and the rest is derived from it: a section that declares a scope
 * takes the sites under it, and Storybook (no scope) gets every site no scoped section claims.
 */

/** A kind of documentation. */
export type DocKind =
  'storybook' | 'apidocs' | 'userflows' | 'guides' | 'contracts' | 'changelog' | 'routes';

/** A section of the catalog: its kind, label, route segment, scope (none: Storybook) and line. */
export interface DocSection {
  readonly kind: DocKind;
  readonly label: string;
  /** The segment the docs app addresses it under, and the Docs page's `?section=` value. */
  readonly route: string;
  /** The npm scope that names its sites; absent for Storybook, the complement of the others. */
  readonly scope?: string;
  readonly description: string;
}

/** The sections, in display order. */
export const DOC_SECTIONS: readonly DocSection[] = [
  {
    kind: 'storybook',
    label: 'Storybook',
    route: 'storybook',
    description: 'Component workbenches and other published sites, framed whole.',
  },
  {
    kind: 'apidocs',
    label: 'API docs',
    route: 'apidocs',
    scope: '@apidocs',
    description: 'OpenAPI documents per service, rendered with swagger-ui.',
  },
  {
    kind: 'userflows',
    label: 'Userflows',
    route: 'userflows',
    scope: '@userflows',
    description: 'Per-commit user stories with their recorded service interactions.',
  },
  {
    kind: 'guides',
    label: 'Guides',
    route: 'guides',
    scope: '@guides',
    description: 'Platform contracts and operating notes.',
  },
  {
    kind: 'contracts',
    label: 'Contracts',
    route: 'contracts',
    scope: '@contracts',
    description: 'Recorded provider states and the operations run against each one.',
  },
  {
    kind: 'routes',
    label: 'Routes',
    route: 'routes',
    scope: '@routes',
    description: 'Frozen pages and route manifest per frontend, from its screenshot specs.',
  },
  {
    kind: 'changelog',
    label: 'Changelogs',
    route: 'changelog',
    scope: '@changelog',
    description: 'One changelog per repository, a new entry with every release.',
  },
];

/**
 * A site's kind, read off the scope its name starts with. The `+ '/'` is deliberate: a bare
 * `@userflows`, with no site under it, is not a userflows document, so it falls to Storybook.
 */
export function kindOf(site: string): DocKind {
  return (
    DOC_SECTIONS.find((section) => !!section.scope && site.startsWith(section.scope + '/'))?.kind ??
    'storybook'
  );
}

/** `ui-components` out of `@qits/ui-components`; a name published without a scope stays whole. */
export function shortNameOf(name: string): string {
  const slash = name.startsWith('@') ? name.indexOf('/') : -1;
  return slash > 0 ? name.slice(slash + 1) : name;
}

/** The section a `?section=` value names (its route segment), or undefined for any other value. */
export function sectionOf(route: string | null | undefined): DocSection | undefined {
  return route ? DOC_SECTIONS.find((section) => section.route === route) : undefined;
}

/** By code point, so the order is the same in every locale. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One section's block on the Docs page: the section and its sites, by short name. */
export interface DocBlock<T> {
  readonly section: DocSection;
  readonly sites: readonly T[];
}

/**
 * The catalog's sites grouped into blocks, one per section that holds at least one, in
 * {@link DOC_SECTIONS} order, each block's sites sorted by short name (then by full name). `only`
 * keeps that section's block alone; `query` keeps the sites whose name holds it, ignoring case.
 */
export function docBlocks<T extends { readonly name?: string }>(
  sites: readonly T[],
  filter: { readonly only?: DocKind; readonly query?: string } = {},
): readonly DocBlock<T>[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  const kept = sites.filter((site) => (site.name ?? '').toLowerCase().includes(query));
  return DOC_SECTIONS.filter((section) => !filter.only || section.kind === filter.only)
    .map((section) => ({
      section,
      sites: kept
        .filter((site) => kindOf(site.name ?? '') === section.kind)
        .sort((a, b) => {
          const byShort = compare(shortNameOf(a.name ?? ''), shortNameOf(b.name ?? ''));
          return byShort || compare(a.name ?? '', b.name ?? '');
        }),
    }))
    .filter((block) => block.sites.length > 0);
}
