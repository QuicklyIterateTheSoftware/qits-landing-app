import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as togglesClient } from '../../api/toggles/client.gen';
import { provideHeyApiClient } from '../../api/toggles/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { togglesGoldenMasters as masters } from '../../../testing/golden-masters';
import { STATUS_ONLY, TOGGLE_REFUSAL } from './toggles.consumes';
import { TOGGLE_DETAIL, TOGGLE_LIST, TOGGLE_RULES_SAVE } from './toggles.operations';

/**
 * qits-landing-app's pact with qits-toggles-service (qits-2704, `toggles.operations.ts`), the whole
 * of `pacts/qits-landing-app_qits-toggles-service.json`.
 *
 * - "a toggle is declared, asked by an admin": the Toggles page's list (`show-toggles`), the rule
 *   editor's read (`show-toggle`) and a save (`save-toggle-rules`, the recorded list: a USER, a TIME
 *   and the STATIC rule), answered with the toggle at its next version; never used by a deployed
 *   pact, no removal ticket (both `null`);
 * - "a toggle has an open removal ticket, asked by an admin" (qits-2726): the same list and read,
 *   the toggle last used at a frozen instant and its removal ticket `qits-1`;
 * - "a toggle is declared, sent malformed rules by an admin": a save refused with 400, naming the
 *   rule at fault (`position`);
 * - "a toggle is declared, asked by an agent": a save refused with 403 (no body);
 * - "a toggle's rules changed since an admin read them": a save refused with 409;
 * - "a toggle slug is not declared": the editor's read of an undeclared slug, 404.
 *
 * Each test runs the operation's own `fetch`, sending the recorded request; the slug in a path is
 * the state's param, sent as a provider-state expression.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-toggles-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['getToggles', 'getToggle', 'putToggleRules'];

const ADMIN = 'a toggle is declared, asked by an admin';
const MALFORMED = 'a toggle is declared, sent malformed rules by an admin';
const AGENT = 'a toggle is declared, asked by an agent';
const STALE = "a toggle's rules changed since an admin read them";
const UNDECLARED = 'a toggle slug is not declared';
const RETIRING = 'a toggle has an open removal ticket, asked by an admin';

/** A state's param, as the recording names it. */
const param = (state: string, operationId: string, name: string): string =>
  masters.operation(state, operationId).params[name];

/** A recorded request body, as the provider replays it. */
const sent = <T>(state: string, operationId: string): T =>
  masters.operation(state, operationId).body as T;

/** The interaction `slug` in `state`, binding `consumes` of `operationId`'s recorded answer. */
const given = (
  state: string,
  operationId: string,
  slug: InteractionSlug,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes,
  });

