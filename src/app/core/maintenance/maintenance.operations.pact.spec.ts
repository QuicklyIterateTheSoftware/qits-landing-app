import { repositoryArtifacts } from '$core/repositories/repository-artifacts';
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
import { PENDING_BUMPS, REPOSITORY_BUMPS_LIMIT } from './maintenance.consumes';
import {
  MAINTENANCE_ADOPTION,
  MAINTENANCE_ARTIFACTS,
  MAINTENANCE_BUMP,
  MAINTENANCE_DEPENDENCIES,
  MAINTENANCE_DEPENDENTS,
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
 * A repository's page (qits-2478) reads the released artifacts, keeping the repository's own: a
 * project that has released artifacts ("released artifacts, some behind") and none ("no released
 * artifacts"), each as the page's screenshots show it.
 *
 * A repository's bump page (qits-2332, under the repository since qits-2489) reads one bump by its id (`getBump`): a GROUP bump that succeeded,
 * sent one change and was RELEASED ("pending bumps", its `releasedBumpId`), an automation bump
 * that changed nothing ("a bump that changed nothing"), a FAILED automation bump with its failure
 * and two CI runs ("a failed bump"), and an id the service does not know ("no such bump", a 404
 * binding the status only: the page reads nothing of the body).
 *
 * Its Depends on and Dependents pages (qits-2489, qits-2334's repository page split in two) read
 * one repository by its name (`repoName`) four ways: Depends on the repository with its pins and
 * transitives (`getRepository`) and its newest 20 bumps (`listBumps?repository=&limit=20`, which
 * the golden master records and the interaction requires), Dependents who embeds what it
 * publishes (`listRepositoryDependents`) and its downstream closure (`getRepositoryDownstream`).
 * Each in three states: internal, external, REACTOR and UNRESOLVED
 * pins, some pending, a behind transitive, a RUNNING, a SUCCEEDED and a NOTHING_TO_DO bump, one
 * published artifact with a current and a behind dependent, a two-level downstream ("a repository
 * with pins and bumps"); an OK repository with nothing at all ("a repository with nothing
 * pinned"); and a name the inventory does not hold ("no such repository": `getRepository` a 404
 * binding the status only, the other three empty answers).
 *
 * Its adoption page (qits-2333) reads how far one release got (`getAdoptionByRelease`,
 * `?repository=&version=`, which the golden masters record and the interactions require): a
 * release whose two downstream repositories are both still PENDING ("a repository with downstream
 * components", at its fixed version 2026.905.1), one some consumers ADOPTED, with a repository two
 * parents reach ("a release some consumers adopted"), and one nobody consumes ("a release nobody
 * consumes", `adopters: []`; both from `@qits/maintenance-golden-masters` 2026.1119.183438 on). A
 * field under a recorded `null` (a PENDING adopter's `adoptedVersion` and
 * `adoptedAt`) is bound as that `null` (`heldBy` keeps a path the recording holds). The Dependents
 * page reads the newest release's journey the same way, counting its adopters ("a release some
 * consumers adopted").
 *
 * The Mirror section's repository page (qits-2488) reads, for a cached package, which of our
 * releases embed it (`listDependencyDependents`: "an external package our releases embed", npm
 * `left-pad` at two versions; "released artifacts, some behind", an artifact of each kind; "no
 * released artifacts", none) and which repositories pin it (`listDependencies?kind=EXTERNAL&name=`:
 * the same `left-pad` state; the external glob states, matching and not), as its screenshots show
 * them. The `left-pad` state is recorded from qits-maintenance's qits-2488 release on.
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

const EXTERNAL_MATCHING = 'external dependencies matching a glob, some behind';
const NO_EXTERNAL_MATCHING = 'no external dependencies matching a glob';
/** The globs the searched states record: one that matches, one that matches nothing. */
const SOME_GLOB = '*p*';
const NO_GLOB = 'nothing-matches-*';

/** The mirror page's request for the dependencies of `kind` whose name matches `name`. */
const searched = (kind: 'INTERNAL' | 'EXTERNAL', name: string) => ({ query: { kind, name } });

const RELEASED = 'released artifacts, some behind';

/** An external npm package two releases embed and two repositories pin (qits-2488). */
const EMBEDDED = 'an external package our releases embed';
/** The package {@link EMBEDDED} is about, as the mirror page asks for it. */
const EMBEDDED_PACKAGE = 'left-pad';
const NOTHING_RELEASED = 'no released artifacts';

/** The mirror page's request for the artifact `state` recorded the dependents of. */
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

  it('show-repository: the released artifacts, kept by the repository that publishes them', () =>
    given(MAINTENANCE_ARTIFACTS, RELEASED, 'show-repository').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => MAINTENANCE_ARTIFACTS.fetch({}));
      expect(error).toBeUndefined();
      // The mock answers each row with the recorded first one (a type match per element).
      const artifacts = data ?? [];
      expect(artifacts.length).toBeGreaterThan(0);
      const repository = artifacts[0]?.repository ?? '';
      expect(repositoryArtifacts(artifacts, repository).length).toBeGreaterThan(0);
      expect(repositoryArtifacts(artifacts, 'no-such-repository')).toEqual([]);
    }));

  it('show-repository: no artifacts when nothing was released', () =>
    given(MAINTENANCE_ARTIFACTS, NOTHING_RELEASED, 'show-repository').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => MAINTENANCE_ARTIFACTS.fetch({}));
        expect(data).toEqual([]);
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

  it('show-repository-depends-on: a repository with pins of every kind and transitives', () =>
    given(MAINTENANCE_REPOSITORY, PINS_AND_BUMPS, 'show-repository-depends-on').executeTest(
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

  it('show-repository-depends-on: a repository with nothing pinned', () =>
    given(MAINTENANCE_REPOSITORY, NOTHING_PINNED, 'show-repository-depends-on').executeTest(
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

  it('show-repository-depends-on: a repository the inventory does not hold is a 404', () =>
    // The page reads nothing of a 404's body: the interaction binds the status only.
    given(
      { ...MAINTENANCE_REPOSITORY, consumes: [] },
      NO_SUCH_REPOSITORY,
      'show-repository-depends-on',
    ).executeTest(async (server) => {
      const { data, response } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY.fetch(named(NO_SUCH_REPOSITORY)),
      );
      expect(data).toBeUndefined();
      expect(response?.status).toBe(404);
    }));

  it('show-repository-depends-on: a repository’s newest bumps', () =>
    given(MAINTENANCE_REPOSITORY_BUMPS, PINS_AND_BUMPS, 'show-repository-depends-on').executeTest(
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

  it('show-repository-depends-on: no bumps of a repository with nothing pinned', () =>
    given(MAINTENANCE_REPOSITORY_BUMPS, NOTHING_PINNED, 'show-repository-depends-on').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          MAINTENANCE_REPOSITORY_BUMPS.fetch(bumpsOf(NOTHING_PINNED)),
        );
        expect(data).toEqual([]);
      },
    ));

  it('show-repository-depends-on: no bumps of a repository the inventory does not hold', () =>
    given(
      MAINTENANCE_REPOSITORY_BUMPS,
      NO_SUCH_REPOSITORY,
      'show-repository-depends-on',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_BUMPS.fetch(bumpsOf(NO_SUCH_REPOSITORY)),
      );
      expect(data).toEqual([]);
    }));

  it('show-repository-dependents: who embeds what a repository publishes', () =>
    given(
      MAINTENANCE_REPOSITORY_DEPENDENTS,
      PINS_AND_BUMPS,
      'show-repository-dependents',
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

  it('show-repository-dependents: nothing published by a repository with nothing pinned', () =>
    given(
      MAINTENANCE_REPOSITORY_DEPENDENTS,
      NOTHING_PINNED,
      'show-repository-dependents',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DEPENDENTS.fetch(named(NOTHING_PINNED)),
      );
      expect(data?.artifacts).toEqual([]);
    }));

  it('show-repository-dependents: nothing published by a repository the inventory does not hold', () =>
    given(
      MAINTENANCE_REPOSITORY_DEPENDENTS,
      NO_SUCH_REPOSITORY,
      'show-repository-dependents',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DEPENDENTS.fetch(named(NO_SUCH_REPOSITORY)),
      );
      expect(data?.artifacts).toEqual([]);
    }));

  it('show-repository-dependents: what is downstream of a repository', () =>
    given(
      MAINTENANCE_REPOSITORY_DOWNSTREAM,
      PINS_AND_BUMPS,
      'show-repository-dependents',
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

  it('show-repository-dependents: nothing downstream of a repository with nothing pinned', () =>
    given(
      MAINTENANCE_REPOSITORY_DOWNSTREAM,
      NOTHING_PINNED,
      'show-repository-dependents',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DOWNSTREAM.fetch(named(NOTHING_PINNED)),
      );
      expect(data?.downstream).toEqual([]);
    }));

  it('show-repository-dependents: nothing downstream of a repository the inventory does not hold', () =>
    given(
      MAINTENANCE_REPOSITORY_DOWNSTREAM,
      NO_SUCH_REPOSITORY,
      'show-repository-dependents',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_REPOSITORY_DOWNSTREAM.fetch(named(NO_SUCH_REPOSITORY)),
      );
      expect(data?.downstream).toEqual([]);
    }));

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

  it('show-adoption: a release some consumers adopted, one repository two parents reach', () =>
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
    }));

  it('show-adoption: a release nobody consumes', () =>
    given(MAINTENANCE_ADOPTION, NOBODY, 'show-adoption').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        MAINTENANCE_ADOPTION.fetch(releaseOf(NOBODY)),
      );
      expect(error).toBeUndefined();
      expect(data?.packages?.length).toBeGreaterThan(0);
      expect(data?.adopters).toEqual([]);
    }));

  it('show-repository-dependents: how far the newest release got, some consumers adopted', () =>
    given(MAINTENANCE_ADOPTION, ADOPTED, 'show-repository-dependents').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_ADOPTION.fetch(releaseOf(ADOPTED)),
        );
        expect(error).toBeUndefined();
        // The page counts the adopters and those ADOPTED, nothing more.
        const adopters = data?.adopters ?? [];
        expect(adopters.length).toBeGreaterThan(0);
        expect(adopters.every((a) => !!a.state)).toBe(true);
      },
    ));

  // The Mirror section's repository page (qits-2488): below a cached package's versions, which of
  // our releases embed it (`listDependencyDependents?ecosystem=&name=`) and which repositories pin
  // it (`listDependencies?kind=EXTERNAL&name=`, the name or an image's glob). "an external package
  // our releases embed" is recorded from qits-maintenance's qits-2488 release on, and its two
  // interactions skip themselves on an older pin.
  it.skipIf(!isRecorded(EMBEDDED, MAINTENANCE_DEPENDENTS.operationId, masters))(
    'show-mirror-package-releases: an external package two releases embed, at two versions',
    () =>
      given(MAINTENANCE_DEPENDENTS, EMBEDDED, 'show-mirror-package-releases').executeTest(
        async (server) => {
          const { data, error } = await at(server.url, () =>
            MAINTENANCE_DEPENDENTS.fetch(dependentsOf(EMBEDDED)),
          );
          expect(error).toBeUndefined();
          expect(data?.name).toBe(EMBEDDED_PACKAGE);
          const dependents = data?.dependents ?? [];
          expect(dependents.length).toBeGreaterThan(0);
          expect(dependents.every((d) => !!d.artifactName && !!d.embeddedVersion)).toBe(true);
        },
      ),
  );

  it('show-mirror-package-releases: released artifacts of each kind embed a package', () =>
    given(MAINTENANCE_DEPENDENTS, RELEASED, 'show-mirror-package-releases').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_DEPENDENTS.fetch(dependentsOf(RELEASED)),
        );
        expect(error).toBeUndefined();
        const dependents = data?.dependents ?? [];
        expect(dependents.length).toBeGreaterThan(0);
        expect(dependents.every((d) => !!d.artifactEcosystem && !!d.artifactName)).toBe(true);
      },
    ));

  it('show-mirror-package-releases: no release embeds a package', () =>
    given(MAINTENANCE_DEPENDENTS, NOTHING_RELEASED, 'show-mirror-package-releases').executeTest(
      async (server) => {
        const { data } = await at(server.url, () =>
          MAINTENANCE_DEPENDENTS.fetch(dependentsOf(NOTHING_RELEASED)),
        );
        expect(data?.dependents).toEqual([]);
      },
    ));

  it.skipIf(!isRecorded(EMBEDDED, MAINTENANCE_DEPENDENCIES.operationId, masters))(
    'show-mirror-package-releases: two repositories pin an external package, one behind',
    () =>
      given(MAINTENANCE_DEPENDENCIES, EMBEDDED, 'show-mirror-package-releases').executeTest(
        async (server) => {
          const { data, error } = await at(server.url, () =>
            MAINTENANCE_DEPENDENCIES.fetch(searched('EXTERNAL', EMBEDDED_PACKAGE)),
          );
          expect(error).toBeUndefined();
          const pins = (data ?? []).flatMap((dependency) => dependency.pins ?? []);
          expect(pins.length).toBeGreaterThan(0);
          expect(pins.every((pin) => !!pin.repository && !!pin.version)).toBe(true);
        },
      ),
  );

  it('show-mirror-package-releases: an image’s glob matches external pins', () =>
    given(MAINTENANCE_DEPENDENCIES, EXTERNAL_MATCHING, 'show-mirror-package-releases').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          MAINTENANCE_DEPENDENCIES.fetch(searched('EXTERNAL', SOME_GLOB)),
        );
        expect(error).toBeUndefined();
        expect((data ?? []).length).toBeGreaterThan(0);
      },
    ));

  it('show-mirror-package-releases: no repository pins a package', () =>
    given(
      MAINTENANCE_DEPENDENCIES,
      NO_EXTERNAL_MATCHING,
      'show-mirror-package-releases',
    ).executeTest(async (server) => {
      const { data } = await at(server.url, () =>
        MAINTENANCE_DEPENDENCIES.fetch(searched('EXTERNAL', NO_GLOB)),
      );
      expect(data).toEqual([]);
    }));
});
