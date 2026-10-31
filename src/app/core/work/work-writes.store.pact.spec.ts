import { PLATFORM_ID } from '@angular/core';
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
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { CREATE_WORK, REPRIORITIZE_WORK } from './work-writes.consumes';
import { WorkWritesStore } from './work-writes.store';

/**
 * `WorkWritesStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-888),
 * in `pacts/qits-landing-app_qits-projects-service.json` beside the other stores' parts:
 * `createWork` from "a project with no work" (a bug ticket with its impetus), driven through the
 * store's `create` with what the recording sent; `reprioritizeWork` from "three reported tickets,
 * one with a priority" (qits-753: the third ticket dropped directly below the first), driven
 * through the store's `reprioritize`.
 *
 * Not bound yet: a create naming an idea (`inspiredBy`) and `patchWork` setting or clearing it.
 * qits-projects records neither, so the work item page's inspiration and the form's `inspiredBy`
 * are covered by the plain specs only; an interaction follows the recording.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = ['createWork', 'reprioritizeWork'];

const NO_WORK = 'a project with no work';
const RANKED = 'three reported tickets, one with a priority';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-writes-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(WorkWritesStore);
}

describe('qits-landing-app → qits-projects-service pact: work writes', () => {
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

  it('create-work-item: a bug ticket with its impetus', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: NO_WORK,
      operationId: 'createWork',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'create-work-item' },
      consumes: CREATE_WORK,
    }).executeTest(async (server) => {
      // The body as the recording sent it, its project included: the provider's verification fills
      // in `{projectId}` from the state's params.
      const sent = masters.operation(NO_WORK, 'createWork').body as Record<string, string>;
      const outcome = await storeAt(server.url).create({
        archetype: 'TICKET',
        project: sent['project'],
        title: sent['title'],
        ticketType: sent['ticketType'],
        impetus: sent['impetus'],
      });
      expect(outcome.ok && outcome.value.qualifiedId).toBeTruthy();
    }));

  it('reprioritize-work-item: a ticket dropped directly below a sibling', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: RANKED,
      operationId: 'reprioritizeWork',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'reprioritize-work-item' },
      consumes: REPRIORITIZE_WORK,
    }).executeTest(async (server) => {
      // The anchor as the recording sent it: the provider's verification fills in `{anchor}` from
      // the state's params.
      const { params, body } = masters.operation(RANKED, 'reprioritizeWork');
      const sent = body as Record<string, string>;
      const outcome = await storeAt(server.url).reprioritize(
        params['projectId'],
        params['qualifiedId'],
        { below: sent['below'] },
      );
      expect(outcome.ok && outcome.value.items?.length).toBeGreaterThan(0);
    }));
});