type SaveBody = Parameters<typeof TOGGLE_RULES_SAVE.fetch>[0]['body'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-toggles-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(togglesClient),
    ],
  });
  togglesClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-toggles-service pact: the toggles', () => {
  afterAll(() => {
    togglesClient.setConfig({ baseUrl: '' });
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

  it('declares the provider this spec binds, on every operation', () => {
    for (const operation of [TOGGLE_LIST, TOGGLE_DETAIL, TOGGLE_RULES_SAVE]) {
      expect(operation.provider).toBe(PROVIDER);
    }
  });

  it('show-toggles: the Toggles page lists the declared toggles and their rules', () =>
    given(ADMIN, 'getToggles', 'show-toggles', TOGGLE_LIST.consumes).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TOGGLE_LIST.fetch({}));
      expect(error).toBeUndefined();
      expect(data?.[0]?.slug).toBe('toggles-smoke');
      expect(data?.[0]?.rules?.map((rule) => rule.kind)).toEqual(['STATIC']);
      expect(data?.[0]?.lastUsedAt).toBeNull();
      expect(data?.[0]?.removalTicket).toBeNull();
    }));

  it('show-toggle: the rule editor reads the toggle, its rules and its version', () =>
    given(ADMIN, 'getToggle', 'show-toggle', TOGGLE_DETAIL.consumes).executeTest(async (server) => {
      const slug = param(ADMIN, 'getToggle', 'slug');
      const { data, error } = await at(server.url, () => TOGGLE_DETAIL.fetch({ path: { slug } }));
      expect(error).toBeUndefined();
      expect(data?.slug).toBe('toggles-smoke');
      expect(data?.version).toBe(0);
      expect(data?.rules).toEqual([
        { kind: 'STATIC', value: false, userSubjects: null, afterInstant: null },
      ]);
      expect(data?.lastUsedAt).toBeNull();
      expect(data?.removalTicket).toBeNull();
    }));

  it('show-toggles: the list shows when a deployed pact last used a toggle and its removal ticket', () =>
    given(RETIRING, 'getToggles', 'show-toggles', TOGGLE_LIST.consumes).executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () => TOGGLE_LIST.fetch({}));
        expect(error).toBeUndefined();
        expect(data?.[0]?.slug).toBe('toggles-smoke');
        expect(data?.[0]?.lastUsedAt).toBe('2026-01-01T00:00:00Z');
        expect(data?.[0]?.removalTicket).toBe('qits-1');
      },
    ));

  it('show-toggle: the rule editor shows the last use and the open removal ticket', () =>
    given(RETIRING, 'getToggle', 'show-toggle', TOGGLE_DETAIL.consumes).executeTest(
      async (server) => {
        const slug = param(RETIRING, 'getToggle', 'slug');
        const { data, error } = await at(server.url, () => TOGGLE_DETAIL.fetch({ path: { slug } }));
        expect(error).toBeUndefined();
        expect(data?.lastUsedAt).toBe('2026-01-01T00:00:00Z');
        expect(data?.removalTicket).toBe('qits-1');
      },
    ));

  it('show-toggle: an undeclared slug answers 404', () =>
    given(UNDECLARED, 'getToggle', 'show-toggle', TOGGLE_REFUSAL).executeTest(async (server) => {
      const slug = param(UNDECLARED, 'getToggle', 'slug');
      const { response, error } = await at(server.url, () =>
        TOGGLE_DETAIL.fetch({ path: { slug } }),
      );
      expect(response?.status).toBe(404);
      expect((error as { error?: string } | undefined)?.error).toContain(slug);
    }));

  it('save-toggle-rules: Save replaces the whole list, answered at the next version', () =>
    given(ADMIN, 'putToggleRules', 'save-toggle-rules', TOGGLE_RULES_SAVE.consumes).executeTest(
      async (server) => {
        const slug = param(ADMIN, 'putToggleRules', 'slug');
        const body = sent<SaveBody>(ADMIN, 'putToggleRules');
        const { data, error } = await at(server.url, () =>
          TOGGLE_RULES_SAVE.fetch({ path: { slug }, body }),
        );
        expect(error).toBeUndefined();
        expect(data?.version).toBe(1);
        expect(data?.rules?.map((rule) => rule.kind)).toEqual(['USER', 'TIME', 'STATIC']);
      },
    ));

  it('save-toggle-rules: a malformed list answers 400, naming the rule at fault', () =>
    given(MALFORMED, 'putToggleRules', 'save-toggle-rules', TOGGLE_REFUSAL).executeTest(
      async (server) => {
        const slug = param(MALFORMED, 'putToggleRules', 'slug');
        const body = sent<SaveBody>(MALFORMED, 'putToggleRules');
        const { response, error } = await at(server.url, () =>
          TOGGLE_RULES_SAVE.fetch({ path: { slug }, body }),
        );
        expect(response?.status).toBe(400);
        expect((error as { position?: number } | undefined)?.position).toBe(0);
      },
    ));

  it('save-toggle-rules: a caller without qits:admin or the desk is refused, 403', () =>
    given(AGENT, 'putToggleRules', 'save-toggle-rules', STATUS_ONLY).executeTest(async (server) => {
      const slug = param(AGENT, 'putToggleRules', 'slug');
      const body = sent<SaveBody>(AGENT, 'putToggleRules');
      const { response } = await at(server.url, () =>
        TOGGLE_RULES_SAVE.fetch({ path: { slug }, body }),
      );
      expect(response?.status).toBe(403);
    }));

  it('save-toggle-rules: a stale version answers 409', () =>
    given(STALE, 'putToggleRules', 'save-toggle-rules', TOGGLE_REFUSAL).executeTest(
      async (server) => {
        const slug = param(STALE, 'putToggleRules', 'slug');
        const body = sent<SaveBody>(STALE, 'putToggleRules');
        const { response } = await at(server.url, () =>
          TOGGLE_RULES_SAVE.fetch({ path: { slug }, body }),
        );
        expect(response?.status).toBe(409);
      },
    ));
});
