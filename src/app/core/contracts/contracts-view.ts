import type { EntityDto, EntityMap, MappedEntity } from '$core/ui-builder/entity-map';
import type { CatalogRead, ContractsSite, EntityMapRead } from '$core/ui-builder/contracts-catalog';
import type { GoldenDependency, GoldenIndex, GoldenState } from '$core/ui-builder/golden-masters';

/**
 * The pure part of a repository's contracts and entities pages (qits-1994): which published
 * `@contracts/` bundle is the repository's, the rows the pages draw from its
 * `golden-masters/index.json` and `entities.json`, and what each link kind of the entity map means.
 */

/** The prefix of a service's contracts site (qits-1945). */
const CONTRACTS_SITE = '@contracts/';

/** The repository's contracts bundle, as the catalog of contracts sites tells it. */
export type BundleLookup =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /** No site's newest version names the repository, and every site's versions were read. */
  | { readonly status: 'none' }
  /** No site names the repository, but these sites' versions could not be read. */
  | { readonly status: 'unreadable'; readonly sites: readonly string[] }
  | { readonly status: 'loaded'; readonly site: ContractsSite };

/**
 * The site whose newest version's `git.repository.name` is `repo` (`contractsSitesOf`). A site
 * whose versions could not be read names no repository, so it only matters when none matches.
 */
export function bundleOf(catalog: CatalogRead | null, repo: string): BundleLookup {
  if (!catalog || catalog.status === 'loading') return { status: 'loading' };
  if (catalog.status === 'error') return { status: 'error' };
  const site = catalog.sites.find((s) => s.repository === repo);
  if (site) return { status: 'loaded', site };
  return catalog.unreadable.length
    ? { status: 'unreadable', sites: catalog.unreadable }
    : { status: 'none' };
}

/** The bundle in qits-docs' reader at its version, as the UI builder's call popover links it. */
export function docsUrl(origin: string, site: ContractsSite): string | null {
  return origin ? `${origin}/read/${site.site}/-/${site.version}` : null;
}

/** A class's simple name: `eu.wohlben.qits.Project` → `Project`. */
export const simpleName = (fqn: string): string => fqn.split('.').at(-1) ?? fqn;

/** The states of an index; none when it lists none. */
export const statesOf = (index: GoldenIndex): readonly GoldenState[] =>
  Array.isArray(index.states) ? index.states : [];

/** One row of the contracts list. */
export interface StateRow {
  readonly name: string;
  readonly slug: string;
  readonly operationCount: number;
  /** Each recorded operationId once, in recorded order. */
  readonly operationIds: readonly string[];
}

/** The index's states as list rows, in the index's order. */
export function stateRows(index: GoldenIndex): readonly StateRow[] {
  return statesOf(index).map((state) => ({
    name: state.name,
    slug: state.slug,
    operationCount: state.operations.length,
    operationIds: [...new Set(state.operations.map((op) => op.operationId))],
  }));
}

/** The rows whose name holds `text`, ignoring case and surrounding blanks; all for no text. */
export function filterRows<T extends { readonly name: string }>(
  rows: readonly T[],
  text: string,
): readonly T[] {
  const needle = text.trim().toLowerCase();
  return needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
}

/** The site of the provider a dependency or a projection names: by application or repository. */
export function providerSite(
  sites: readonly ContractsSite[],
  provider: string,
): ContractsSite | null {
  return (
    sites.find((s) => s.site === `${CONTRACTS_SITE}${provider}`) ??
    sites.find((s) => s.repository === provider) ??
    null
  );
}

/** One dependency of a state, with where it links (null: plain text). */
export interface DependencyRow {
  readonly label: string;
  /** The repository whose state page shows it, and that state's slug; null when unknown. */
  readonly link: { readonly repository: string; readonly slug: string } | null;
}

/**
 * A state's `dependsOn` as rows. A string is a state of the same bundle, linked when its index
 * lists it. `{ provider, state }` is a state of another provider's bundle: linked when the catalog
 * knows that provider's repository (`providerSite`) and its index (`indexOf`, null while unread)
 * lists the state, since a state page is addressed by slug; else plain text.
 */
export function dependencyRows(
  dependsOn: readonly GoldenDependency[] | undefined,
  own: { readonly site: ContractsSite; readonly index: GoldenIndex },
  sites: readonly ContractsSite[],
  indexOf: (site: ContractsSite) => GoldenIndex | null,
): readonly DependencyRow[] {
  const slugIn = (index: GoldenIndex | null, name: string) =>
    (index ? statesOf(index) : []).find((s) => s.name === name)?.slug ?? null;
  return (dependsOn ?? []).map((dependency): DependencyRow => {
    if (typeof dependency === 'string') {
      const slug = slugIn(own.index, dependency);
      return {
        label: dependency,
        link: slug ? { repository: own.site.repository, slug } : null,
      };
    }
    const label = `${dependency.provider}: ${dependency.state}`;
    const site = providerSite(sites, dependency.provider);
    const slug = site ? slugIn(indexOf(site), dependency.state) : null;
    return { label, link: site && slug ? { repository: site.repository, slug } : null };
  });
}

/** The providers' sites a state's dependencies name, whose indexes `dependencyRows` needs. */
export function dependencySites(
  dependsOn: readonly GoldenDependency[] | undefined,
  sites: readonly ContractsSite[],
): readonly ContractsSite[] {
  const found = (dependsOn ?? []).flatMap((d) =>
    typeof d === 'string' ? [] : [providerSite(sites, d.provider)].filter((s) => s !== null),
  );
  return [...new Map(found.map((s) => [s.site, s])).values()];
}

