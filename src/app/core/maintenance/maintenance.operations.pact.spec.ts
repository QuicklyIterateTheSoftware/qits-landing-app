import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { client as maintenanceClient } from '../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../api/maintenance/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { heldBy, maintenanceGoldenMasters as masters } from '../../../testing/golden-masters';
import { PENDING_BUMPS, REPOSITORY_BUMPS_LIMIT } from './maintenance.consumes';
import {
  MAINTENANCE_ARTIFACTS,
  MAINTENANCE_BUMP,
  MAINTENANCE_DEPENDENCIES,
  MAINTENANCE_DEPENDENTS,
  MAINTENANCE_REPOSITORIES,
  MAINTENANCE_REPOSITORY,
  MAINTENANCE_REPOSITORY_BUMPS,
  MAINTENANCE_REPOSITORY_DEPENDENTS,
  MAINTENANCE_REPOSITORY_DOWNSTREAM,
  PENDING_BUMPS_LIST,
} from './maintenance.operations';

/**
 * qits-landing-app's pact with qits-maintenance-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-maintenance-service.json`: the bumps menu's operation
 * (`maintenance.operations.ts`, qits-2146), the newest 20 bumps (`?limit=20`, which the golden
 * master records and the interaction requires). The operation is the only user of the
 * qits-maintenance client, so this file is the whole pact. Moved here from
 * `maintenance.store.pact.spec.ts` with `MaintenanceStore`, unchanged.
 *
 * The empty list has an interaction too ("no pending bumps"): the menu's screenshot of it shows
 * that recorded body, and every body a screenshot shows is one the provider verifies.
 *
 * The Maintenance section's Dependencies page (qits-2317) reads the inventory's repositories and
 * the dependencies of each kind, INTERNAL and EXTERNAL (`?kind=`, which the golden masters record
 * and the interactions require): an inventory where some of a project's pins are behind
 * ("dependencies of a project, some behind", "external dependencies of a project, some behind"),
 * and an empty one ("no dependencies", "no external dependencies"), each as the page's screenshots
 * show it.
 *
 * Its Artifacts page (qits-2330) reads the inventory's repositories, the released artifacts and,
 * for one artifact (`?ecosystem=&name=`, which the golden master records and the interaction
 * requires), the released artifacts embedding it: a project that has released artifacts, one with
 * dependents current, behind and transitive ("released artifacts, some behind"), and none ("no
 * released artifacts"), each as the page's screenshots show it.
 *
 * Its bump page (qits-2332) reads one bump by its id (`getBump`): a GROUP bump that succeeded,
 * sent one change and was RELEASED ("pending bumps", its `releasedBumpId`), an automation bump
 * that changed nothing ("a bump that changed nothing"), a FAILED automation bump with its failure
 * and two CI runs ("a failed bump"), and an id the service does not know ("no such bump", a 404
 * binding the status only: the page reads nothing of the body).
 *
 * Its repository page (qits-2334) reads one repository by its name (`repoName`) four ways: the
 * repository with its pins and transitives (`getRepository`), its newest 20 bumps
 * (`listBumps?repository=&limit=20`, which the golden master records and the interaction
 * requires), who embeds what it publishes (`listRepositoryDependents`) and its downstream closure
 * (`getRepositoryDownstream`). Each in three states: internal, external, REACTOR and UNRESOLVED
 * pins, some pending, a behind transitive, a RUNNING, a SUCCEEDED and a NOTHING_TO_DO bump, one
 * published artifact with a current and a behind dependent, a two-level downstream ("a repository
 * with pins and bumps"); an OK repository with nothing at all ("a repository with nothing
 * pinned"); and a name the inventory does not hold ("no such repository": `getRepository` a 404
 * binding the status only, the other three empty answers).
 *
 * Its name search (qits-2331) reads the same dependencies of each kind with the searched glob
 * (`?kind=…&name=…`): a glob some of the project's dependencies match (`*p*`: "dependencies
 * matching a glob, some behind", "external dependencies matching a glob, some behind") and one
 * nothing matches (`nothing-matches-*`: "no dependencies matching a glob", "no external
 * dependencies matching a glob"), the inventory's repositories read beside each in the internal
 * state, as the page's searched screenshots show them.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`
 * against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-maintenance-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-maintenance-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(maintenanceClient),
    ],
  });
  maintenanceClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** The interaction for `op` in `state`, triggered by `interaction`; `op` must be `PROVIDER`'s. */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    // A field under a recorded `null` (a bump's `failure` but a failed one's) is bound in a state
    // that has it.
    consumes: op.consumes.length
      ? heldBy(masters, state, op.operationId, op.consumes)
      : op.consumes,
  });
};

