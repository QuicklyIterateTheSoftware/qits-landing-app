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
import { LIST_ARCHETYPES } from './archetypes.consumes';
import { ArchetypesStore } from './archetypes.store';

/**
 * `ArchetypesStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-112):
 * the `listArchetypes` interaction, in the same file as the other stores'
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * The test drives `load()`, as the work item page does, against a pact mock server answering with
 * qits-projects' golden master, binding only the fields in `archetypes.consumes.ts`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listArchetypes'];
const STATE = 'the archetype registry';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-archetypes-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-projects-service pact: archetypes', () => {
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

  it('show-work-item-actions: the store loads the archetype registry', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'listArchetypes',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item-actions' },
      consumes: LIST_ARCHETYPES,
    }).executeTest(async (server) => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(withFetch()), provideHeyApiClient(projectsClient)],
      });
      projectsClient.setConfig({ baseUrl: server.url });
      const store = TestBed.inject(ArchetypesStore);
      await store.load();
      expect(store.status()).toBe('loaded');
      expect(store.of('EPIC')?.transitions?.['REPORTED']?.length).toBeGreaterThan(0);
    }));
});