/** A value of a key/value table: a string as it is, anything else as JSON. */
export const shownValue = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/** A record as key/value rows, in its order. */
export const keyValues = (
  record: Readonly<Record<string, unknown>> | undefined,
): readonly { readonly key: string; readonly value: string }[] =>
  Object.entries(record ?? {}).map(([key, value]) => ({ key, value: shownValue(value) }));

/** The display order of the markings; any other comes after them, by name. */
export const MARKING_ORDER: readonly string[] = ['domain', 'technical', 'projection'];

/** One marking's entities, by simple name. */
export interface EntityGroup {
  readonly marking: string;
  readonly entities: readonly MappedEntity[];
}

/** The map's entities grouped by marking, in {@link MARKING_ORDER}; an empty marking is absent. */
export function entityGroups(map: EntityMap): readonly EntityGroup[] {
  const groups = new Map<string, MappedEntity[]>();
  for (const entity of map.entities) {
    groups.set(entity.marking, [...(groups.get(entity.marking) ?? []), entity]);
  }
  const rank = (marking: string) => {
    const at = MARKING_ORDER.indexOf(marking);
    return at < 0 ? MARKING_ORDER.length : at;
  };
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([marking, entities]) => ({
      marking,
      entities: [...entities].sort(
        (a, b) =>
          simpleName(a.entity).localeCompare(simpleName(b.entity)) ||
          a.entity.localeCompare(b.entity),
      ),
    }));
}

/** What a projection projects: `qits-projects:Project`; null when it is not that shape. */
export function projectionTarget(
  projectionOf: string | null,
): { readonly application: string; readonly name: string } | null {
  const match = /^([^:\s]+):([^:\s]+)$/.exec(projectionOf ?? '');
  return match ? { application: match[1], name: match[2] } : null;
}

/** Where a projection's entity is, once its bundle's map is read. */
export type ProjectionLink =
  /** No site names the application, or its map is unread, failed, or lacks the entity. */
  null | { readonly repository: string; readonly entity: string };

/**
 * The entity a projection names: the application's contracts site (`providerSite`), whose map
 * (`mapOf`) names that application and holds an entity of that simple name.
 */
export function projectionLink(
  projectionOf: string | null,
  sites: readonly ContractsSite[],
  mapOf: (site: ContractsSite) => EntityMapRead | undefined,
): ProjectionLink {
  const target = projectionTarget(projectionOf);
  const site = target ? providerSite(sites, target.application) : null;
  const read = site ? mapOf(site) : undefined;
  if (!target || !site || read?.status !== 'loaded') return null;
  if (read.map.application !== target.application) return null;
  const found = read.map.entities.find((e) => simpleName(e.entity) === target.name);
  return found ? { repository: site.repository, entity: found.entity } : null;
}

/** A link kind of the entity map, with what it means, in the map's order of directness. */
export interface KindNote {
  readonly kind: string;
  readonly note: string;
}

/**
 * How an entity reaches a DTO (qits-arch-rules' `EntityExposure`): the map keeps each DTO's most
 * direct link, in this order.
 */
export const DTO_KINDS: readonly KindNote[] = [
  { kind: 'direct', note: 'An operation’s answer holds the entity itself, or a type holding it.' },
  { kind: 'annotation', note: 'The type’s @Exposes names the entity, for a path bytecode hides.' },
  { kind: 'factory', note: 'A static method or constructor of the type reads the entity.' },
  { kind: 'mapper', note: 'A code unit taking the entity as a parameter builds the type.' },
  {
    kind: 'assembler',
    note: 'A code unit reads the entity, without taking it, and builds the type.',
  },
  { kind: 'via', note: 'The entity links to a carrier, and the carrier to the type: one hop.' },
];

/**
 * How an operation hands out the DTO (qits-arch-rules' `EntityExposure`): the map keeps each
 * operation's most direct one, in this order.
 */
export const OPERATION_KINDS: readonly KindNote[] = [
  { kind: 'direct', note: 'The answer holds the entity itself.' },
  { kind: 'returns', note: 'The return type, unwrapped (List, Optional, Uni, …), is the DTO.' },
  { kind: 'schema', note: 'The operation’s @APIResponse schema names the DTO.' },
  { kind: 'body', note: 'No declared type: the operation’s body builds the DTO.' },
];

/** What `kind` means among `kinds`; null for a kind the map's format does not name. */
export const kindNote = (kinds: readonly KindNote[], kind: string | null): string | null =>
  kinds.find((k) => k.kind === kind)?.note ?? null;

/** `items` most direct first, by `kinds`' order (an unknown kind last), then by `tie`. */
export function byKind<T extends { readonly kind: string | null }>(
  items: readonly T[],
  kinds: readonly KindNote[],
  tie: (item: T) => string,
): readonly T[] {
  const rank = (kind: string | null) => {
    const at = kinds.findIndex((k) => k.kind === kind);
    return at < 0 ? kinds.length : at;
  };
  return [...items].sort((a, b) => rank(a.kind) - rank(b.kind) || tie(a).localeCompare(tie(b)));
}

/** The entity's DTOs, most direct first, ties by type. */
export const sortedDtos = (dtos: readonly EntityDto[]): readonly EntityDto[] =>
  byKind(dtos, DTO_KINDS, (dto) => dto.type);

/** The states of the index that record `operationId`, in the index's order. */
export function statesRecording(index: GoldenIndex, operationId: string): readonly GoldenState[] {
  return statesOf(index).filter((s) => s.operations.some((op) => op.operationId === operationId));
}
