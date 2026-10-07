import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import type { DeclaredArchetype, DispatchPhase } from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { LIST_WORK_ARCHETYPES } from './archetypes.consumes';
import { ArchetypesStore } from './archetypes.store';

/**
 * `ArchetypesStore`'s part of qits-landing-app's pact with qits-projects-service (epics qits-112,
 * qits-965): the `listWorkArchetypes` interaction, in the same file as the other stores'
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * The test drives `load()`, as the work item page does, against a pact mock server answering with
 * qits-projects' golden master, binding only the fields in `archetypes.consumes.ts`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listWorkArchetypes'];
const STATE = 'the archetype registry';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-archetypes-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** One pact matcher spec, e.g. `{ match: 'type', min: 0 }`. */
interface Matcher {
  readonly match: string;
  min?: number;
  max?: number;
  readonly variants?: readonly { readonly index: number; readonly rules: Rules }[];
}
/** One body path's rule, e.g. `$.phases.REPORTED.flow`. */
interface Rule {
  readonly combine: 'AND';
  matchers: Matcher[];
}
type Rules = Record<string, Rule>;
interface GeneratedPact {
  readonly interactions: readonly {
    readonly comments?: {
      readonly references?: { readonly ['qits-call']?: { readonly operationId?: string } };
    };
    readonly response: {
      readonly body: { readonly content: { archetypes: DeclaredArchetype[] } };
      readonly matchingRules: { readonly body: Rules };
    };
  }[];
}

const FLOW_FIELDS: readonly (keyof DispatchPhase)[] = ['endsIn', 'enters', 'from', 'phase'];

/**
 * `addGoldenInteraction` pins every `phases.<STATUS>.flow` array to the length qits-projects
 * happened to record: `type`, min = max = that length, and a `flow` recorded empty gets no rule at
 * all, so it is matched as exactly `[]`. qits-projects is about to lengthen `REPORTED.flow` and give
 * `REFINED.flow` its first phase (qits-1075), and the registry may grow other flows the same way
 * later, so this reshapes every `flow` to `type`, min 0, no max, each element's fields still matched
 * by type.
 *
 * Runs on the pact this spec just generated, between the mock server answering (with qits-projects'
 * real recording, unchanged) and `assertPactPart` comparing or committing the result: it only
 * loosens what the committed pact asks a provider to match, not what the store under test read.
 *
 * A `flow` recorded empty has no element to read a shape from, so it borrows `READY_FOR_DEV`'s first
 * one — the one status whose own flow never records a null field.
 */
function openEndedFlow(generated: string): void {
  const written = JSON.parse(readFileSync(generated, 'utf8')) as GeneratedPact;
  for (const interaction of written.interactions) {
    if (interaction.comments?.references?.['qits-call']?.operationId !== 'listWorkArchetypes') {
      continue;
    }
    const archetypesRule = interaction.response.matchingRules.body['$.archetypes'];
    const variants = archetypesRule.matchers.find((m) => m.match === 'arrayContains')?.variants;
    if (!variants) {
      throw new Error(
        'listWorkArchetypes no longer matches archetypes by shape: update openEndedFlow',
      );
    }
    interaction.response.body.content.archetypes.forEach((archetype, i) =>
      openEndedArchetype(archetype, variants[i].rules),
    );
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}

function openEndedArchetype(archetype: DeclaredArchetype, rules: Rules): void {
  const phases = archetype.phases;
  if (!phases) return;
  const template = phases['READY_FOR_DEV']?.flow?.[0];
  for (const [status, phase] of Object.entries(phases)) {
    const flow = (phase.flow ??= []);
    if (flow.length === 0) {
      if (!template) throw new Error(`${status}: no recorded flow to open-end it with`);
      flow.push({ ...template });
    }
    const path = `$.phases.${status}.flow`;
    rules[path] = { combine: 'AND', matchers: [{ match: 'type', min: 0 }] };
    for (const field of FLOW_FIELDS) {
      const key = `${path}[*].${field}`;
      if (flow[0][field] == null) delete rules[key];
      else rules[key] = { combine: 'AND', matchers: [{ match: 'type' }] };
    }
  }
}

describe('qits-landing-app → qits-projects-service pact: archetypes', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
    try {
      const generated = join(dir, `${CONSUMER}-${PROVIDER}.json`);
      openEndedFlow(generated);
      assertPactPart(generated, COMMITTED, OPERATIONS, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-work-item-actions: the store loads the archetype registry', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'listWorkArchetypes',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item-actions' },
      consumes: LIST_WORK_ARCHETYPES,
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
