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
import {
  heldBy,
  isRecorded,
  maintenanceGoldenMasters as masters,
} from '../../../testing/golden-masters';
import { PENDING_BUMPS } from './maintenance.consumes';
import {
  MAINTENANCE_ADOPTION,
  MAINTENANCE_ARTIFACTS,
  MAINTENANCE_BUMP,
  MAINTENANCE_DEPENDENCIES,
  MAINTENANCE_DEPENDENTS,
  MAINTENANCE_REPOSITORIES,
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
 * Its name search (qits-2331) reads the same dependencies of each kind with the searched glob
 * (`?kind=…&name=…`): a glob some of the project's dependencies match (`*p*`: "dependencies
 * matching a glob, some behind", "external dependencies matching a glob, some behind") and one
 * nothing matches (`nothing-matches-*`: "no dependencies matching a glob", "no external
 * dependencies matching a glob"), the inventory's repositories read beside each in the internal
 * state, as the page's searched screenshots show them.
 *
 * Its adoption page (qits-2333) reads how far one release got (`getAdoptionByRelease`,
 * `?repository=&version=`, which the golden masters record and the interactions require): a
 * release whose two downstream repositories are both still PENDING ("a repository with downstream
 * components", at its fixed version 2026.905.1), one some consumers ADOPTED, with a repository two
 * parents reach ("a release some consumers adopted"), and one nobody consumes ("a release nobody
 * consumes", `adopters: []`). The last two are recorded from a later qits-maintenance release than
 * the pinned `@qits/maintenance-golden-masters`: their interactions skip themselves until the pin
 * reaches them. A field under a recorded `null` (a PENDING adopter's `adoptedVersion` and
 * `adoptedAt`) is bound as that `null` (`heldBy` keeps a path the recording holds).
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

const DOWNSTREAM = 'a repository with downstream components';
const ADOPTED = 'a release some consumers adopted';
const NOBODY = 'a release nobody consumes';

/** The release `state` recorded its adoption for (its `repoName`, and `version` or the fixed one). */
const releaseOf = (state: string) => {
  const { query, params } = masters.operation(state, MAINTENANCE_ADOPTION.operationId);
  const resolved = (value: string) => value.replace(/\{(\w+)}/g, (_, name: string) => params[name]);
  return {
    query: { repository: resolved(query['repository']), version: resolved(query['version']) },
  };
};

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

  it('show-adoption: a release both its downstream repositories are still waiting for', () =>
    given(MAINTENANCE_ADOPTION, DOWNSTREAM, 'show-adoption').executeTest(async (server) => {
      const request = releaseOf(DOWNSTREAM);
      expect(request.query).toEqual({ repository: 'contract-ui-jslib', version: '2026.905.1' });
      const { data, error } = await at(server.url, () => MAINTENANCE_ADOPTION.fetch(request));
      expect(error).toBeUndefined();
      expect(data?.repository).toBe(request.query.repository);
      expect(data?.version).toBe(request.query.version);
      expect(data?.packages?.[0]?.ecosystem).toBe('npm');
      // The mock answers each row with the recorded first one (a type match per element).
      const adopters = data?.adopters ?? [];
      expect(adopters).toHaveLength(2);
      expect(adopters.every((a) => a.state === 'PENDING' && typeof a.depth === 'number')).toBe(
        true,
      );
      expect(adopters.every((a) => (a.via ?? []).length > 0)).toBe(true);
      expect(adopters.every((a) => a.adoptedVersion === null && a.adoptedAt === null)).toBe(true);
    }));

  it.skipIf(!isRecorded(ADOPTED, MAINTENANCE_ADOPTION.operationId, masters))(
    'show-adoption: a release some consumers adopted, one repository two parents reach',
    () =>
      given(MAINTENANCE_ADOPTION, ADOPTED, 'show-adoption').executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_ADOPTION.fetch(releaseOf(ADOPTED)),
        );
        expect(error).toBeUndefined();
        // The mock answers each row with the recorded first one (a type match per element).
        const adopters = data?.adopters ?? [];
        expect(adopters).toHaveLength(3);
        expect(adopters.every((a) => !!a.repository && !!a.state)).toBe(true);
        expect(adopters.every((a) => (a.via ?? []).length > 0)).toBe(true);
      }),
  );

  it.skipIf(!isRecorded(NOBODY, MAINTENANCE_ADOPTION.operationId, masters))(
    'show-adoption: a release nobody consumes',
    () =>
      given(MAINTENANCE_ADOPTION, NOBODY, 'show-adoption').executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_ADOPTION.fetch(releaseOf(NOBODY)),
        );
        expect(error).toBeUndefined();
        expect(data?.packages?.length).toBeGreaterThan(0);
        expect(data?.adopters).toEqual([]);
      }),
  );

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
