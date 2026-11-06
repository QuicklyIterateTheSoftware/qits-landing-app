import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { LIST_PROJECT_WORK_BRIEFS } from './work-briefs.consumes';
import { workBriefSource } from './work-briefs.store';

/**
 * `workBriefSource`'s part of qits-landing-app's pact with qits-projects-service (qits-1897): the
 * `listProjectWorkBriefs` interaction, in the same file as the other stores'
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * The test asks for the briefs of the golden master's ticket, epic and an id the project does not
 * know, in that order and as one comma-separated `id`, as `QitsWorkBriefs` batches the ids of one
 * view, against a pact mock server answering with qits-projects' golden master "a project with
 * work to brief", binding only the fields in `LIST_PROJECT_WORK_BRIEFS`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listProjectWorkBriefs'];
const STATE = 'a project with work to brief';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-briefs-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-projects-service pact: work briefs', () => {
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

  it('show-commit-work-briefs: the source reads the briefs of the ids a commit subject names', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'listProjectWorkBriefs',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-commit-work-briefs' },
      consumes: LIST_PROJECT_WORK_BRIEFS,
    }).executeTest(async (server) => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(withFetch()), provideHeyApiClient(projectsClient)],
      });
      projectsClient.setConfig({ baseUrl: server.url });
      const params = masters.operation(STATE, 'listProjectWorkBriefs').params;
      const briefs = await TestBed.runInInjectionContext(() =>
        workBriefSource(params['projectId'], [
          params['ticketQualifiedId'],
          params['epicQualifiedId'],
          params['unknownQualifiedId'],
        ]),
      );
      // The unknown id is left out of the answer: two briefs, the ticket's first. The mock server
      // answers each element of a list matched by type with the recording's first one, so the
      // second element is not the epic here.
      expect(briefs).toHaveLength(2);
      expect(briefs[0].qualifiedId).toBe(params['ticketQualifiedId']);
      expect(briefs[0].status).toBeTruthy();
      expect(briefs[0].title).toBeTruthy();
      expect(briefs[0].updatedAt).toBeTruthy();
    }));
});
