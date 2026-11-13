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
import { DESK_TRIGGER_MESSAGES } from './desk.operations';

/**
 * The desk operations' part of qits-landing-app's pact with qits-projects-service (epic
 * qits-1604, `desk.operations.ts`), in `pacts/qits-landing-app_qits-projects-service.json` — the same shared file
 * `projects.operations.pact.spec.ts` and `release-request.operations.pact.spec.ts` own other
 * operations of (see that file's comment for the convention; `assertPactPart` below is what lets several specs
 * share one committed pact).
 *
 * Two states: a window with a work item's line and a release request's (`a project whose desk
 * received a trigger message`), and one whose line names the comment that addressed the desk (`a
 * project whose desk was addressed in a comment`, qits-2039), whose `commentId` the Desk page links.
 *
 * Moved here from `DeskTriggersStore`'s pact spec when the store went (qits-2146), unchanged: the
 * same descriptions, states, requests and bound fields. Each test runs `DESK_TRIGGER_MESSAGES`'
 * own `fetch`; the interaction's `operationId` and `consumes` are the operation's.
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

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-projects-service pact: the desk operations', () => {
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

  it('declares the provider this spec binds', () =>
    expect(DESK_TRIGGER_MESSAGES.provider).toBe(PROVIDER));

  it.each(STATES)(
    'show-project-desk: the store lists the desk trigger messages of %s, newest first',
    (state, lines) =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state,
        operationId: DESK_TRIGGER_MESSAGES.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-project-desk' },
        consumes: DESK_TRIGGER_MESSAGES.consumes,
      }).executeTest(async (server) => {
        const projectId = masters.operation(state, 'listDeskTriggerMessages').params['projectId'];
        const { data, error } = await at(server.url, () =>
          DESK_TRIGGER_MESSAGES.fetch({ path: { projectId } }),
        );
        expect(error).toBeUndefined();
        expect(data?.messages).toHaveLength(1);
        expect(data?.messages?.[0]?.state).toBe('DELIVERED');
        expect(data?.messages?.[0]?.events).toHaveLength(lines);
      }),
  );
});
