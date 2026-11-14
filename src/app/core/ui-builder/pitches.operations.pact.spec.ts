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
import { PITCH, PITCH_VERSION, PITCHES } from './pitches.operations';

/**
 * The pitches' part of qits-landing-app's pact with qits-projects-service (qits-2158,
 * `pitches.operations.ts`), in `pacts/qits-landing-app_qits-projects-service.json` — the same
 * shared file the other projects specs own other operations of (`assertPactPart`).
 *
 * One state, `a project with a pitch` (qits-2155): one live pitch with two versions on the
 * repository `contract-app`, beside an archived one. The UI builder's Pitched tab lists the
 * project's pitches as recorded, by project only (`show-ui-builder-pitches`), reads the chosen
 * one's versions (`show-ui-builder-pitch-versions`) and draws a version's HTML
 * (`show-ui-builder-pitch-version`). That read is recorded as `latest`, so the pact binds `latest`:
 * the page reads the newest version so, and an older one by its number through the same operation
 * and answer shape, which no recording holds yet. Each test runs the operation's own `fetch`; the
 * interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listPitches', 'getPitch', 'getPitchVersion'];

const STATE = 'a project with a pitch';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pitches-pact-'));
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

describe('qits-landing-app → qits-projects-service pact: the pitches', () => {
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

  it('declares the provider this spec binds', () => {
    expect(PITCHES.provider).toBe(PROVIDER);
    expect(PITCH.provider).toBe(PROVIDER);
    expect(PITCH_VERSION.provider).toBe(PROVIDER);
  });

  it('show-ui-builder-pitches: the Pitched tab lists the project’s pitches, by project only', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: PITCHES.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-ui-builder-pitches' },
      consumes: PITCHES.consumes,
    }).executeTest(async (server) => {
      const { projectId } = masters.operation(STATE, 'listPitches').params;
      const { data, error } = await at(server.url, () =>
        PITCHES.fetch({ query: { project: projectId } }),
      );
      expect(error).toBeUndefined();
      const recorded = masters.body(STATE, 'listPitches').pitches;
      expect(data?.pitches).toHaveLength(recorded.length);
      const [pitch] = data!.pitches;
      expect(pitch.screenshot).toBe(recorded[0].screenshot);
      expect(pitch.archivedAt).toBeNull();
      expect(typeof pitch.title).toBe('string');
      expect(typeof pitch.manifestVersion).toBe('string');
    }));

  it('show-ui-builder-pitch-versions: the version picker reads the pitch’s versions', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: PITCH.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-ui-builder-pitch-versions' },
      consumes: PITCH.consumes,
    }).executeTest(async (server) => {
      const { pitchId } = masters.operation(STATE, 'getPitch').params;
      const { data, error } = await at(server.url, () => PITCH.fetch({ path: { id: pitchId } }));
      expect(error).toBeUndefined();
      const recorded = masters.body(STATE, 'getPitch');
      expect(data?.latestVersion).toBe(recorded.latestVersion);
      // The pact binds the list at its recorded length, each entry by type.
      expect(data?.versions).toHaveLength(recorded.versions.length);
      for (const version of data?.versions ?? []) {
        expect(typeof version.number).toBe('number');
        expect(typeof version.createdAt).toBe('string');
      }
    }));

  it('show-ui-builder-pitch-version: the frame draws the newest version’s HTML, as latest', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: PITCH_VERSION.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-ui-builder-pitch-version' },
      consumes: PITCH_VERSION.consumes,
    }).executeTest(async (server) => {
      const { pitchId } = masters.operation(STATE, 'getPitchVersion').params;
      const { data, error } = await at(server.url, () =>
        PITCH_VERSION.fetch({ path: { id: pitchId, number: 'latest' } }),
      );
      expect(error).toBeUndefined();
      expect(data?.html).toBe(masters.body(STATE, 'getPitchVersion').html);
      expect(data?.number).toBe(masters.body(STATE, 'getPitchVersion').number);
    }));
});
