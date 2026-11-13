import { readFileSync, writeFileSync } from 'node:fs';
import type { ReleaseRequestDto } from '../app/api/projects';
import {
  LIST_PROJECT_RELEASE_REQUESTS,
  UNBOUND_RELEASE_REQUESTS,
} from '$core/projects/projects.consumes';

/**
 * How the qits-projects pact holds `listProjectReleaseRequests` (qits-1075, qits-1673), as
 * `projects.operations.pact.spec.ts` binds it (`PROJECT_RELEASE_REQUESTS`, qits-2146; the release
 * request pages' part was `projects.store.pact.spec.ts`'s until `ProjectsStore` went). It runs
 * {@link openEndedReleaseRequests} on the pact it generated, before `assertPactPart`.
 */

/** One pact matcher spec, e.g. `{ match: 'type', min: 0 }`. */
interface Matcher {
  readonly match: string;
  readonly min?: number;
  readonly regex?: string;
  readonly variants?: readonly { index: number; rules: Rules; generators: object }[];
}
/** One body path's rule, e.g. `$.requests`. */
interface Rule {
  readonly combine: 'AND' | 'OR';
  readonly matchers: readonly Matcher[];
}
type Rules = Record<string, Rule>;
interface GeneratedPact {
  readonly interactions: readonly {
    readonly comments?: {
      readonly references?: { readonly ['qits-call']?: { readonly operationId?: string } };
    };
    readonly response: {
      readonly body?: { readonly content: { requests: ReleaseRequestDto[] } };
      readonly matchingRules: { body?: Rules };
    };
  }[];
}

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const OPEN_ENDED: Rule = { combine: 'AND', matchers: [{ match: 'type', min: 0 }] };
const TYPE_OR_NULL: Rule = { combine: 'OR', matchers: [{ match: 'type' }, { match: 'null' }] };

/** The paths a pact binds of `consumes`: all but those the store reads unbound (qits-1673). */
const UNBOUND: ReadonlySet<string> = new Set(UNBOUND_RELEASE_REQUESTS);
export const bindable = (consumes: readonly string[]) =>
  consumes.filter((path) => !UNBOUND.has(path));

/**
 * What `listProjectReleaseRequests` asks of the one representative request, path by path (relative
 * to the request), made from `LIST_PROJECT_RELEASE_REQUESTS`: the id by its form, every other field
 * by type or null (most are null on some request: no version before the tag, no conflict, no
 * approver), and every array open-ended (`type`, min 0, no max). Arrays grow as qits-maintenance
 * learns automation kinds and qits-projects gates and phases, so none may be pinned to the length
 * it was recorded with (the trap qits-1075 hit with the archetype flows). `participants[]` and
 * `items[]` (qits-1673) grow with every ask. An item's `workItem` is read but never bound
 * (`UNBOUND_RELEASE_REQUESTS`): it is null where the branch names no work item.
 */
const REQUEST_RULES: Rules = Object.fromEntries(
  bindable(LIST_PROJECT_RELEASE_REQUESTS).flatMap((path) => {
    const leaf = `$.${path.replace(/^requests\[\]\./, '')}`.replaceAll('[]', '[*]');
    const arrays = [...leaf.matchAll(/\[\*\]/g)].map((m) => leaf.slice(0, m.index));
    const rule: Rule =
      leaf === '$.id'
        ? { combine: 'AND', matchers: [{ match: 'regex', regex: UUID }] }
        : TYPE_OR_NULL;
    return [...arrays.map((array) => [array, OPEN_ENDED] as const), [leaf, rule] as const];
  }),
);

/** How many leaves `value` sets (not null): an element with more says more of its shape. */
function filled(value: unknown): number {
  if (value === null) return 0;
  if (typeof value !== 'object') return 1;
  return Object.values(value).reduce((sum: number, inner) => sum + filled(inner), 0);
}

/**
 * `value` (at body path `path`, relative to a request) as the expectation every answered request is
 * held to: each array cut to its fullest element (the most leaves set), and each null leaf that
 * {@link REQUEST_RULES} matches by type or null made `""`, so the expectation itself never holds a
 * null an answer could fill. Every such field is a string where it is set.
 */
function representative(value: unknown, path: string): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return value;
    const fullest = value.reduce((best, next) => (filled(next) > filled(best) ? next : best));
    return [representative(fullest, `${path}[*]`)];
  }
  if (value === null) return REQUEST_RULES[path] === TYPE_OR_NULL ? '' : null;
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [key, representative(inner, `${path}.${key}`)]),
  );
}

/**
 * `addGoldenInteraction` pins every array of the `listProjectReleaseRequests` answer to the length
 * qits-projects recorded, and, because the recorded requests differ in which fields are null, turns
 * `requests` into one `arrayContaining` variant per shape, each pinning its own nulls and lengths.
 * That would fail the provider the moment it adds an automation kind or a gate, or fills
 * `automations` on another row. This reshapes `requests` to "contains at least one request shaped
 * like this one" under {@link REQUEST_RULES}.
 *
 * Why `arrayContaining` and not "every request is like this one": `automations`, `pipeline` and
 * `conflict` are null on some requests, and pact-jvm cannot match a nullable array or object — an
 * `OR(type, null)` rule is honoured on a leaf but not on `$.requests[*].automations`, where it fails
 * both the array and the null (tried against qits-projects-service 2026.1010.101501's
 * ConsumerPactVerificationTest). A request whose arrays or objects are null is therefore left to
 * the store's own `?? []` / null handling, which the plain specs cover.
 *
 * The representative is the first recorded request whose `automations` is filled (else the first),
 * shaped by {@link representative}: pact-jvm verifies every element of an open-ended array past the
 * expected ones against element 0, and `OR(type, null)` excuses a null in the answer but not one in
 * the expectation (a recorded `detail: null` fails an answered "Run in flight").
 *
 * Runs on the pact this spec just generated, between the mock server answering (with qits-projects'
 * real recording, unchanged) and `assertPactPart`: it loosens only what the committed pact asks a
 * provider to match, not what the store under test read. An answer recorded empty stays `[]`.
 */
export function openEndedReleaseRequests(generated: string): void {
  const written = JSON.parse(readFileSync(generated, 'utf8')) as GeneratedPact;
  for (const interaction of written.interactions) {
    const call = interaction.comments?.references?.['qits-call']?.operationId;
    const content = interaction.response.body?.content;
    if (call !== 'listProjectReleaseRequests' || !content?.requests.length) continue;
    const recorded =
      content.requests.find((request) => request.automations?.length) ?? content.requests[0];
    content.requests = [representative(recorded, '$') as ReleaseRequestDto];
    const rules = (interaction.response.matchingRules.body ??= {});
    for (const key of Object.keys(rules)) if (key.startsWith('$.requests')) delete rules[key];
    rules['$.requests'] = {
      combine: 'AND',
      matchers: [
        { match: 'arrayContains', variants: [{ index: 0, rules: REQUEST_RULES, generators: {} }] },
      ],
    };
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}
