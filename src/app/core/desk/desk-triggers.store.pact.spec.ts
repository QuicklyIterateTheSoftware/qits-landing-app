import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { LIST_DESK_TRIGGER_MESSAGES } from './desk-triggers.consumes';
import { DeskTriggersStore } from './desk-triggers.store';

/**
 * `DeskTriggersStore`'s part of qits-landing-app's pact with qits-projects-service (epic
 * qits-1604), in `pacts/qits-landing-app_qits-projects-service.json` — the same shared file
 * `projects.store.pact.spec.ts` and `release-request.store.pact.spec.ts` own other operations of
 * (see that file's comment for the convention; `assertPactPart` below is what lets several specs
 * share one committed pact).
 *
 * Two states: a window with a work item's line and a release request's (`a project whose desk
 * received a trigger message`), and one whose line names the comment that addressed the desk (`a
 * project whose desk was addressed in a comment`, qits-2039), whose `commentId` the Desk page links.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operation this spec owns in that file. */
const OPERATIONS = ['listDeskTriggerMessages'];

const STATES = [
  ['a project whose desk received a trigger message', 2],
  ['a project whose desk was addressed in a comment', 1],
] as const;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-desk-triggers-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** A store on a server platform, its client pointed at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(DeskTriggersStore);
}

describe('qits-landing-app → qits-projects-service pact: DeskTriggersStore', () => {
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

  it.each(STATES)(
    'show-project-desk: the store lists the desk trigger messages of %s, newest first',
    (state, lines) =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state,
        operationId: 'listDeskTriggerMessages',
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-project-desk' },
        consumes: LIST_DESK_TRIGGER_MESSAGES,
      }).executeTest(async (server) => {
        const projectId = masters.operation(state, 'listDeskTriggerMessages').params['projectId'];
        const store = storeAt(server.url);
        await store.load(projectId);
        const entry = store.byProject()[projectId];
        expect(entry?.status).toBe('loaded');
        expect(entry?.messages).toHaveLength(1);
        expect(entry?.messages[0]?.state).toBe('DELIVERED');
        expect(entry?.messages[0]?.events).toHaveLength(lines);
      }),
  );
});
