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
import { maintenanceGoldenMasters as masters } from '../../../testing/golden-masters';
import { PENDING_BUMPS } from './maintenance.consumes';
import {
  MAINTENANCE_DEPENDENCIES,
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
    consumes: op.consumes,
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
