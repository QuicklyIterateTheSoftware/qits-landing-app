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
 * **Skipped today, named individually rather than failing the file** (the
 * `qits-system-frontend`/`qits-system-service` `targets-api.pact.spec.ts` carries the identical
 * pattern for a module ahead of its own pinned package). qits-projects-service's
 * `GET /projects/api/projects/{projectId}/desk-triggers` (`listDeskTriggerMessages`) and its
 * provider state `a project whose desk received a trigger message` are committed on that
 * repository's own `epic/qits-1604` branch
 * (`golden-masters/a-project-whose-desk-received-a-trigger-message/listDeskTriggerMessages.json`,
 * `golden-masters/index.json`) but have not reached a release yet, so
 * `@qits/projects-golden-masters` — a devDependency, pinned here at 2026.1025.140312 — does not
 * carry the state. `recorded()` reads that straight off the installed package, so once a release
 * publishes the state this test starts running on its own: no other edit, because every path below
 * was read from that already-committed fixture.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operation this spec owns in that file. */
const OPERATIONS = ['listDeskTriggerMessages'];

const STATE = 'a project whose desk received a trigger message';

/** Whether `state`/`operationId` is recorded in the `@qits/projects-golden-masters` this run resolved. */
function recorded(state: string, operationId: string): boolean {
  try {
    masters.operation(state, operationId);
    return true;
  } catch {
    return false;
  }
}

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
    if (!recorded(STATE, 'listDeskTriggerMessages')) {
      // Nothing was recorded against this run (see the file comment above) — nothing to compare
      // or write. Cleaning the scratch dir is still worth doing.
      rmSync(dir, { recursive: true, force: true });
      return;
    }
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

  it.skipIf(!recorded(STATE, 'listDeskTriggerMessages'))(
    'show-project-desk: the store lists the project’s desk trigger messages, newest first',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: STATE,
        operationId: 'listDeskTriggerMessages',
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-project-desk' },
        consumes: LIST_DESK_TRIGGER_MESSAGES,
      }).executeTest(async (server) => {
        const projectId = '00000000-0000-4000-8000-000000000001';
        const store = storeAt(server.url);
        await store.load(projectId);
        const entry = store.byProject()[projectId];
        expect(entry?.status).toBe('loaded');
        expect(entry?.messages).toHaveLength(1);
        expect(entry?.messages[0]?.state).toBe('DELIVERED');
        expect(entry?.messages[0]?.events).toHaveLength(2);
      }),
  );
});
