import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import type { MilestoneGroupSpec } from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  LIST_PROJECT_MILESTONES,
  MEMBER_MILESTONES,
  MILESTONE,
  WORK_MILESTONES,
} from './milestones.consumes';
import { MilestonesStore } from './milestones.store';

/**
 * `MilestonesStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-615),
 * in `pacts/qits-landing-app_qits-projects-service.json` beside the other stores' parts:
 *
 * - "a ticket waiting on an unmet milestone": `listProjectMilestones` (the Milestones page and the
 *   pickers), `getMilestone`, `createMilestone` (one ENTITY_STATUS criterion), `renameMilestone`,
 *   `setMilestoneGroups` (an approval kept by id, OR a new ENTITY_STATUS group),
 *   `approveMilestoneCriterion` (with a note), `attachWorkMilestone` and `detachWorkMilestone`.
 * - "a ticket waiting on a met milestone": `listProjectMilestones` (a met and an unmet one) and
 *   `getMilestone` (met by an approval).
 * - "a campaign member waiting on a milestone": `getMilestone` (needed by a membership) and
 *   `setWorkMemberMilestones` (two milestones).
 *
 * Each test drives the store's own method with what the recording sent (a body's `{param}` is
 * sent as it is, and the provider fills it in from the state), against a pact mock server
 * answering with qits-projects' golden master, binding the fields the store's lists name that the
 * recording holds (`heldBy`: an `evidence` or `approval` recorded as `null` binds nothing below
 * it). Array lengths bind as recorded, and a list whose elements differ in which fields are null
 * (a met and an unmet milestone) binds one variant per shape (`arrayContaining`), so the store
 * relies on neither. The `met=` query has no recording: the page filters the one answer itself.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  'listProjectMilestones',
  'getMilestone',
  'createMilestone',
  'renameMilestone',
  'setMilestoneGroups',
  'approveMilestoneCriterion',
  'attachWorkMilestone',
  'detachWorkMilestone',
  'setWorkMemberMilestones',
];

const UNMET = 'a ticket waiting on an unmet milestone';
const MET = 'a ticket waiting on a met milestone';
const MEMBER = 'a campaign member waiting on a milestone';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-milestones-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (
  state: string,
  operationId: string,
  interaction: InteractionSlug,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes: heldBy(masters, state, operationId, consumes),
  });

/** The store, calling the mock server through a real HttpClient. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(MilestonesStore);
}

const params = (state: string, operationId: string) => masters.operation(state, operationId).params;
const sent = <T>(state: string, operationId: string) =>
  masters.operation(state, operationId).body as T;

describe('qits-landing-app → qits-projects-service pact: milestones', () => {
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

  it('list-milestones: a project’s milestones, none met', () =>
    given(UNMET, 'listProjectMilestones', 'list-milestones', LIST_PROJECT_MILESTONES).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const projectId = params(UNMET, 'listProjectMilestones')['projectId'];
        await store.loadList(projectId);
        const list = store.listOf(projectId);
        expect(list?.status).toBe('loaded');
        expect(list?.milestones[0]?.displayName).toBe('bootstrap test node');
        expect(list?.milestones[0]?.satisfiedAt).toBeNull();
      },
    ));

  it('list-milestones: a met milestone beside an unmet one', () =>
    given(MET, 'listProjectMilestones', 'list-milestones', LIST_PROJECT_MILESTONES).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const projectId = params(MET, 'listProjectMilestones')['projectId'];
        await store.loadList(projectId);
        const milestones = store.listOf(projectId)?.milestones ?? [];
        expect(milestones.some((m) => !!m.satisfiedAt)).toBe(true);
      },
    ));

  for (const state of [UNMET, MET, MEMBER]) {
    it(`show-milestone: the milestone of ${state}`, () =>
      given(state, 'getMilestone', 'show-milestone', MILESTONE).executeTest(async (server) => {
        const store = storeAt(server.url);
        const id = params(state, 'getMilestone')['milestoneId'];
        await store.load(id);
        const milestone = store.of(id)?.milestone;
        expect(milestone?.displayName).toBeTruthy();
        expect(milestone?.groups?.[0]?.criteria?.[0]?.kind).toBe('APPROVAL');
      }));
  }

  it('create-milestone: a name and one criterion make a milestone', () =>
    given(UNMET, 'createMilestone', 'create-milestone', MILESTONE).executeTest(async (server) => {
      const store = storeAt(server.url);
      const body = sent<{ displayName: string; groups: MilestoneGroupSpec[] }>(
        UNMET,
        'createMilestone',
      );
      const outcome = await store.create(
        params(UNMET, 'createMilestone')['projectId'],
        body.displayName,
        body.groups,
      );
      expect(outcome.ok && outcome.value.displayName).toBe(body.displayName);
    }));

  it('rename-milestone: a milestone takes a new name', () =>
    given(UNMET, 'renameMilestone', 'rename-milestone', MILESTONE).executeTest(async (server) => {
      const store = storeAt(server.url);
      const body = sent<{ displayName: string }>(UNMET, 'renameMilestone');
      const outcome = await store.rename(
        params(UNMET, 'renameMilestone')['milestoneId'],
        body.displayName,
      );
      expect(outcome.ok && outcome.value.displayName).toBe(body.displayName);
    }));

  it('edit-milestone-criteria: the whole condition, an approval kept OR a work item done', () =>
    given(UNMET, 'setMilestoneGroups', 'edit-milestone-criteria', MILESTONE).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const body = sent<{ groups: MilestoneGroupSpec[] }>(UNMET, 'setMilestoneGroups');
        const outcome = await store.setGroups(
          params(UNMET, 'setMilestoneGroups')['milestoneId'],
          body.groups,
        );
        expect(outcome.ok && outcome.value.groups?.length).toBe(2);
      },
    ));

  it('approve-milestone-criterion: a person approves, with a note', () =>
    given(UNMET, 'approveMilestoneCriterion', 'approve-milestone-criterion', MILESTONE).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const { milestoneId, criterionId } = params(UNMET, 'approveMilestoneCriterion');
        const body = sent<{ note: string }>(UNMET, 'approveMilestoneCriterion');
        const outcome = await store.approve(milestoneId, criterionId, body.note);
        expect(outcome.ok && outcome.value.groups?.[0]?.criteria?.[0]?.approval?.note).toBe(
          body.note,
        );
      },
    ));

  it('attach-work-milestone: a ticket needs one more milestone', () =>
    given(UNMET, 'attachWorkMilestone', 'attach-work-milestone', WORK_MILESTONES).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const { qualifiedId, otherMilestoneId } = params(UNMET, 'attachWorkMilestone');
        const outcome = await store.attach(qualifiedId, otherMilestoneId);
        expect(outcome.ok && outcome.value.milestones?.length).toBeGreaterThan(0);
      },
    ));

  it('detach-work-milestone: a ticket no longer needs its milestone', () =>
    given(UNMET, 'detachWorkMilestone', 'detach-work-milestone', WORK_MILESTONES).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const { qualifiedId, milestoneId } = params(UNMET, 'detachWorkMilestone');
        const outcome = await store.detach(qualifiedId, milestoneId);
        expect(outcome.ok && outcome.value.milestones).toEqual([]);
      },
    ));

  it('set-member-milestones: a membership needs two milestones', () =>
    given(
      MEMBER,
      'setWorkMemberMilestones',
      'set-member-milestones',
      MEMBER_MILESTONES,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { qualifiedId, membershipId } = params(MEMBER, 'setWorkMemberMilestones');
      const body = sent<{ milestoneIds: string[] }>(MEMBER, 'setWorkMemberMilestones');
      const outcome = await store.setMemberMilestones(qualifiedId, membershipId, body.milestoneIds);
      expect(outcome.ok && outcome.value.member?.milestones?.length).toBe(2);
    }));
});