/** The menu's request: the newest {@link PENDING_BUMPS}. */
const NEWEST = { query: { limit: PENDING_BUMPS } };

const SOME_BEHIND = 'dependencies of a project, some behind';
const EXTERNAL_SOME_BEHIND = 'external dependencies of a project, some behind';
const NONE = 'no dependencies';
const NO_EXTERNAL = 'no external dependencies';

const MATCHING = 'dependencies matching a glob, some behind';
const EXTERNAL_MATCHING = 'external dependencies matching a glob, some behind';
const NONE_MATCHING = 'no dependencies matching a glob';
const NO_EXTERNAL_MATCHING = 'no external dependencies matching a glob';
/** The globs the searched states record: one that matches, one that matches nothing. */
const SOME_GLOB = '*p*';
const NO_GLOB = 'nothing-matches-*';

/** The page's request for the dependencies of `kind`. */
const ofKind = (kind: 'INTERNAL' | 'EXTERNAL') => ({ query: { kind } });

/** The page's request for the dependencies of `kind` whose name matches `name`. */
const searched = (kind: 'INTERNAL' | 'EXTERNAL', name: string) => ({ query: { kind, name } });

const RELEASED = 'released artifacts, some behind';
const NOTHING_RELEASED = 'no released artifacts';

/** The detail's request for the artifact `state` recorded the dependents of. */
const dependentsOf = (state: string) => {
  const { ecosystem, name } = masters.operation(state, 'listDependencyDependents').query;
  return { query: { ecosystem, name } };
};

/** The bump `state` recorded under the provider-state param `param`, as the page asks for it. */
const bumpOf = (state: string, param: string) => ({
  path: { id: masters.operation(state, 'getBump').params[param] },
});

const PINS_AND_BUMPS = 'a repository with pins and bumps';
const NOTHING_PINNED = 'a repository with nothing pinned';
const NO_SUCH_REPOSITORY = 'no such repository';

/** The repository `state` recorded (its `repoName`), as the page addresses it. */
const repoOf = (state: string): string =>
  masters.operation(state, 'getRepository').params['repoName'];

/** The page's path for the repository `state` recorded. */
const named = (state: string) => ({ path: { name: repoOf(state) } });

/** The page's request for the newest bumps of the repository `state` recorded. */
const bumpsOf = (state: string) => ({
  query: { repository: repoOf(state), limit: REPOSITORY_BUMPS_LIMIT },
});

/** The project the recorded states' repositories belong to. */
const projectOf = (state: string): string =>
  masters.operation(state, 'listRepositories').params['projectId'];

