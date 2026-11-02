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
  readonly combine: 'AND' | 'OR';
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
 * `enters` is "null where [the phase] moves nothing" (`DispatchPhase`'s own doc comment): REPORTED's
 * `refine`, IMPLEMENTING's own `implement` and VERIFYING's own `verify` all record it null, while the
 * very same field is a status word everywhere else in the very same `flow` (REPORTED's `implement`
 * and `verify`, say). `endsIn`, `from` and `phase` carry no such comment and qits-projects' golden
 * master, today's and the one it is about to record, never nulls them. One representative element
 * cannot speak for a whole `flow`, so `enters` is matched by type-or-null everywhere, not just where
 * today's representative happens to show null.
 */
const MAYBE_NULL: ReadonlySet<keyof DispatchPhase> = new Set(['enters']);

/**
 * `addGoldenInteraction` pins every `phases.<STATUS>.flow` array to the length qits-projects
 * happened to record: `type`, min = max = that length, and a `flow` recorded empty gets no rule at
 * all, so it is matched as exactly `[]`. qits-projects is about to lengthen `REPORTED.flow` and give
 * `REFINED.flow` its first phase (qits-1075), and the registry may grow other flows the same way
 * later, so this reshapes every `flow` to `type`, min 0, no max, each element's fields still matched
 * by type (or, for `enters`, by type-or-null: see `MAYBE_NULL`).
 *
 * Runs on the pact this spec just generated, between the mock server answering (with qits-projects'
 * real recording, unchanged) and `assertPactPart` comparing or committing the result: it only
 * loosens what the committed pact asks a provider to match, not what the store under test read.
 *
 * A `flow` recorded empty has no element to read a shape from, so it borrows `READY_FOR_DEV`'s first
 * one — the one status whose own flow never records a null field. The same borrow replaces a
 * recorded element at position 0 whose `enters` is null (REPORTED's, today): a provider verifies
 * every element past the recorded length against position 0 alone, so a null there would read
 * every later, non-null `enters` as a type mismatch (see `openEndedArchetype`).
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
    interaction.response.body.content.archetypes.forEach((archetype, i) => {
      openEndedArchetype(archetype, variants[i].rules);
      openEndedTransitions(variants[i].rules);
      if (archetype.archetype === 'CAMPAIGN') openEndedCampaign(archetype, variants[i].rules);
    });
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}

/**
 * `addGoldenInteraction` also pins every `transitions.<STATUS>` array whose moves share one shape
 * today (no move there carries `gates`) to the length qits-projects happened to record: `type`,
 * min = max = that length. qits-projects is about to add a CLOSE move to several statuses of
 * CAMPAIGN, EPIC and FEATURE (qits-1757), and the store never relies on an exact move count (only
 * on the moves it finds), so this drops the max and keeps the recorded count as a floor. A status
 * whose moves already differ in shape (REFINED everywhere; REPORTED for EPIC and TICKET, where one
 * move alone carries `gates`) is matched with `arrayContains` already, which pins no length, so it
 * is left as `addGoldenInteraction` built it. CAMPAIGN's transitions are reshaped further, see
 * `openEndedCampaign`.
 */
function openEndedTransitions(rules: Rules): void {
  for (const [path, rule] of Object.entries(rules)) {
    if (!/^\$\.transitions\.[A-Z_]+$/.test(path)) continue;
    const matcher = rule.matchers.find((m) => m.match === 'type');
    if (!matcher || matcher.min == null || matcher.max == null) continue;
    delete matcher.max;
  }
}

/**
 * qits-650 derives a campaign's status from its members and leaves it two manual moves: DROP from
 * every status that is neither DONE nor DROPPED, REOPEN from DROPPED, and nothing from DONE. The
 * FORWARD, BACK and CLOSE moves (and their `gates`) recorded today go, so every recorded
 * `transitions.<STATUS>` of CAMPAIGN is reshaped to `type`, min 0, no max, each move's `to` and
 * `kind` matched by type, and none required to carry `gates`. The store only offers the moves it
 * finds, so no count or kind is relied on.
 *
 * A provider verifies every element past the recorded length against element 0 alone, and
 * `arrayContains` would still demand a move with `gates`, so each status's recorded moves are
 * collapsed to one gate-less representative (`to`, `kind`): a move whose `gates` the provider adds
 * (today's) is an unexpected key, which a response may carry, while one without (after qits-650)
 * matches it outright. A status recorded empty (DONE) is left with no rule at all, so it is still
 * matched as exactly `[]`, which it is before and after qits-650.
 */
function openEndedCampaign(archetype: DeclaredArchetype, rules: Rules): void {
  for (const [status, moves] of Object.entries(archetype.transitions ?? {})) {
    if (moves.length === 0) continue;
    const path = `$.transitions.${status}`;
    for (const key of Object.keys(rules)) {
      if (key === path || key.startsWith(`${path}[`) || key.startsWith(`${path}.`)) {
        delete rules[key];
      }
    }
    const representative = moves.find((move) => !move.gates) ?? moves[0];
    moves.splice(0, moves.length, { to: representative.to, kind: representative.kind });
    rules[path] = { combine: 'AND', matchers: [{ match: 'type', min: 0 }] };
    rules[`${path}[*].to`] = { combine: 'AND', matchers: [{ match: 'type' }] };
    rules[`${path}[*].kind`] = { combine: 'AND', matchers: [{ match: 'type' }] };
  }
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
    } else if (flow[0].enters == null) {
      // A provider verifies every element an open-ended flow grows past its recorded length
      // against element 0 (not against the element whose own position it lands on), so a
      // null `enters` at position 0 would read every later, non-null `enters` as a type
      // mismatch despite the `OR(type, null)` rule below: `null` only ever excuses position 0
      // itself. Swap position 0 for a representative that never nulls it, exactly as an empty
      // flow is given one above; the mock server already answered the consumer with the real
      // recording before this runs, so this costs nothing it depends on.
      if (!template) throw new Error(`${status}: no recorded flow to open-end it with`);
      flow[0] = { ...template };
    }
    const path = `$.phases.${status}.flow`;
    rules[path] = { combine: 'AND', matchers: [{ match: 'type', min: 0 }] };
    for (const field of FLOW_FIELDS) {
      const key = `${path}[*].${field}`;
      rules[key] = MAYBE_NULL.has(field)
        ? { combine: 'OR', matchers: [{ match: 'type' }, { match: 'null' }] }
        : { combine: 'AND', matchers: [{ match: 'type' }] };
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
