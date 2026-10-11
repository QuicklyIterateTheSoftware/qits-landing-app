import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ReleaseRequestDto } from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { addGoldenInteraction } from '@qits/angular/testing';
import { assertPactPart } from '../../../testing/pact-part';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { NOTHING } from '@qits/angular';
import {
  GET_PROJECT,
  LIST_PROJECT_RELEASE_REQUESTS,
  LIST_PROJECTS,
  SESSION_CHECK,
} from './projects.consumes';
import { ProjectsStore } from './projects.store';

/**
 * qits-landing-app's pact with qits-projects-service (epic qits-546). Both sides are named by
 * repository, so the file is `pacts/qits-landing-app_qits-projects-service.json`.
 *
 * The stores are the only users of the qits-projects client; this spec covers `ProjectsStore`,
 * `work.store.pact.spec.ts` covers `WorkStore` and `repositories.store.pact.spec.ts` covers
 * `RepositoriesStore`, in the same pact file. Each test
 * drives one store method, as the UI interaction named in `interactions.ts` does, against a pact
 * mock server that answers with qits-projects' golden master, and checks what the store made of it.
 * Each interaction binds only the fields the store reads: the same list from `projects.consumes.ts`
 * that the store passes to `consume(...)`.
 *
 * The run writes the pact to a fresh directory (pact-js names it `<consumer>-<provider>.json`);
 * `afterAll` compares it with the committed file and fails on a difference
 * (`QITS_GOLDEN_UPDATE=true npm test` rewrites it). A fresh directory, because pact-js merges into
 * an existing file and would keep an interaction no test makes anymore.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/**
 * The operations this spec owns in that file. `WorkStore`'s pact spec owns `listProjectWork`
 * and `RepositoriesStore`'s owns `listProjectRepositories`, in the same file
 * (`src/testing/pact-part.ts`).
 */
const OPERATIONS = ['listProjects', 'getProject', 'listProjectReleaseRequests'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

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

/**
 * What `listProjectReleaseRequests` asks of the one representative request, path by path (relative
 * to the request), made from `LIST_PROJECT_RELEASE_REQUESTS`: the id by its form, every other field
 * by type or null (most are null on some request: no version before the tag, no conflict, no
 * approver), and every array open-ended (`type`, min 0, no max). Arrays grow as qits-maintenance
 * learns automation kinds and qits-projects gates and phases, so none may be pinned to the length
 * it was recorded with (the trap qits-1075 hit with the archetype flows).
 */
const REQUEST_RULES: Rules = Object.fromEntries(
  LIST_PROJECT_RELEASE_REQUESTS.flatMap((path) => {
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
function openEndedReleaseRequests(generated: string): void {
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

/**
 * Adds the interaction for (state, operation), triggered by the UI interaction `slug`, binding the
 * body paths in `consumes`.
 */
const given = (
  slug: InteractionSlug,
  state: string,
  operationId: string,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    // A field under a recorded `null` (no conflict) is bound in a state that has it.
    consumes: heldBy(masters, state, operationId, consumes),
  });

/**
 * A store on a server platform, so `onInit` does not load the list by itself: each test makes
 * exactly the calls it names. The client talks to the mock server through a real HttpClient.
 */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(ProjectsStore);
}

describe('qits-landing-app → qits-projects-service pact', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
    try {
      const generated = join(dir, `${CONSUMER}-${PROVIDER}.json`);
      openEndedReleaseRequests(generated);
      assertPactPart(generated, COMMITTED, OPERATIONS, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sign-in-landing: a visitor whose list call is answered has a session', () =>
    given('sign-in-landing', 'a project exists', 'listProjects', SESSION_CHECK).executeTest(
      async (server) => {
        expect(await storeAt(server.url).hasSession()).toBe(true);
      },
    ));

  it('list-projects: the store loads the list', () =>
    given('list-projects', 'a project exists', 'listProjects', LIST_PROJECTS).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        await store.load();
        const recorded = masters.body('a project exists', 'listProjects').entries[0].project;
        expect(store.status()).toBe('loaded');
        expect(store.ids()).toContain(recorded.id);
      },
    ));

  it('open-project: the store fetches a project it does not hold', () =>
    given('open-project', 'a project exists', 'getProject', GET_PROJECT).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const id = masters.operation('a project exists', 'getProject').params['projectId'];
        await store.refresh(id);
        const recorded = masters.body('a project exists', 'getProject').project;
        expect(store.selected()?.id).toBe(id);
        expect(store.selected()?.name).toBe(recorded.name);
      },
    ));

  it('open-project: a project qits-projects does not know stays selected and unloaded', () =>
    // On an error the store reads nothing from the body: `consume`'s default for `error`.
    given('open-project', 'no project with the given id', 'getProject', NOTHING).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const id = masters.operation('no project with the given id', 'getProject').params[
          'projectId'
        ];
        await store.refresh(id);
        expect(store.selectedId()).toBe(id);
        expect(store.selected()).toBeUndefined();
        expect(store.ids()).toEqual([]);
      },
    ));

  it('open-release-requests: the store loads a project’s pending release requests', () =>
    given(
      'open-release-requests',
      'a project with release requests in every state',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with release requests in every state',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      // The mock answers with every recorded request (one `arrayContaining` example per shape); the
      // committed pact is then cut to one representative (`openEndedReleaseRequests`). Which
      // states are pending is the plain spec's business.
      expect(store.releaseRequests()[projectId]?.status).toBe('loaded');
      expect(
        store.releaseRequests()[projectId]?.pending.some((request) => request.automations?.length),
      ).toBe(true);
    }));

  it('show-project-release-requests: the page reads every request, with its details', () =>
    given(
      'show-project-release-requests',
      'a project with pending release requests',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with pending release requests',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      const kept = store.releaseRequests()[projectId];
      expect(kept?.status).toBe('loaded');
      expect(kept?.requests.length).toBeGreaterThan(0);
      expect(kept?.requests.every((r) => typeof r.updatedAt === 'string')).toBe(true);
    }));

  it('show-release-request: a request’s page finds its repository among requests in every state', () =>
    given(
      'show-release-request',
      'a project with release requests in every state',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with release requests in every state',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      const kept = store.releaseRequests()[projectId];
      expect(kept?.requests.find((r) => r.id === op.params['requestId'])?.repoId).toBe(
        op.params['repositoryId'],
      );
    }));

  it('show-project-release-requests: a project without any shows none', () =>
    given(
      'show-project-release-requests',
      'a project with no release requests',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with no release requests',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      expect(store.releaseRequests()[projectId]?.requests).toEqual([]);
    }));

  it('open-release-requests: a project without any lists none', () =>
    given(
      'open-release-requests',
      'a project with no release requests',
      'listProjectReleaseRequests',
      LIST_PROJECT_RELEASE_REQUESTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const op = masters.operation(
        'a project with no release requests',
        'listProjectReleaseRequests',
      );
      const projectId = op.params['projectId'];
      await store.loadReleaseRequests(projectId);
      expect(store.releaseRequests()[projectId]).toEqual({
        status: 'loaded',
        requests: [],
        pending: [],
      });
    }));
});
