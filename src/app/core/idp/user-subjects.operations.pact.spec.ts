import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as idpClient } from '../../api/idp/client.gen';
import { provideHeyApiClient } from '../../api/idp/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { idpGoldenMasters as masters, isRecorded } from '../../../testing/golden-masters';
import { IDP_REFUSAL } from './user-subjects.consumes';
import { USER_SUBJECTS } from './user-subjects.operations';

/**
 * qits-landing-app's pact with qits-idp-service (qits-2725, `user-subjects.operations.ts`), the
 * whole of `pacts/qits-landing-app_qits-idp-service.json`.
 *
 * - "an admin signed in to the CLI": the Toggles rule editor reads the people a USER rule can name
 *   (`show-toggle`), each account's subject and username;
 * - "a person without the admin role signed in to the CLI": the same read refused with 403, which
 *   the editor answers by offering typing alone.
 *
 * Both are recorded from `@qits/idp-golden-masters` 2026.1127.x on (qits-idp-service's qits-2725
 * release). On an older pin the whole spec skips itself, and no pact file is written, until
 * qits-maintenance bumps the pin. The bearer is the state's own `authorization`, sent as a
 * provider-state expression.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-idp-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listUserSubjects'];

const ADMIN = 'an admin signed in to the CLI';
const NOT_AN_ADMIN = 'a person without the admin role signed in to the CLI';

const RECORDED =
  isRecorded(ADMIN, USER_SUBJECTS.operationId, masters) &&
  isRecorded(NOT_AN_ADMIN, USER_SUBJECTS.operationId, masters);

/** The interaction `slug` in `state`, binding `consumes` of `operationId`'s recorded answer. */
const given = (pact: PactV4, state: string, slug: InteractionSlug, consumes: readonly string[]) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: USER_SUBJECTS.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes,
  });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(idpClient),
    ],
  });
  idpClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-idp-service pact: the user subjects', () => {
  it('declares the provider this spec binds', () => {
    expect(USER_SUBJECTS.provider).toBe(PROVIDER);
  });

  describe.skipIf(!RECORDED)('recorded by the pinned idp golden masters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qits-landing-idp-pact-'));
    const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

    afterAll(() => {
      idpClient.setConfig({ baseUrl: '' });
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

    it('show-toggle: the rule editor reads each person’s subject and username', () =>
      given(pact, ADMIN, 'show-toggle', USER_SUBJECTS.consumes).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => USER_SUBJECTS.fetch({}));
        expect(error).toBeUndefined();
        expect(data?.length).toBeGreaterThan(0);
        expect(data?.[0]?.subject).toBeTruthy();
        expect(data?.[0]?.username).toBeTruthy();
      }));

    it('show-toggle: a person without qits:admin is refused (403)', () =>
      given(pact, NOT_AN_ADMIN, 'show-toggle', IDP_REFUSAL).executeTest(async (server) => {
        const { response } = await at(server.url, () => USER_SUBJECTS.fetch({}));
        expect(response?.status).toBe(403);
      }));
  });
});
