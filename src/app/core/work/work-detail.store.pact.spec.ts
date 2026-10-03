import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { consume } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import {
  getEntity,
  listEntityComments,
  listEpicDossierAssets,
  listEpicDossierPages,
  listTicketDossierPages,
} from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import {
  GET_ENTITY,
  GET_ENTITY_UNBLOCKABLE,
  LIST_DOSSIER_PAGES,
  LIST_ENTITY_COMMENTS,
  LIST_EPIC_DOSSIER_ASSETS,
} from './work-detail.consumes';

/**
 * `WorkDetailStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-112):
 * the `getEntity`, `listEntityComments`, `listEpicDossierPages`, `listEpicDossierAssets` and
 * `listTicketDossierPages` interactions, in the same file as the other stores'
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * One detail state per archetype and per ticket type, and "an implemented ticket" (whose page the
 * action screenshots show). Each test makes ONE of the reads `WorkDetailStore.load` makes, with the
 * store's own `consumes`, against a pact mock server answering with qits-projects' golden master: a
 * path from a provider state matches any path, so one interaction per test keeps each answer to
 * its own request. `work-detail.store.spec.ts` drives `load` as a whole.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = [
  'getEntity',
  'listEntityComments',
  'listEpicDossierPages',
  'listEpicDossierAssets',
  'listTicketDossierPages',
];

const EPIC = 'an epic in detail';
const TICKETS = [
  'a bug ticket in detail',
  'an improvement ticket in detail',
  'a maintenance ticket in detail',
];
const OTHERS = [
  'a campaign in detail',
  'a campaign with a done, a verified and an implementing epic',
  'an implemented ticket',
];
const UNBLOCKABLE = ['a feature in detail', 'a task in detail'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-detail-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (state: string, operationId: string, consumes: readonly string[]) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item' },
    consumes,
  });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withFetch()), provideHeyApiClient(projectsClient)],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** `state`'s param `name` for `operationId`. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

/** The reference a state reads the item by: its qualified id, or (one state) its id. */
const refOf = (state: string, operationId: string) =>
  param(state, operationId, 'qualifiedId') ?? param(state, operationId, 'ticketId');

describe('qits-landing-app → qits-projects-service pact: work detail', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
    try {
      assertPactPart(
        join(dir, `${CONSUMER}-${PROVIDER}.json`),
        COMMITTED,
        OPERATIONS,
        'QITS_GOLDEN_UPDATE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([EPIC, ...TICKETS, ...OTHERS, ...UNBLOCKABLE])(
    'show-work-item: the item of %s',
    (state) =>
      given(
        state,
        'getEntity',
        UNBLOCKABLE.includes(state) ? GET_ENTITY_UNBLOCKABLE : GET_ENTITY,
      ).executeTest(async (server) => {
        const { data } = await at(server.url, () =>
          consume(getEntity({ path: { id: refOf(state, 'getEntity') } }), GET_ENTITY),
        );
        expect(data?.archetype).toBeTruthy();
      }),
  );

  it.each([EPIC, ...TICKETS, ...OTHERS, ...UNBLOCKABLE])(
    'show-work-item: the comments of %s',
    (state) =>
      given(state, 'listEntityComments', LIST_ENTITY_COMMENTS).executeTest(async (server) => {
        const id = refOf(state, 'listEntityComments');
        const { data, error } = await at(server.url, () =>
          consume(listEntityComments({ path: { id } }), LIST_ENTITY_COMMENTS),
        );
        expect(error).toBeUndefined();
        expect(data?.entries).toBeDefined();
      }),
  );

  it('show-work-item: the dossier pages of an epic', () =>
    given(EPIC, 'listEpicDossierPages', LIST_DOSSIER_PAGES).executeTest(async (server) => {
      const epicId = param(EPIC, 'listEpicDossierPages', 'epicId');
      const { data } = await at(server.url, () =>
        consume(listEpicDossierPages({ path: { epicId } }), LIST_DOSSIER_PAGES),
      );
      expect(data?.pages?.length).toBe(3);
    }));

  it('show-work-item: the dossier figures of an epic', () =>
    given(EPIC, 'listEpicDossierAssets', LIST_EPIC_DOSSIER_ASSETS).executeTest(async (server) => {
      const epicId = param(EPIC, 'listEpicDossierAssets', 'epicId');
      const { data } = await at(server.url, () =>
        consume(listEpicDossierAssets({ path: { epicId } }), LIST_EPIC_DOSSIER_ASSETS),
      );
      expect(data?.assets?.[0]?.url).toContain('/content');
    }));

  it.each([
    ['a bug ticket in detail', 'bugTicketId'],
    ['an improvement ticket in detail', 'improvementTicketId'],
    ['a maintenance ticket in detail', 'maintenanceTicketId'],
  ])('show-work-item: the dossier pages of %s', (state, name) =>
    given(state, 'listTicketDossierPages', LIST_DOSSIER_PAGES).executeTest(async (server) => {
      const ticketId = param(state, 'listTicketDossierPages', name);
      const { data, error } = await at(server.url, () =>
        consume(listTicketDossierPages({ path: { ticketId } }), LIST_DOSSIER_PAGES),
      );
      expect(error).toBeUndefined();
      expect(data?.pages).toBeDefined();
    }),
  );
});