describe('qits-landing-app → qits-maintenance-service pact: the bumps menu’s operation', () => {
  afterAll(() => {
    maintenanceClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('open-version-bumps: the pending bumps', () =>
    given(PENDING_BUMPS_LIST, 'pending bumps', 'open-version-bumps').executeTest(async (server) => {
      const { data } = await at(server.url, () => PENDING_BUMPS_LIST.fetch(NEWEST));
      const bumps = data?.bumps ?? [];
      expect(bumps.length).toBeGreaterThan(0);
      expect(bumps.every((bump) => (bump.repository ?? '').length > 0)).toBe(true);
    }));

  it('open-version-bumps: no bumps when none is pending', () =>
    given(PENDING_BUMPS_LIST, 'no pending bumps', 'open-version-bumps').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => PENDING_BUMPS_LIST.fetch(NEWEST));
        expect(data?.bumps).toEqual([]);
      },
    ));

  it('show-project-dependencies: the inventory’s repositories, with their projects', () =>
    given(MAINTENANCE_REPOSITORIES, SOME_BEHIND, 'show-project-dependencies').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () => MAINTENANCE_REPOSITORIES.fetch({}));
        expect(error).toBeUndefined();
        // The mock answers each row with the recorded first one (a type match per element).
        const repositories = data ?? [];
        expect(repositories.length).toBeGreaterThan(0);
        expect(repositories.every((r) => !!r.name)).toBe(true);
        expect(repositories[0]?.project).toBe(projectOf(SOME_BEHIND));
      },
    ));

  it('show-project-dependencies: no repositories in an empty inventory', () =>
    given(MAINTENANCE_REPOSITORIES, NONE, 'show-project-dependencies').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => MAINTENANCE_REPOSITORIES.fetch({}));
        expect(data).toEqual([]);
      },
    ));

  it('show-project-dependencies: the internal dependencies, a pin behind', () =>
    given(MAINTENANCE_DEPENDENCIES, SOME_BEHIND, 'show-project-dependencies').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(ofKind('INTERNAL')),
        );
        expect(error).toBeUndefined();
        const pins = (data ?? []).flatMap((dependency) => dependency.pins ?? []);
        expect(pins.some((pin) => pin.pending === true)).toBe(true);
        expect(pins.every((pin) => !!pin.repository && !!pin.manifestPath)).toBe(true);
      },
    ));

  it('show-project-dependencies: the external dependencies, one with no latest and its error', () =>
    given(MAINTENANCE_DEPENDENCIES, EXTERNAL_SOME_BEHIND, 'show-project-dependencies').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(ofKind('EXTERNAL')),
        );
        expect(error).toBeUndefined();
        const unknown = (data ?? []).find((dependency) => dependency.latest == null);
        expect(unknown?.error).toBeTruthy();
        expect((data ?? []).some((d) => (d.pins ?? []).some((pin) => pin.pending))).toBe(true);
      },
    ));

  it('show-project-dependencies: no internal dependencies in an empty inventory', () =>
    given(MAINTENANCE_DEPENDENCIES, NONE, 'show-project-dependencies').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(ofKind('INTERNAL')),
        );
        expect(data).toEqual([]);
      },
    ));

  it('show-project-dependencies: no external dependencies in an empty inventory', () =>
    given(MAINTENANCE_DEPENDENCIES, NO_EXTERNAL, 'show-project-dependencies').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(ofKind('EXTERNAL')),
        );
        expect(data).toEqual([]);
      },
    ));

  it('show-project-artifacts: the inventory’s repositories, with their projects', () =>
    given(MAINTENANCE_REPOSITORIES, RELEASED, 'show-project-artifacts').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () => MAINTENANCE_REPOSITORIES.fetch({}));
        expect(error).toBeUndefined();
        const repositories = data ?? [];
        expect(repositories.length).toBeGreaterThan(0);
        expect(repositories[0]?.project).toBe(projectOf(RELEASED));
      },
    ));

  it('show-project-artifacts: no repositories when nothing was released', () =>
    given(MAINTENANCE_REPOSITORIES, NOTHING_RELEASED, 'show-project-artifacts').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => MAINTENANCE_REPOSITORIES.fetch({}));
        expect(data).toEqual([]);
      },
    ));

  it('show-project-artifacts: the released artifacts, with their SBOMs and dependents', () =>
    given(MAINTENANCE_ARTIFACTS, RELEASED, 'show-project-artifacts').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => MAINTENANCE_ARTIFACTS.fetch({}));
      expect(error).toBeUndefined();
      // The mock answers each row with the recorded first one (a type match per element).
      const artifacts = data ?? [];
      expect(artifacts.length).toBeGreaterThan(0);
      expect(
        artifacts.every((a) => !!a.ecosystem && !!a.name && !!a.repository && !!a.sbomStatus),
      ).toBe(true);
      expect(artifacts.every((a) => typeof a.behindCount === 'number')).toBe(true);
    }));

  it('show-project-artifacts: no artifacts when nothing was released', () =>
    given(MAINTENANCE_ARTIFACTS, NOTHING_RELEASED, 'show-project-artifacts').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => MAINTENANCE_ARTIFACTS.fetch({}));
        expect(data).toEqual([]);
      },
    ));

  it('show-artifact-dependents: an artifact’s dependents, direct and transitive', () =>
    given(MAINTENANCE_DEPENDENTS, RELEASED, 'show-artifact-dependents').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_DEPENDENTS.fetch(dependentsOf(RELEASED)),
        );
        expect(error).toBeUndefined();
        expect(data?.latest).toBeTruthy();
        const dependents = data?.dependents ?? [];
        expect(dependents.length).toBeGreaterThan(0);
        expect(dependents.every((d) => !!d.repository && !!d.embeddedVersion)).toBe(true);
      },
    ));

  it('show-artifact-dependents: nothing embeds an artifact when nothing was released', () =>
    given(MAINTENANCE_DEPENDENTS, NOTHING_RELEASED, 'show-artifact-dependents').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          MAINTENANCE_DEPENDENTS.fetch(dependentsOf(NOTHING_RELEASED)),
        );
        expect(data?.dependents).toEqual([]);
      },
    ));
  it('show-bump: a bump that sent a change and was released', () =>
    given(MAINTENANCE_BUMP, 'pending bumps', 'show-bump').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        MAINTENANCE_BUMP.fetch(bumpOf('pending bumps', 'releasedBumpId')),
      );
      expect(error).toBeUndefined();
      expect(data?.status).toBe('SUCCEEDED');
      expect(data?.releaseState).toBe('RELEASED');
      expect(data?.changes?.length).toBe(1);
      expect(data?.changes?.[0]?.name).toBeTruthy();
    }));

  it('show-bump: an automation bump that changed nothing', () =>
    given(MAINTENANCE_BUMP, 'a bump that changed nothing', 'show-bump').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_BUMP.fetch(bumpOf('a bump that changed nothing', 'bumpId')),
        );
        expect(error).toBeUndefined();
        expect(data?.status).toBe('NOTHING_TO_DO');
        expect(data?.changes).toEqual([]);
        expect(data?.message).toBeTruthy();
        expect(data?.failure ?? null).toBeNull();
      },
    ));

  it('show-bump: a failed bump, with its failure and its two runs', () =>
    given(MAINTENANCE_BUMP, 'a failed bump', 'show-bump').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        MAINTENANCE_BUMP.fetch(bumpOf('a failed bump', 'bumpId')),
      );
      expect(error).toBeUndefined();
      expect(data?.status).toBe('FAILED');
      expect(data?.ciRunIds).toHaveLength(2);
      expect(data?.failure?.excerpt).toBeTruthy();
      expect(typeof data?.failure?.exitCode).toBe('number');
    }));

  it('show-bump: a bump the service does not know is a 404', () =>
    // The page reads nothing of a 404's body: the interaction binds the status only.
    given({ ...MAINTENANCE_BUMP, consumes: [] }, 'no such bump', 'show-bump').executeTest(
      async (server) => {
        const { data, response } = await at(server.url, () =>
          MAINTENANCE_BUMP.fetch(bumpOf('no such bump', 'bumpId')),
        );
        expect(data).toBeUndefined();
        expect(response?.status).toBe(404);
      },
    ));

  it('show-maintenance-repository: a repository with pins of every kind and transitives', () =>
    given(MAINTENANCE_REPOSITORY, PINS_AND_BUMPS, 'show-maintenance-repository').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_REPOSITORY.fetch(named(PINS_AND_BUMPS)),
        );
        expect(error).toBeUndefined();
        expect(data?.name).toBe(repoOf(PINS_AND_BUMPS));
        expect(data?.status).toBe('OK');
        // The mock answers each row with the recorded first one (a type match per element).
        const pins = data?.pins ?? [];
        expect(pins.length).toBeGreaterThan(0);
        expect(pins.every((pin) => !!pin.name && !!pin.kind && !!pin.manifestPath)).toBe(true);
        expect(typeof pins[0]?.pending).toBe('boolean');
        expect(typeof data?.transitives?.[0]?.behind).toBe('boolean');
      },
    ));

  it('show-maintenance-repository: a repository with nothing pinned', () =>
    given(MAINTENANCE_REPOSITORY, NOTHING_PINNED, 'show-maintenance-repository').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_REPOSITORY.fetch(named(NOTHING_PINNED)),
        );
        expect(error).toBeUndefined();
        expect(data?.status).toBe('OK');
        expect(data?.pins).toEqual([]);
        expect(data?.transitives).toEqual([]);
      },
    ));

  it('show-maintenance-repository: a repository the inventory does not hold is a 404', () =>
    // The page reads nothing of a 404's body: the interaction binds the status only.
    given(
      { ...MAINTENANCE_REPOSITORY, consumes: [] },
      NO_SUCH_REPOSITORY,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data, response } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY.fetch(named(NO_SUCH_REPOSITORY)),
      );
      expect(data).toBeUndefined();
      expect(response?.status).toBe(404);
    }));

  it('show-maintenance-repository: a repository’s newest bumps', () =>
    given(MAINTENANCE_REPOSITORY_BUMPS, PINS_AND_BUMPS, 'show-maintenance-repository').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_REPOSITORY_BUMPS.fetch(bumpsOf(PINS_AND_BUMPS)),
        );
        expect(error).toBeUndefined();
        const bumps = data ?? [];
        expect(bumps.length).toBeGreaterThan(0);
        expect(bumps.every((bump) => !!bump.id && !!bump.status && !!bump.group)).toBe(true);
      },
    ));

  it('show-maintenance-repository: no bumps of a repository with nothing pinned', () =>
    given(MAINTENANCE_REPOSITORY_BUMPS, NOTHING_PINNED, 'show-maintenance-repository').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          MAINTENANCE_REPOSITORY_BUMPS.fetch(bumpsOf(NOTHING_PINNED)),
        );
        expect(data).toEqual([]);
      },
    ));

  it('show-maintenance-repository: no bumps of a repository the inventory does not hold', () =>
    given(
      MAINTENANCE_REPOSITORY_BUMPS,
      NO_SUCH_REPOSITORY,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_BUMPS.fetch(bumpsOf(NO_SUCH_REPOSITORY)),
      );
      expect(data).toEqual([]);
    }));

  it('show-maintenance-repository: who embeds what a repository publishes', () =>
    given(
      MAINTENANCE_REPOSITORY_DEPENDENTS,
      PINS_AND_BUMPS,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DEPENDENTS.fetch(named(PINS_AND_BUMPS)),
      );
      expect(error).toBeUndefined();
      const artifacts = data?.artifacts ?? [];
      expect(artifacts.length).toBeGreaterThan(0);
      expect(artifacts[0]?.latest).toBeTruthy();
      const dependents = artifacts[0]?.dependents ?? [];
      expect(dependents.length).toBeGreaterThan(0);
      expect(dependents.every((d) => !!d.repository && !!d.embeddedVersion)).toBe(true);
    }));

  it('show-maintenance-repository: nothing published by a repository with nothing pinned', () =>
    given(
      MAINTENANCE_REPOSITORY_DEPENDENTS,
      NOTHING_PINNED,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DEPENDENTS.fetch(named(NOTHING_PINNED)),
      );
      expect(data?.artifacts).toEqual([]);
    }));

  it('show-maintenance-repository: nothing published by a repository the inventory does not hold', () =>
    given(
      MAINTENANCE_REPOSITORY_DEPENDENTS,
      NO_SUCH_REPOSITORY,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DEPENDENTS.fetch(named(NO_SUCH_REPOSITORY)),
      );
      expect(data?.artifacts).toEqual([]);
    }));

  it('show-maintenance-repository: what is downstream of a repository', () =>
    given(
      MAINTENANCE_REPOSITORY_DOWNSTREAM,
      PINS_AND_BUMPS,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DOWNSTREAM.fetch(named(PINS_AND_BUMPS)),
      );
      expect(error).toBeUndefined();
      const downstream = data?.downstream ?? [];
      expect(downstream.length).toBeGreaterThan(0);
      expect(
        downstream.every((entry) => !!entry.repository && typeof entry.depth === 'number'),
      ).toBe(true);
      expect((downstream[0]?.via ?? []).length).toBeGreaterThan(0);
    }));

  it('show-maintenance-repository: nothing downstream of a repository with nothing pinned', () =>
    given(
      MAINTENANCE_REPOSITORY_DOWNSTREAM,
      NOTHING_PINNED,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DOWNSTREAM.fetch(named(NOTHING_PINNED)),
      );
      expect(data?.downstream).toEqual([]);
    }));

  it('show-maintenance-repository: nothing downstream of a repository the inventory does not hold', () =>
    given(
      MAINTENANCE_REPOSITORY_DOWNSTREAM,
      NO_SUCH_REPOSITORY,
      'show-maintenance-repository',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DOWNSTREAM.fetch(named(NO_SUCH_REPOSITORY)),
      );
      expect(data?.downstream).toEqual([]);
    }));

  it('search-project-dependencies: the inventory’s repositories, beside a matching search', () =>
    given(MAINTENANCE_REPOSITORIES, MATCHING, 'search-project-dependencies').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () => MAINTENANCE_REPOSITORIES.fetch({}));
        expect(error).toBeUndefined();
        const repositories = data ?? [];
        expect(repositories.length).toBeGreaterThan(0);
        expect(repositories[0]?.project).toBe(projectOf(MATCHING));
      },
    ));

  it('search-project-dependencies: the inventory’s repositories, beside a search matching nothing', () =>
    given(MAINTENANCE_REPOSITORIES, NONE_MATCHING, 'search-project-dependencies').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () => MAINTENANCE_REPOSITORIES.fetch({}));
        expect(error).toBeUndefined();
        expect((data ?? []).length).toBeGreaterThan(0);
      },
    ));

  it('search-project-dependencies: the internal dependencies matching a glob, a pin behind', () =>
    given(MAINTENANCE_DEPENDENCIES, MATCHING, 'search-project-dependencies').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(searched('INTERNAL', SOME_GLOB)),
        );
        expect(error).toBeUndefined();
        expect((data ?? []).length).toBeGreaterThan(0);
        const pins = (data ?? []).flatMap((dependency) => dependency.pins ?? []);
        expect(pins.some((pin) => pin.pending === true)).toBe(true);
      },
    ));

  it('search-project-dependencies: the external dependencies matching a glob, one with no latest', () =>
    given(MAINTENANCE_DEPENDENCIES, EXTERNAL_MATCHING, 'search-project-dependencies').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(searched('EXTERNAL', SOME_GLOB)),
        );
        expect(error).toBeUndefined();
        const unknown = (data ?? []).find((dependency) => dependency.latest == null);
        expect(unknown?.error).toBeTruthy();
        expect((data ?? []).some((d) => (d.pins ?? []).some((pin) => pin.pending))).toBe(true);
      },
    ));

  it('search-project-dependencies: no internal dependency matches a glob', () =>
    given(MAINTENANCE_DEPENDENCIES, NONE_MATCHING, 'search-project-dependencies').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(searched('INTERNAL', NO_GLOB)),
        );
        expect(data).toEqual([]);
      },
    ));

  it('search-project-dependencies: no external dependency matches a glob', () =>
    given(
      MAINTENANCE_DEPENDENCIES,
      NO_EXTERNAL_MATCHING,
      'search-project-dependencies',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_DEPENDENCIES.fetch(searched('EXTERNAL', NO_GLOB)),
      );
      expect(data).toEqual([]);
    }));
});
